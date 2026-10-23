import { useEffect, useRef, useState } from 'react';
import { SendHorizonal, X, Image as ImageIcon, Loader2, Mic, Trash2, Check } from 'lucide-react';
import api, { uploadMedia, errorMessage } from '../lib/api';
import Avatar from './Avatar.jsx';

const typingText = (names) => {
  if (names.length === 1) return `${names[0]} is typing`;
  if (names.length === 2) return `${names[0]} and ${names[1]} are typing`;
  return 'Several people are typing';
};

export default function Composer({
  roomName,
  isDm,
  isGroup,
  members = [],
  onSend,
  onTyping,
  typingNames = [],
  disabled,
  replyTo,
  onCancelReply,
}) {
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [attachment, setAttachment] = useState(null); // { file, previewUrl, uploading, data }
  const [mentions, setMentions] = useState([]); // array of user IDs
  const [mentionQuery, setMentionQuery] = useState(null); // string | null (when typing @...)
  const [userSuggestions, setUserSuggestions] = useState([]);
  const [recording, setRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);

  const ref = useRef(null);
  const fileInputRef = useRef(null);
  const stopTimer = useRef(null);
  const isTyping = useRef(false);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recordingTimerRef = useRef(null);

  useEffect(() => {
    if (replyTo) ref.current?.focus();
  }, [replyTo]);

  // Load mention suggestions dynamically
  useEffect(() => {
    if (mentionQuery === null) {
      setUserSuggestions([]);
      return undefined;
    }

    if (members && members.length > 0) {
      const q = mentionQuery.toLowerCase();
      const filtered = members.filter((m) => !q || m.name.toLowerCase().includes(q));
      setUserSuggestions(filtered);
      return undefined;
    }

    // In public channels where members list is dynamic, fetch users from API
    let cancelled = false;
    api
      .get('/users', { params: { q: mentionQuery } })
      .then(({ data }) => {
        if (!cancelled) setUserSuggestions(data);
      })
      .catch(() => {
        if (!cancelled) setUserSuggestions([]);
      });

    return () => {
      cancelled = true;
    };
  }, [mentionQuery, members]);

  const stopTyping = () => {
    clearTimeout(stopTimer.current);
    if (isTyping.current) {
      isTyping.current = false;
      onTyping(false);
    }
  };

  const change = (e) => {
    const val = e.target.value;
    setText(val);
    setError('');
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;

    // Check for @mention trigger
    const cursorPos = e.target.selectionStart;
    const textBefore = val.slice(0, cursorPos);
    const atMatch = textBefore.match(/@([\w\d_]*)$/);
    if (atMatch) {
      setMentionQuery(atMatch[1].toLowerCase());
    } else {
      setMentionQuery(null);
    }

    if (!isTyping.current) {
      isTyping.current = true;
      onTyping(true);
    }
    clearTimeout(stopTimer.current);
    stopTimer.current = setTimeout(stopTyping, 2000);
  };

  const pickMention = (user) => {
    const cursorPos = ref.current?.selectionStart || text.length;
    const textBefore = text.slice(0, cursorPos);
    const textAfter = text.slice(cursorPos);
    const replaced = textBefore.replace(/@[\w\d_]*$/, `@${user.name} `);

    setText(replaced + textAfter);
    setMentions((prev) => (prev.includes(user._id) ? prev : [...prev, user._id]));
    setMentionQuery(null);
    ref.current?.focus();
  };

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 15 * 1024 * 1024) {
      setError('File size must be under 15MB');
      return;
    }

    const previewUrl = URL.createObjectURL(file);
    setAttachment({
      file,
      previewUrl,
      uploading: true,
      data: null,
    });
    setError('');

    try {
      const data = await uploadMedia(file);
      setAttachment((prev) => (prev ? { ...prev, uploading: false, data } : null));
    } catch (err) {
      setError(errorMessage(err));
      setAttachment(null);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const removeAttachment = () => {
    if (attachment?.previewUrl) {
      URL.revokeObjectURL(attachment.previewUrl);
    }
    setAttachment(null);
  };

  // Support pasting images from clipboard
  const handlePaste = (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          e.preventDefault();
          const fakeEvent = { target: { files: [file] } };
          handleFileSelect(fakeEvent);
          break;
        }
      }
    }
  };

  // --- Voice Notes Recording ---
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.start(100);
      setRecording(true);
      setRecordingTime(0);
      setError('');

      recordingTimerRef.current = setInterval(() => {
        setRecordingTime((s) => s + 1);
      }, 1000);
    } catch {
      setError('Microphone access denied or not supported.');
    }
  };

  const cancelRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stream.getTracks().forEach((track) => track.stop());
      mediaRecorderRef.current.stop();
    }
    clearInterval(recordingTimerRef.current);
    setRecording(false);
    setRecordingTime(0);
    audioChunksRef.current = [];
  };

  const sendVoiceNote = async () => {
    if (!mediaRecorderRef.current) return;
    const duration = recordingTime;
    clearInterval(recordingTimerRef.current);
    setRecording(false);
    setSending(true);

    mediaRecorderRef.current.onstop = async () => {
      mediaRecorderRef.current.stream.getTracks().forEach((track) => track.stop());
      const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
      const audioFile = new File([audioBlob], `voice-note-${Date.now()}.webm`, {
        type: 'audio/webm',
      });

      try {
        const uploaded = await uploadMedia(audioFile);
        await onSend('', null, { url: uploaded.url, duration, publicId: uploaded.publicId });
      } catch (err) {
        setError(errorMessage(err));
      } finally {
        setSending(false);
        setRecordingTime(0);
        audioChunksRef.current = [];
      }
    };

    mediaRecorderRef.current.stop();
  };

  const submit = async () => {
    const clean = text.trim();
    if ((!clean && !attachment?.data) || sending || disabled || attachment?.uploading) return;

    setSending(true);
    stopTyping();

    const res = await onSend(clean, attachment?.data, null, mentions);
    setSending(false);

    if (res.ok) {
      setText('');
      setMentions([]);
      removeAttachment();
      if (ref.current) ref.current.style.height = 'auto';
      ref.current?.focus();
    } else {
      setError(res.error || 'Could not send message');
    }
  };

  const onKeyDown = (e) => {
    if (e.key === 'Escape') {
      if (mentionQuery !== null) setMentionQuery(null);
      else if (replyTo) onCancelReply();
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && mentionQuery === null) {
      e.preventDefault();
      submit();
    }
  };

  const placeholder = roomName
    ? isDm
      ? `Message ${roomName}`
      : isGroup
      ? `Message ${roomName}`
      : `Message #${roomName}`
    : 'Message';

  const canSend = (text.trim() || attachment?.data) && !sending && !disabled && !attachment?.uploading;

  return (
    <div className="composer">
      <div className="composer-inner">
        <div className="typing-row" aria-live="polite">
          {typingNames.length > 0 && (
            <>
              <span className="tw">
                {[0, 1, 2, 3, 4].map((i) => (
                  <i key={i} style={{ animationDelay: `${i * 0.12}s` }} />
                ))}
              </span>
              {typingText(typingNames)}
            </>
          )}
        </div>

        {replyTo && (
          <div className="reply-bar">
            <div>
              <strong>Replying to {replyTo.sender.name}</strong>
              <span>
                {replyTo.text ||
                  (replyTo.audio ? '🎤 Voice message' : replyTo.attachment ? '🖼️ Attachment' : '')}
              </span>
            </div>
            <button className="icon-btn sm" onClick={onCancelReply} aria-label="Cancel reply">
              <X size={16} />
            </button>
          </div>
        )}

        {attachment && (
          <div className="attachment-preview">
            <div className="attachment-thumb">
              {attachment.uploading && (
                <div className="attachment-spinner">
                  <Loader2 size={20} className="spin" />
                </div>
              )}
              {attachment.file.type.startsWith('image/') ? (
                <img src={attachment.previewUrl} alt="Upload preview" />
              ) : (
                <div className="attachment-file-box">{attachment.file.name}</div>
              )}
              <button
                type="button"
                className="attachment-close"
                onClick={removeAttachment}
                aria-label="Remove attachment"
              >
                <X size={14} />
              </button>
            </div>
          </div>
        )}

        {/* Mentions Autocomplete Popover */}
        {mentionQuery !== null && userSuggestions.length > 0 && (
          <div className="mentions-popover" role="listbox">
            <div className="mentions-header">Mention a user</div>
            {userSuggestions.slice(0, 6).map((u) => (
              <button
                key={u._id}
                type="button"
                className="mention-row"
                onClick={() => pickMention(u)}
              >
                <Avatar name={u.name} color={u.color} size={22} />
                <span className="mention-name">{u.name}</span>
              </button>
            ))}
          </div>
        )}

        <div className="composer-box">
          {recording ? (
            /* Voice Recording Interface */
            <div className="voice-recording-bar">
              <div className="voice-rec-indicator">
                <span className="rec-pulse" />
                <span className="mono">
                  {Math.floor(recordingTime / 60)}:
                  {recordingTime % 60 < 10 ? '0' : ''}
                  {recordingTime % 60}
                </span>
                <span className="rec-label">Recording audio…</span>
              </div>

              <div className="voice-rec-actions">
                <button
                  type="button"
                  className="icon-btn danger"
                  onClick={cancelRecording}
                  title="Cancel recording"
                  aria-label="Cancel recording"
                >
                  <Trash2 size={18} />
                </button>
                <button
                  type="button"
                  className="send sm"
                  onClick={sendVoiceNote}
                  title="Send voice note"
                  aria-label="Send voice note"
                >
                  <Check size={18} />
                </button>
              </div>
            </div>
          ) : (
            /* Normal Text Input Interface */
            <>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileSelect}
                style={{ display: 'none' }}
                accept="image/*,video/mp4"
              />
              <button
                type="button"
                className="icon-btn composer-attach"
                onClick={() => fileInputRef.current?.click()}
                title="Attach media or image"
                aria-label="Attach file"
                disabled={disabled || attachment?.uploading}
              >
                <ImageIcon size={19} />
              </button>

              <button
                type="button"
                className="icon-btn composer-attach"
                onClick={startRecording}
                title="Record voice note"
                aria-label="Record voice note"
                disabled={disabled}
              >
                <Mic size={19} />
              </button>

              <textarea
                ref={ref}
                rows={1}
                value={text}
                onChange={change}
                onKeyDown={onKeyDown}
                onPaste={handlePaste}
                onBlur={stopTyping}
                placeholder={placeholder}
                maxLength={2000}
                disabled={disabled}
                aria-label="Message"
              />

              <button
                className="send"
                onClick={submit}
                disabled={!canSend}
                aria-label="Send message"
              >
                {sending ? <Loader2 size={18} className="spin" /> : <SendHorizonal size={18} />}
              </button>
            </>
          )}
        </div>
        {error && <p className="composer-error" role="alert">{error}</p>}
      </div>
    </div>
  );
}
