import { useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import {
  Mic,
  MicOff,
  Video as VideoIcon,
  VideoOff,
  Monitor,
  PhoneOff,
  Minimize2,
  Maximize2,
} from 'lucide-react';
import Avatar from './Avatar.jsx';

const formatDuration = (sec) => {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
};

export default function CallModal({
  callState,
  callInfo,
  localStream,
  remoteStream,
  audioMuted,
  videoMuted,
  remoteVideoMuted,
  isScreenSharing,
  minimized,
  callDuration,
  onToggleMic,
  onToggleCamera,
  onToggleScreenShare,
  onToggleMinimize,
  onEndCall,
}) {
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);

  useEffect(() => {
    const el = localVideoRef.current;
    if (el && localStream) {
      el.srcObject = localStream;
      el.play?.().catch(() => {});
    }
  }, [localStream, videoMuted, isScreenSharing]);

  useEffect(() => {
    const el = remoteVideoRef.current;
    if (el && remoteStream) {
      el.srcObject = remoteStream;
      el.play?.().catch((err) => {
        console.warn('Autoplay error on remote video:', err);
      });
    }
  }, [remoteStream, remoteVideoMuted]);

  if (callState === 'idle' || callState === 'incoming') return null;

  const isVideo = callInfo?.isVideo || isScreenSharing;
  const isCalling = callState === 'calling';
  const other = callInfo?.otherUser || callInfo?.caller || { name: 'Contact', color: '#ffb547' };

  // Detect if remote stream has an active video track
  const hasRemoteVideo =
    Boolean(remoteStream) &&
    !isCalling &&
    !remoteVideoMuted &&
    remoteStream.getVideoTracks().length > 0 &&
    remoteStream.getVideoTracks().some((t) => t.enabled);

  return (
    <div className={`call-viewport ${minimized ? 'minimized' : ''}`}>
      <motion.div
        className="call-card"
        initial={{ opacity: 0, scale: 0.94 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.94 }}
        transition={{ type: 'spring', damping: 26, stiffness: 320 }}
      >
        {/* Top Header */}
        <div className="call-top">
          <div className="call-participant">
            <span className="call-status-dot" />
            <span className="call-name">{other.name}</span>
            <span className="call-time mono">
              {isCalling ? 'Calling…' : formatDuration(callDuration)}
            </span>
          </div>

          <button
            type="button"
            className="call-top-btn"
            onClick={onToggleMinimize}
            title={minimized ? 'Expand call' : 'Minimize call'}
            aria-label={minimized ? 'Expand call' : 'Minimize call'}
          >
            {minimized ? <Maximize2 size={16} /> : <Minimize2 size={16} />}
          </button>
        </div>

        {/* Video / Visual Stage */}
        <div
          className="call-stage"
          onClick={() => {
            if (remoteVideoRef.current) {
              remoteVideoRef.current.play?.().catch(() => {});
            }
          }}
        >
          {/* Remote Video or Fallback Avatar */}
          {hasRemoteVideo ? (
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              onLoadedMetadata={(e) => e.target.play().catch(() => {})}
              className="remote-video"
            />
          ) : (
            <div className="call-avatar-stage">
              <div className={`call-avatar-glow ${isCalling ? 'pulse' : ''}`}>
                <Avatar name={other.name} color={other.color} size={minimized ? 56 : 96} />
              </div>
              {!minimized && (
                <div className="stage-status">
                  <h3>{other.name}</h3>
                  <p>
                    {isCalling
                      ? 'Ringing...'
                      : remoteVideoMuted
                      ? 'Camera turned off'
                      : isVideo
                      ? 'Connecting video…'
                      : 'Audio call connected'}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Local Video Picture-in-Picture (Only in video calls and not minimized) */}
          {isVideo && localStream && !videoMuted && !minimized && (
            <div className="local-video-pip">
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                onLoadedMetadata={(e) => e.target.play().catch(() => {})}
                className="local-video"
              />
            </div>
          )}
        </div>

        {/* Controls Bar */}
        <div className="call-controls">
          <button
            type="button"
            className={`ctrl-btn ${audioMuted ? 'off' : ''}`}
            onClick={onToggleMic}
            title={audioMuted ? 'Unmute microphone' : 'Mute microphone'}
            aria-label={audioMuted ? 'Unmute microphone' : 'Mute microphone'}
          >
            {audioMuted ? <MicOff size={18} /> : <Mic size={18} />}
          </button>

          {isVideo && (
            <button
              type="button"
              className={`ctrl-btn ${videoMuted ? 'off' : ''}`}
              onClick={onToggleCamera}
              title={videoMuted ? 'Turn camera on' : 'Turn camera off'}
              aria-label={videoMuted ? 'Turn camera on' : 'Turn camera off'}
            >
              {videoMuted ? <VideoOff size={18} /> : <VideoIcon size={18} />}
            </button>
          )}

          {!isCalling && (
            <button
              type="button"
              className={`ctrl-btn ${isScreenSharing ? 'active' : ''}`}
              onClick={onToggleScreenShare}
              title={isScreenSharing ? 'Stop screen share' : 'Share screen'}
              aria-label={isScreenSharing ? 'Stop screen share' : 'Share screen'}
            >
              <Monitor size={18} />
            </button>
          )}

          <button
            type="button"
            className="ctrl-btn end"
            onClick={onEndCall}
            title="End call"
            aria-label="End call"
          >
            <PhoneOff size={20} />
          </button>
        </div>
      </motion.div>
    </div>
  );
}
