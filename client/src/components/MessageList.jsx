import { Fragment, useLayoutEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowDown } from 'lucide-react';
import Avatar from './Avatar.jsx';

const EASE = [0.22, 1, 0.36, 1];

const dayKey = (d) => new Date(d).toDateString();
const time = (d) => new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const dayLabel = (d) => {
  const date = new Date(d);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== today.getFullYear() ? 'numeric' : undefined,
  });
};

export default function MessageList({ messages, loading, error, onRetry, conversationId, myId, roomName }) {
  const scroller = useRef(null);
  const nearBottom = useRef(true);
  const prevLen = useRef(0);
  const [unseen, setUnseen] = useState(0);

  useLayoutEffect(() => {
    prevLen.current = 0;
    nearBottom.current = true;
    setUnseen(0);
  }, [conversationId]);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el || loading) return;
    const added = messages.length - prevLen.current;
    const wasEmpty = prevLen.current === 0;
    prevLen.current = messages.length;
    if (added <= 0) return;
    const lastMsg = messages[messages.length - 1];
    if (wasEmpty) el.scrollTop = el.scrollHeight;
    else if (String(lastMsg.sender._id) === String(myId) || nearBottom.current) {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    } else setUnseen((n) => n + added);
  }, [messages, loading, myId]);

  const onScroll = () => {
    const el = scroller.current;
    nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    if (nearBottom.current && unseen) setUnseen(0);
  };

  const jump = () => {
    scroller.current.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' });
    setUnseen(0);
  };

  const now = Date.now();

  return (
    <div className="messages-wrap">
      <div className="messages" ref={scroller} onScroll={onScroll}>
        {error ? (
          <div className="empty">
            <p>Couldn't load this conversation.</p>
            <button className="btn btn-ghost" onClick={onRetry}>Try again</button>
          </div>
        ) : loading ? (
          <div className="messages-inner" aria-hidden="true">
            <div className="skel" style={{ '--w': '46%' }} />
            <div className="skel right" style={{ '--w': '34%' }} />
            <div className="skel" style={{ '--w': '58%' }} />
            <div className="skel right" style={{ '--w': '40%' }} />
          </div>
        ) : messages.length === 0 ? (
          <div className="empty">
            <h3>Start of #{roomName}</h3>
            <p>No messages yet. Say hello.</p>
          </div>
        ) : (
          <div className="messages-inner">
            {messages.map((m, i) => {
              const prev = messages[i - 1];
              const mine = String(m.sender._id) === String(myId);
              const newDay = !prev || dayKey(prev.createdAt) !== dayKey(m.createdAt);
              const first =
                newDay ||
                prev.sender._id !== m.sender._id ||
                new Date(m.createdAt) - new Date(prev.createdAt) > 5 * 60 * 1000;
              const fresh = now - new Date(m.createdAt) < 8000;

              return (
                <Fragment key={m._id}>
                  {newDay && <div className="day">{dayLabel(m.createdAt)}</div>}
                  <motion.div
                    className={`msg ${mine ? 'mine' : ''} ${first ? 'first' : ''}`}
                    initial={fresh ? { opacity: 0, y: 12, scale: 0.98 } : false}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ duration: 0.4, ease: EASE }}
                  >
                    {!mine && (
                      <div className="msg-av">
                        {first && <Avatar name={m.sender.name} color={m.sender.color} size={32} />}
                      </div>
                    )}
                    <div className="bubble">
                      {!mine && first && <span className="msg-name">{m.sender.name}</span>}
                      <span className="msg-text">{m.text}</span>
                      <span className="msg-time mono">{time(m.createdAt)}</span>
                    </div>
                  </motion.div>
                </Fragment>
              );
            })}
          </div>
        )}
      </div>

      <AnimatePresence>
        {unseen > 0 && (
          <div className="jump-wrap">
            <motion.button
              className="jump"
              onClick={jump}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              transition={{ duration: 0.25, ease: EASE }}
            >
              <ArrowDown size={14} /> {unseen} new message{unseen > 1 ? 's' : ''}
            </motion.button>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}