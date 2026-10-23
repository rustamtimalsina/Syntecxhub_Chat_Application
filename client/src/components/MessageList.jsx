import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowDown,
  Check,
  CheckCheck,
  Pencil,
  Reply,
  Smile,
  Trash2,
  X,
  Loader2,
  Pin,
  ExternalLink,
} from 'lucide-react';
import Avatar from './Avatar.jsx';
import AudioMessage from './AudioMessage.jsx';
import { REACTIONS, groupReactions } from '../lib/reactions';

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

const renderMessageContent = (text) => {
  if (!text) return null;
  // Match URLs and @Mentions
  const tokenRegex = /(https?:\/\/[^\s<>"'{}|\\^`[\]]+|@[\w\d_]+)/gi;
  const parts = text.split(tokenRegex);

  return parts.map((part, i) => {
    if (/^https?:\/\//i.test(part)) {
      return (
        <a
          key={i}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          className="msg-link"
          onClick={(e) => e.stopPropagation()}
        >
          {part} <ExternalLink size={11} style={{ display: 'inline', verticalAlign: '-1px' }} />
        </a>
      );
    }
    if (/^@[\w\d_]+/i.test(part)) {
      return (
        <span key={i} className="mention-tag">
          {part}
        </span>
      );
    }
    return part;
  });
};

export default function MessageList({
  messages = [],
  loading,
  error,
  onRetry,
  conversationId,
  myId,
  roomName,
  isDm,
  isGroup,
  onEdit,
  onDelete,
  onHide,
  onReact,
  onReply,
  onPin,
  readAt,
  hasMore,
  loadingOlder,
  onLoadOlder,
}) {
  const scroller = useRef(null);
  const nearBottom = useRef(true);
  const prevLen = useRef(0);
  const [unseen, setUnseen] = useState(0);
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState('');
  const [confirmId, setConfirmId] = useState(null);
  const [pickerId, setPickerId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [lightbox, setLightbox] = useState(null); // url for enlarged image view

  useLayoutEffect(() => {
    prevLen.current = 0;
    nearBottom.current = true;
    setUnseen(0);
    setEditingId(null);
    setConfirmId(null);
    setPickerId(null);
    setActionError('');
  }, [conversationId]);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el || loading) return;
    const added = messages.length - prevLen.current;
    const wasEmpty = prevLen.current === 0;
    const prevScrollHeight = el.scrollHeight;
    const prevScrollTop = el.scrollTop;
    prevLen.current = messages.length;

    if (added <= 0) return;

    if (wasEmpty) {
      el.scrollTop = el.scrollHeight;
    } else if (prevScrollTop < 150 && hasMore) {
      // Older messages were prepended at the top: preserve relative scroll position
      const heightDiff = el.scrollHeight - prevScrollHeight;
      el.scrollTop = prevScrollTop + heightDiff;
    } else if (nearBottom.current) {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    } else {
      const lastMsg = messages[messages.length - 1];
      if (String(lastMsg.sender._id) === String(myId)) {
        el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
      } else {
        setUnseen((n) => n + added);
      }
    }
  }, [messages, loading, myId, hasMore]);

  useEffect(() => {
    if (!actionError) return undefined;
    const t = setTimeout(() => setActionError(''), 5000);
    return () => clearTimeout(t);
  }, [actionError]);

  // Close reaction picker or lightbox on Escape
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setPickerId(null);
        setLightbox(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    if (nearBottom.current) setUnseen(0);

    // Infinite scroll trigger when reaching top
    if (el.scrollTop < 60 && hasMore && !loadingOlder && onLoadOlder) {
      onLoadOlder();
    }
  };

  const jump = () => {
    const el = scroller.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    setUnseen(0);
  };

  const startEdit = (m) => {
    setPickerId(null);
    setConfirmId(null);
    setEditingId(m._id);
    setDraft(m.text);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setDraft('');
  };

  const saveEdit = async (m) => {
    const clean = draft.trim();
    if (!clean && !m.attachment && !m.audio) return;
    if (clean === m.text) {
      cancelEdit();
      return;
    }
    setBusy(true);
    setActionError('');
    const res = await onEdit(m._id, clean);
    setBusy(false);
    if (res.ok) cancelEdit();
    else setActionError(res.error || 'Could not edit');
  };

  const deleteForMe = async (m) => {
    setBusy(true);
    setActionError('');
    const res = await onHide(m._id);
    setBusy(false);
    if (res.ok) setConfirmId(null);
    else setActionError(res.error || 'Could not delete');
  };

  const deleteForEveryone = async (m) => {
    setBusy(true);
    setActionError('');
    const res = await onDelete(m._id);
    setBusy(false);
    if (res.ok) setConfirmId(null);
    else setActionError(res.error || 'Could not delete');
  };

  const react = async (m, key) => {
    setPickerId(null);
    const res = await onReact(m._id, key);
    if (!res.ok) setActionError(res.error || 'Could not react');
  };

  const togglePin = async (m) => {
    setPickerId(null);
    if (!onPin) return;
    const res = await onPin(m._id, !m.pinned);
    if (!res?.ok) setActionError(res?.error || 'Could not update pin');
  };

  const jumpTo = (targetId) => {
    const el = document.getElementById(`m-${targetId}`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('flash');
    setTimeout(() => el.classList.remove('flash'), 1400);
  };

  const setupEditor = (el) => {
    if (!el || el.dataset.ready) return;
    el.dataset.ready = '1';
    el.style.height = `${el.scrollHeight}px`;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  };

  return (
    <div className="messages-wrap">
      <div className="messages" ref={scroller} onScroll={onScroll}>
        {error ? (
          <div className="empty">
            <p>Couldn't load this conversation.</p>
            <button className="btn btn-ghost" onClick={onRetry}>
              Try again
            </button>
          </div>
        ) : loading ? (
          <div className="messages-inner" aria-hidden="true">
            <div className="skel" style={{ '--w': '46%' }} />
            <div className="skel right" style={{ '--w': '34%' }} />
            <div className="skel" style={{ '--w': '58%' }} />
            <div className="skel right" style={{ '--w': '40%' }} />
          </div>
        ) : (
          <div className="messages-inner">
            {/* Infinite Scroll Top Trigger */}
            {hasMore && (
              <div className="older-load-bar">
                {loadingOlder ? (
                  <span className="older-loading-text mono">
                    <Loader2 size={15} className="spin" /> Loading earlier messages…
                  </span>
                ) : (
                  <button className="older-btn" onClick={onLoadOlder}>
                    Load earlier messages
                  </button>
                )}
              </div>
            )}

            {messages.length === 0 ? (
              <div className="empty">
                <h3>{isDm ? `Chat with ${roomName}` : isGroup ? `Group: ${roomName}` : `Start of #${roomName}`}</h3>
                <p>No messages yet. Say hello.</p>
              </div>
            ) : (
              messages.map((m, i) => {
                const prev = messages[i - 1];
                const mine = String(m.sender._id) === String(myId);
                const newDay = !prev || dayKey(prev.createdAt) !== dayKey(m.createdAt);
                const first =
                  newDay ||
                  prev.sender._id !== m.sender._id ||
                  new Date(m.createdAt) - new Date(prev.createdAt) > 5 * 60 * 1000;
                const editing = editingId === m._id;
                const confirming = confirmId === m._id;
                const canEdit = mine && !m.deleted && !editing;
                const canEveryone = mine && !m.deleted;
                const reactions = m.deleted ? [] : groupReactions(m.reactions, myId);

                return (
                  <Fragment key={m._id}>
                    {newDay && <div className="day">{dayLabel(m.createdAt)}</div>}
                    <motion.div
                      id={`m-${m._id}`}
                      className={`msg ${mine ? 'mine' : ''} ${first ? 'first' : ''} ${
                        confirming ? 'confirming' : ''
                      }`}
                      initial={false}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, ease: EASE }}
                    >
                      {!mine && (
                        <div className="msg-av">
                          {first && <Avatar name={m.sender.name} color={m.sender.color} size={32} />}
                        </div>
                      )}

                      {!editing && (
                        <div
                          className={`msg-actions ${confirming ? 'confirm' : ''} ${
                            pickerId === m._id ? 'open' : ''
                          }`}
                        >
                          {confirming ? (
                            <>
                              <span>Delete?</span>
                              <button className="act" onClick={() => deleteForMe(m)} disabled={busy}>
                                For me
                              </button>
                              {canEveryone && (
                                <button
                                  className="act danger"
                                  onClick={() => deleteForEveryone(m)}
                                  disabled={busy}
                                >
                                  For everyone
                                </button>
                              )}
                              <button className="act" onClick={() => setConfirmId(null)}>
                                Cancel
                              </button>
                            </>
                          ) : (
                            <>
                              {!m.deleted && (
                                <button className="act-icon" onClick={() => onReply(m)} aria-label="Reply">
                                  <Reply size={14} />
                                </button>
                              )}
                              {!m.deleted && (
                                <span className="react-wrap">
                                  <button
                                    className="act-icon react-btn"
                                    onClick={() => setPickerId(pickerId === m._id ? null : m._id)}
                                    aria-label="Add reaction"
                                  >
                                    <Smile size={14} />
                                  </button>
                                  {pickerId === m._id && (
                                    <span className="picker" role="menu">
                                      {REACTIONS.map((r) => (
                                        <button
                                          key={r.key}
                                          onClick={() => react(m, r.key)}
                                          aria-label={r.label}
                                          title={r.label}
                                        >
                                          {r.emoji}
                                        </button>
                                      ))}
                                    </span>
                                  )}
                                </span>
                              )}
                              {!m.deleted && onPin && (
                                <button
                                  className={`act-icon ${m.pinned ? 'on' : ''}`}
                                  onClick={() => togglePin(m)}
                                  aria-label={m.pinned ? 'Unpin message' : 'Pin message'}
                                  title={m.pinned ? 'Unpin message' : 'Pin message'}
                                >
                                  <Pin size={14} />
                                </button>
                              )}
                              {canEdit && (
                                <button
                                  className="act-icon"
                                  onClick={() => startEdit(m)}
                                  aria-label="Edit message"
                                >
                                  <Pencil size={14} />
                                </button>
                              )}
                              <button
                                className="act-icon"
                                onClick={() => {
                                  setEditingId(null);
                                  setPickerId(null);
                                  setConfirmId(m._id);
                                }}
                                aria-label="Delete message"
                              >
                                <Trash2 size={14} />
                              </button>
                            </>
                          )}
                        </div>
                      )}

                      <div className={`bubble ${editing ? 'editing' : ''} ${m.deleted ? 'gone' : ''}`}>
                        {m.pinned && !m.deleted && (
                          <div className="msg-pinned-badge">
                            <Pin size={11} /> Pinned
                          </div>
                        )}

                        {!mine && first && !isDm && <span className="msg-name">{m.sender.name}</span>}

                        {m.replyTo && !m.deleted && (
                          <button className="quote" onClick={() => jumpTo(m.replyTo._id)}>
                            <b>
                              {String(m.replyTo.sender?._id) === String(myId)
                                ? 'You'
                                : m.replyTo.sender?.name}
                            </b>
                            <span>
                              {m.replyTo.deleted
                                ? 'This message was deleted'
                                : m.replyTo.text ||
                                  (m.replyTo.audio
                                    ? '🎤 Voice message'
                                    : m.replyTo.attachment
                                    ? '🖼️ Attachment'
                                    : '')}
                            </span>
                          </button>
                        )}

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
                                <button className="act" onClick={cancelEdit}>
                                  Cancel
                                </button>
                                <button className="act" onClick={() => saveEdit(m)} disabled={busy}>
                                  Save
                                </button>
                              </span>
                            </div>
                          </div>
                        ) : (
                          <>
                            {m.text && <span className="msg-text">{renderMessageContent(m.text)}</span>}

                            {/* Voice Message Player */}
                            {m.audio?.url && (
                              <AudioMessage audio={m.audio} isMine={mine} />
                            )}

                            {/* Media Attachment Display */}
                            {m.attachment?.url && (
                              <div className="msg-media-wrap">
                                {m.attachment.fileType?.startsWith('video/') ? (
                                  <video src={m.attachment.url} controls className="media-video" />
                                ) : (
                                  <img
                                    src={m.attachment.url}
                                    alt={m.attachment.fileName || 'Shared image'}
                                    className="media-img"
                                    loading="lazy"
                                    onClick={() => setLightbox(m.attachment.url)}
                                  />
                                )}
                              </div>
                            )}

                            {/* Open Graph Link Preview Card */}
                            {m.linkPreview?.title && (
                              <a
                                href={m.linkPreview.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="link-preview-card"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {m.linkPreview.image && (
                                  <div className="preview-img-wrap">
                                    <img src={m.linkPreview.image} alt={m.linkPreview.title} loading="lazy" />
                                  </div>
                                )}
                                <div className="preview-info">
                                  <span className="preview-site mono">{m.linkPreview.siteName}</span>
                                  <strong className="preview-title">{m.linkPreview.title}</strong>
                                  {m.linkPreview.description && (
                                    <p className="preview-desc">{m.linkPreview.description}</p>
                                  )}
                                </div>
                              </a>
                            )}
                          </>
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

                        {!editing && reactions.length > 0 && (
                          <div className="reacts">
                            {reactions.map((g) => (
                              <button
                                key={g.key}
                                className={`react-chip ${g.mine ? 'mine' : ''}`}
                                onClick={() => react(m, g.key)}
                                title={g.label}
                                aria-label={`${g.label}: ${g.count}${g.mine ? ', you reacted' : ''}`}
                              >
                                <span>{g.emoji}</span>
                                <b>{g.count}</b>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </motion.div>
                  </Fragment>
                );
              })
            )}
          </div>
        )}
      </div>

      {actionError && <p className="action-error" role="alert">{actionError}</p>}

      {/* Lightbox / Zoom Dialog */}
      {lightbox && (
        <div className="lightbox-backdrop" onClick={() => setLightbox(null)}>
          <button
            className="lightbox-close icon-btn"
            onClick={() => setLightbox(null)}
            aria-label="Close preview"
          >
            <X size={22} />
          </button>
          <img
            src={lightbox}
            alt="Enlarged attachment"
            className="lightbox-img"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

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
