import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowDown, Check, CheckCheck, Pencil, Trash2 } from 'lucide-react';
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

export default function MessageList({
   messages, loading, error, onRetry, conversationId, myId, roomName, isDm, onEdit, onDelete, onHide, readAt,
}) {
  const scroller = useRef(null);
  const nearBottom = useRef(true);
  const prevLen = useRef(0);
  const [unseen, setUnseen] = useState(0);
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState('');
  const [confirmId, setConfirmId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');

  useLayoutEffect(() => {
    prevLen.current = 0;
    nearBottom.current = true;
    setUnseen(0);
    setEditingId(null);
    setConfirmId(null);
    setActionError('');
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

  useEffect(() => {
    if (!actionError) return undefined;
    const t = setTimeout(() => setActionError(''), 5000);
    return () => clearTimeout(t);
  }, [actionError]);

  const onScroll = () => {
    const el = scroller.current;
    nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    if (nearBottom.current && unseen) setUnseen(0);
  };

  const jump = () => {
    scroller.current.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' });
    setUnseen(0);
  };

  const startEdit = (m) => {
    setConfirmId(null);
    setActionError('');
    setDraft(m.text);
    setEditingId(m._id);
  };
  const cancelEdit = () => setEditingId(null);

  const saveEdit = async (m) => {
    if (busy) return;
    const clean = draft.trim();
    if (!clean) return setActionError("A message can't be empty. Delete it instead.");
    if (clean === m.text) return cancelEdit();
    setBusy(true);
    const res = await onEdit(m._id, clean);
    setBusy(false);
    if (res.ok) cancelEdit();
    else setActionError(res.error || 'Could not edit the message');
  };

  const run = async (action, m, fallback) => {
    if (busy) return;
    setBusy(true);
    const res = await action(m._id);
    setBusy(false);
    setConfirmId(null);
    if (!res.ok) setActionError(res.error || fallback);
  };
  const deleteForMe = (m) => run(onHide, m, 'Could not delete the message');
  const deleteForEveryone = (m) => run(onDelete, m, 'Could not delete the message');

  const setupEditor = (el) => {
    if (!el || el.dataset.ready) return;
    el.dataset.ready = '1';
    el.style.height = `${el.scrollHeight}px`;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
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
            <h3>{isDm ? `Chat with ${roomName}` : `Start of #${roomName}`}</h3>
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
              const editing = editingId === m._id;
              const confirming = confirmId === m._id;
              const canEdit = mine && !m.deleted && !editing;
              const canEveryone = mine && !m.deleted;

              return (
                <Fragment key={m._id}>
                  {newDay && <div className="day">{dayLabel(m.createdAt)}</div>}
                  <motion.div
                    className={`msg ${mine ? 'mine' : ''} ${first ? 'first' : ''} ${confirming ? 'confirming' : ''}`}
                    initial={fresh ? { opacity: 0, y: 12, scale: 0.98 } : false}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ duration: 0.4, ease: EASE }}
                  >
                    {!mine && (
                      <div className="msg-av">
                        {first && <Avatar name={m.sender.name} color={m.sender.color} size={32} />}
                      </div>
                    )}

                    {!editing && (
                      <div className={`msg-actions ${confirming ? 'confirm' : ''}`}>
                        {confirming ? (
                          <>
                            <span>Delete?</span>
                            <button className="act" onClick={() => deleteForMe(m)} disabled={busy}>For me</button>
                            {canEveryone && (
                              <button className="act danger" onClick={() => deleteForEveryone(m)} disabled={busy}>
                                For everyone
                              </button>
                            )}
                            <button className="act" onClick={() => setConfirmId(null)}>Cancel</button>
                          </>
                        ) : (
                          <>
                            {canEdit && (
                              <button className="act-icon" onClick={() => startEdit(m)} aria-label="Edit message">
                                <Pencil size={14} />
                              </button>
                            )}
                            <button
                              className="act-icon"
                              onClick={() => { setEditingId(null); setConfirmId(m._id); }}
                              aria-label="Delete message"
                            >
                              <Trash2 size={14} />
                            </button>
                          </>
                        )}
                      </div>
                    )}

                    <div className={`bubble ${editing ? 'editing' : ''} ${m.deleted ? 'gone' : ''}`}>
                      {!mine && first && !isDm && <span className="msg-name">{m.sender.name}</span>}

                      {m.deleted ? (
                        <span className="msg-text gone">This message was deleted</span>
                      ) : editing ? (
                        <div className="edit-box">
                          <textarea
                            ref={setupEditor}
                            value={draft}
                            maxLength={2000}
                            aria-label="Edit message"
                            onChange={(e) => {
                              setDraft(e.target.value);
                              e.target.style.height = 'auto';
                              e.target.style.height = `${Math.min(e.target.scrollHeight, 200)}px`;
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                                e.preventDefault();
                                saveEdit(m);
                              } else if (e.key === 'Escape') {
                                cancelEdit();
                              }
                            }}
                          />
                          <div className="edit-actions">
                            <span className="mono">Enter to save · Esc to cancel</span>
                            <span>
                              <button className="act" onClick={cancelEdit}>Cancel</button>
                              <button className="act" onClick={() => saveEdit(m)} disabled={busy}>Save</button>
                            </span>
                          </div>
                        </div>
                      ) : (
                        <span className="msg-text">{m.text}</span>
                      )}

                      {!editing && (
                        <span className="msg-time mono">
                          {m.edited && !m.deleted && 'edited · '}
                          {time(m.createdAt)}
                          {mine && isDm && !m.deleted && (
                            readAt && new Date(readAt) >= new Date(m.createdAt) ? (
                              <CheckCheck size={14} className="tick seen" aria-label="Seen" />
                            ) : (
                              <Check size={14} className="tick" aria-label="Sent" />
                            )
                          )}
                        </span>
                      )}
                    </div>
                  </motion.div>
                </Fragment>
              );
            })}
          </div>
        )}
      </div>

      {actionError && <p className="action-error" role="alert">{actionError}</p>}

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