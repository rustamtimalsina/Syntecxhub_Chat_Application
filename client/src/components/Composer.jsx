import { useEffect, useRef, useState } from 'react';
import { SendHorizonal, X, Image as ImageIcon, Loader2 } from 'lucide-react';
import { uploadMedia, errorMessage } from '../lib/api';

const typingText = (names) => {
  if (names.length === 1) return `${names[0]} is typing`;
  if (names.length === 2) return `${names[0]} and ${names[1]} are typing`;
  return 'Several people are typing';
};

export default function Composer({
  roomName,
  isDm,
  isGroup,
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
  const ref = useRef(null);
  const fileInputRef = useRef(null);
  const stopTimer = useRef(null);
  const isTyping = useRef(false);

  useEffect(() => {
    if (replyTo) ref.current?.focus();
  }, [replyTo]);

  const stopTyping = () => {
    clearTimeout(stopTimer.current);
    if (isTyping.current) {
      isTyping.current = false;
      onTyping(false);
    }
  };

  const change = (e) => {
    setText(e.target.value);
    setError('');
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
    if (!isTyping.current) {
      isTyping.current = true;
      onTyping(true);
    }
    clearTimeout(stopTimer.current);
    stopTimer.current = setTimeout(stopTyping, 2000);
  };

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setError('File size must be under 10MB');
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

  const submit = async () => {
    const clean = text.trim();
    if ((!clean && !attachment?.data) || sending || disabled || attachment?.uploading) return;

    setSending(true);
    stopTyping();

    const res = await onSend(clean, attachment?.data);
    setSending(false);

    if (res.ok) {
      setText('');
      removeAttachment();
      if (ref.current) ref.current.style.height = 'auto';
      ref.current?.focus();
    } else {
      setError(res.error || 'Could not send message');
    }
  };

  const onKeyDown = (e) => {
    if (e.key === 'Escape' && replyTo) onCancelReply();
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
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
              <span>{replyTo.text || (replyTo.attachment ? 'Attachment' : '')}</span>
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

        <div className="composer-box">
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
        </div>
        {error && <p className="composer-error" role="alert">{error}</p>}
      </div>
    </div>
  );
}
