import { useRef, useState } from 'react';
import { SendHorizonal } from 'lucide-react';

const typingText = (names) => {
  if (names.length === 1) return `${names[0]} is typing`;
  if (names.length === 2) return `${names[0]} and ${names[1]} are typing`;
  return 'Several people are typing';
};

export default function Composer({ roomName, isDm, onSend, onTyping, typingNames, disabled }) {
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const ref = useRef(null);
  const stopTimer = useRef(null);
  const isTyping = useRef(false);

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

  const submit = async () => {
    const clean = text.trim();
    if (!clean || sending || disabled) return;
    setSending(true);
    stopTyping();
    const res = await onSend(clean);
    setSending(false);
    if (res.ok) {
      setText('');
      if (ref.current) ref.current.style.height = 'auto';
      ref.current?.focus();
    } else {
      setError(res.error || 'Could not send message');
    }
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="composer">
      <div className="composer-inner">
        <div className="typing-row" aria-live="polite">
          {typingNames.length > 0 && (
            <>
              <span className="tw">
                {[0, 1, 2, 3, 4].map((i) => <i key={i} style={{ animationDelay: `${i * 0.12}s` }} />)}
              </span>
              {typingText(typingNames)}
            </>
          )}
        </div>

        <div className="composer-box">
          <textarea
            ref={ref}
            rows={1}
            value={text}
            onChange={change}
            onKeyDown={onKeyDown}
            onBlur={stopTyping}
            placeholder={roomName ? (isDm ? `Message ${roomName}` : `Message #${roomName}`) : 'Message'}
            maxLength={2000}
            disabled={disabled}
            aria-label="Message"
          />
          <button className="send" onClick={submit} disabled={!text.trim() || sending || disabled} aria-label="Send message">
            <SendHorizonal size={18} />
          </button>
        </div>
        {error && <p className="composer-error" role="alert">{error}</p>}
      </div>
    </div>
  );
}