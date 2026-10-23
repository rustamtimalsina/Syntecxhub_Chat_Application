import { useState } from 'react';
import { Pin, ChevronLeft, ChevronRight, X } from 'lucide-react';

export default function PinnedBanner({ pinnedMessages = [], onJump, onUnpin }) {
  const [index, setIndex] = useState(0);

  if (!pinnedMessages.length) return null;

  const safeIndex = Math.min(index, pinnedMessages.length - 1);
  const current = pinnedMessages[safeIndex];

  const prev = (e) => {
    e.stopPropagation();
    setIndex((i) => (i > 0 ? i - 1 : pinnedMessages.length - 1));
  };

  const next = (e) => {
    e.stopPropagation();
    setIndex((i) => (i < pinnedMessages.length - 1 ? i + 1 : 0));
  };

  const textPreview =
    current.text ||
    (current.audio ? '🎤 Voice message' : current.attachment ? '🖼️ Attachment' : 'Pinned message');

  return (
    <div className="pinned-banner" onClick={() => onJump(current._id)}>
      <div className="pinned-icon-wrap">
        <Pin size={15} />
      </div>

      <div className="pinned-content">
        <div className="pinned-label">
          <strong>Pinned message</strong>
          {pinnedMessages.length > 1 && (
            <span className="mono">({safeIndex + 1}/{pinnedMessages.length})</span>
          )}
          <span className="pinned-sender">by {current.sender.name}</span>
        </div>
        <p className="pinned-text">{textPreview}</p>
      </div>

      <div className="pinned-actions" onClick={(e) => e.stopPropagation()}>
        {pinnedMessages.length > 1 && (
          <div className="pinned-nav">
            <button type="button" className="icon-btn sm" onClick={prev} aria-label="Previous pinned message">
              <ChevronLeft size={14} />
            </button>
            <button type="button" className="icon-btn sm" onClick={next} aria-label="Next pinned message">
              <ChevronRight size={14} />
            </button>
          </div>
        )}

        {onUnpin && (
          <button
            type="button"
            className="icon-btn sm"
            onClick={() => onUnpin(current._id)}
            title="Unpin message"
            aria-label="Unpin message"
          >
            <X size={14} />
          </button>
        )}
      </div>
    </div>
  );
}
