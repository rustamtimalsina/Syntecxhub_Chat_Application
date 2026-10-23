import { useCallback, useEffect, useRef, useState } from 'react';
import {
  startRingtone,
  stopRingtone,
  playCallConnected,
  playCallEnded,
} from '../lib/sound';

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ],
};

// Safe helper to acquire media with graceful fallback
async function getMediaStream(wantVideo) {
  let stream = null;
  if (wantVideo) {
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: { width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      return { stream, isVideo: true };
    } catch (err) {
      console.warn('Camera failed/in use, falling back to audio only:', err);
    }
  }

  // Fallback to audio only
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    return { stream, isVideo: false };
  } catch (err) {
    console.warn('Microphone access failed:', err);
    // Silent empty media stream so connection doesn't instantly die
    return { stream: new MediaStream(), isVideo: false };
  }
}

export default function useCall(socket, currentUser) {
  // 'idle' | 'calling' | 'incoming' | 'connected'
  const [callState, setCallState] = useState('idle');
  const [callInfo, setCallInfo] = useState(null);
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [audioMuted, setAudioMuted] = useState(false);
  const [videoMuted, setVideoMuted] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [callDuration, setCallDuration] = useState(0);

  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const webcamTrackRef = useRef(null);
  const screenTrackRef = useRef(null);
  const durationTimerRef = useRef(null);
  const callInfoRef = useRef(null);
  const callStateRef = useRef('idle');
  const isInitiatorRef = useRef(false);
  const candidateQueueRef = useRef([]);

  useEffect(() => {
    callInfoRef.current = callInfo;
  }, [callInfo]);

  useEffect(() => {
    callStateRef.current = callState;
  }, [callState]);

  // Clean up all media tracks and peer connection
  const cleanup = useCallback(() => {
    stopRingtone();
    if (durationTimerRef.current) {
      clearInterval(durationTimerRef.current);
      durationTimerRef.current = null;
    }
    if (screenTrackRef.current) {
      screenTrackRef.current.stop();
      screenTrackRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    if (pcRef.current) {
      try {
        pcRef.current.close();
      } catch {}
      pcRef.current = null;
    }
    candidateQueueRef.current = [];
    setLocalStream(null);
    setRemoteStream(null);
    setCallState('idle');
    setCallInfo(null);
    setAudioMuted(false);
    setVideoMuted(false);
    setIsScreenSharing(false);
    setMinimized(false);
    setCallDuration(0);
    isInitiatorRef.current = false;
  }, []);

  // Reject Call
  const rejectCall = useCallback(() => {
    const info = callInfoRef.current;
    if (socket && info) {
      socket.emit('call:reject', {
        callId: info.callId,
        conversationId: info.conversationId,
      });
    }
    playCallEnded();
    cleanup();
  }, [socket, cleanup]);

  // End Call
  const endCall = useCallback(() => {
    const info = callInfoRef.current;
    if (socket && info) {
      socket.emit('call:end', {
        callId: info.callId,
        conversationId: info.conversationId,
      });
    }
    playCallEnded();
    cleanup();
  }, [socket, cleanup]);

  // Create WebRTC Peer Connection
  const createPeerConnection = useCallback(
    (callId, conversationId, targetUserId) => {
      if (pcRef.current) {
        try {
          pcRef.current.close();
        } catch {}
      }

      const pc = new RTCPeerConnection(ICE_SERVERS);
      pcRef.current = pc;

      // ICE candidates
      pc.onicecandidate = (event) => {
        if (event.candidate && socket) {
          socket.emit('call:ice-candidate', {
            callId,
            conversationId,
            candidate: event.candidate,
            toUserId: targetUserId,
          });
        }
      };

      // Remote media stream arrived
      pc.ontrack = (event) => {
        if (event.streams && event.streams[0]) {
          setRemoteStream(event.streams[0]);
        }
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'connected') {
          stopRingtone();
          playCallConnected();
          setCallState('connected');
          if (!durationTimerRef.current) {
            durationTimerRef.current = setInterval(() => {
              setCallDuration((sec) => sec + 1);
            }, 1000);
          }
        } else if (pc.connectionState === 'failed') {
          console.warn('WebRTC connection failed');
          cleanup();
        }
      };

      // Add local stream tracks to PC
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => {
          pc.addTrack(track, localStreamRef.current);
        });
      }

      return pc;
    },
    [socket, cleanup]
  );

  // 1. Start Outgoing Call
  const startCall = useCallback(
    async (conversationId, isVideo = false, otherUser = null) => {
      if (!socket || callStateRef.current !== 'idle') return;
      cleanup();

      const { stream, isVideo: actualVideo } = await getMediaStream(isVideo);
      localStreamRef.current = stream;
      setLocalStream(stream);
      webcamTrackRef.current = stream.getVideoTracks()[0] || null;

      socket.emit(
        'call:initiate',
        { conversationId, isVideo: actualVideo },
        (res) => {
          if (!res?.ok) {
            cleanup();
            return;
          }
          const info = {
            callId: res.callId,
            conversationId,
            isVideo: actualVideo,
            caller: currentUser,
            otherUser,
          };
          setCallInfo(info);
          setCallState('calling');
          isInitiatorRef.current = true;
          startRingtone();
        }
      );
    },
    [socket, currentUser, cleanup]
  );

  // 2. Accept Incoming Call
  const acceptCall = useCallback(async () => {
    const info = callInfoRef.current;
    if (!socket || !info || callStateRef.current !== 'incoming') return;
    stopRingtone();

    // Get user media with fallback (so camera lock between tabs doesn't fail)
    const { stream } = await getMediaStream(info.isVideo);
    localStreamRef.current = stream;
    setLocalStream(stream);
    webcamTrackRef.current = stream.getVideoTracks()[0] || null;

    // Create PC on receiver
    createPeerConnection(info.callId, info.conversationId, info.caller?._id);

    // Notify caller that receiver accepted
    socket.emit('call:accept', {
      callId: info.callId,
      conversationId: info.conversationId,
    });

    setCallState('connected');
    playCallConnected();
    if (!durationTimerRef.current) {
      durationTimerRef.current = setInterval(() => {
        setCallDuration((sec) => sec + 1);
      }, 1000);
    }
  }, [socket, createPeerConnection]);

  // Toggle Microphone
  const toggleMic = useCallback(() => {
    if (!localStreamRef.current) return;
    const audioTrack = localStreamRef.current.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      const muted = !audioTrack.enabled;
      setAudioMuted(muted);
      if (socket && callInfoRef.current) {
        socket.emit('call:toggle-media', {
          callId: callInfoRef.current.callId,
          conversationId: callInfoRef.current.conversationId,
          audioMuted: muted,
          videoMuted,
        });
      }
    }
  }, [socket, videoMuted]);

  // Toggle Camera
  const toggleCamera = useCallback(() => {
    if (!localStreamRef.current) return;
    const videoTrack = localStreamRef.current.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled;
      const muted = !videoTrack.enabled;
      setVideoMuted(muted);
      if (socket && callInfoRef.current) {
        socket.emit('call:toggle-media', {
          callId: callInfoRef.current.callId,
          conversationId: callInfoRef.current.conversationId,
          audioMuted,
          videoMuted: muted,
        });
      }
    }
  }, [socket, audioMuted]);

  // Toggle Screen Sharing
  const toggleScreenShare = useCallback(async () => {
    if (!pcRef.current || !localStreamRef.current) return;

    if (!isScreenSharing) {
      try {
        const displayStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
        });
        const screenTrack = displayStream.getVideoTracks()[0];
        screenTrackRef.current = screenTrack;

        const sender = pcRef.current
          .getSenders()
          .find((s) => s.track && s.track.kind === 'video');

        if (sender) {
          sender.replaceTrack(screenTrack);
        } else {
          pcRef.current.addTrack(screenTrack, localStreamRef.current);
        }

        screenTrack.onended = () => {
          if (webcamTrackRef.current && sender) {
            sender.replaceTrack(webcamTrackRef.current);
          }
          setIsScreenSharing(false);
        };

        setIsScreenSharing(true);
      } catch (err) {
        console.error('Screen share cancelled/failed:', err);
      }
    } else {
      if (screenTrackRef.current) {
        screenTrackRef.current.stop();
        screenTrackRef.current = null;
      }
      const sender = pcRef.current
        .getSenders()
        .find((s) => s.track && s.track.kind === 'video');
      if (sender && webcamTrackRef.current) {
        sender.replaceTrack(webcamTrackRef.current);
      }
      setIsScreenSharing(false);
    }
  }, [isScreenSharing]);

  // Socket event listeners for signaling
  useEffect(() => {
    if (!socket) return;

    // Incoming call from someone else
    const onIncoming = (data) => {
      if (callStateRef.current !== 'idle') {
        socket.emit('call:reject', {
          callId: data.callId,
          conversationId: data.conversationId,
        });
        return;
      }
      setCallInfo(data);
      setCallState('incoming');
      startRingtone();
    };

    // Call accepted by recipient
    const onAccepted = async (data) => {
      if (isInitiatorRef.current) {
        stopRingtone();
        const info = callInfoRef.current || data;
        const pc = createPeerConnection(
          info.callId,
          info.conversationId,
          data.user?._id
        );

        // Initiator creates WebRTC Offer
        try {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          socket.emit('call:signal', {
            callId: info.callId,
            conversationId: info.conversationId,
            signal: offer,
            toUserId: data.user?._id,
          });
        } catch (err) {
          console.error('Failed to create offer:', err);
          cleanup();
        }
      }
    };

    // Call rejected
    const onRejected = (data) => {
      if (callInfoRef.current?.callId === data.callId) {
        playCallEnded();
        cleanup();
      }
    };

    // WebRTC Signal (Offer / Answer)
    const onSignal = async (data) => {
      if (data.fromUserId === String(currentUser?._id)) return;
      const pc = pcRef.current;
      if (!pc) return;

      try {
        if (data.signal.type === 'offer') {
          await pc.setRemoteDescription(new RTCSessionDescription(data.signal));
          // Drain queued ICE candidates
          if (candidateQueueRef.current.length > 0) {
            for (const c of candidateQueueRef.current) {
              await pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
            }
            candidateQueueRef.current = [];
          }

          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socket.emit('call:signal', {
            callId: data.callId,
            conversationId: data.conversationId,
            signal: answer,
            toUserId: data.fromUserId,
          });
        } else if (data.signal.type === 'answer') {
          await pc.setRemoteDescription(new RTCSessionDescription(data.signal));
          // Drain queued ICE candidates
          if (candidateQueueRef.current.length > 0) {
            for (const c of candidateQueueRef.current) {
              await pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
            }
            candidateQueueRef.current = [];
          }
        }
      } catch (err) {
        console.error('Error handling signal:', err);
      }
    };

    // ICE Candidate
    const onIceCandidate = async (data) => {
      if (data.fromUserId === String(currentUser?._id)) return;
      const pc = pcRef.current;
      if (!pc) return;

      if (!pc.remoteDescription || !pc.remoteDescription.type) {
        // Queue candidates until remote description is set
        candidateQueueRef.current.push(data.candidate);
        return;
      }

      try {
        await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
      } catch (err) {
        console.warn('Error adding ICE candidate:', err);
      }
    };

    // Call ended by either party
    const onEnded = (data) => {
      if (!callInfoRef.current || callInfoRef.current.callId === data.callId) {
        playCallEnded();
        cleanup();
      }
    };

    socket.on('call:incoming', onIncoming);
    socket.on('call:accepted', onAccepted);
    socket.on('call:rejected', onRejected);
    socket.on('call:signal', onSignal);
    socket.on('call:ice-candidate', onIceCandidate);
    socket.on('call:ended', onEnded);

    return () => {
      socket.off('call:incoming', onIncoming);
      socket.off('call:accepted', onAccepted);
      socket.off('call:rejected', onRejected);
      socket.off('call:signal', onSignal);
      socket.off('call:ice-candidate', onIceCandidate);
      socket.off('call:ended', onEnded);
    };
  }, [
    socket,
    currentUser,
    createPeerConnection,
    cleanup,
  ]);

  return {
    callState,
    callInfo,
    localStream,
    remoteStream,
    audioMuted,
    videoMuted,
    isScreenSharing,
    minimized,
    callDuration,
    startCall,
    acceptCall,
    rejectCall,
    endCall,
    toggleMic,
    toggleCamera,
    toggleScreenShare,
    setMinimized,
  };
}
