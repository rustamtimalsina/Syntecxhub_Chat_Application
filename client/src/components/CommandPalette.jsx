import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Search } from 'lucide-react';

export default function CommandPalette({ conversations, unread, onSelect, onClose }) {
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return conversations
      .filter((c) => c.type === 'channel')
      .map((c, i) => ({ ...c, num: String(i + 1).padStart(2, '0') }))
      .filter((c) => !q || c.name.toLowerCase().includes(q) || (c.description || '').toLowerCase().includes(q));
  }, [conversations, query]);

  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => { setIndex(0); }, [query]);
  useEffect(() => { listRef.current?.children[index]?.scrollIntoView({ block: 'nearest' }); }, [index]);

  const choose = (room) => {
    if (!room) return;
    onSelect(room._id);
    onClose();
  };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setIndex((i) => Math.min(i + 1, Math.max(results.length - 1, 0)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      choose(results[index]);
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  return (
    <motion.div
      className="palette-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        className="palette"
        role="dialog"
        aria-label="Jump to a room"
        initial={{ opacity: 0, y: -12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -8, scale: 0.98 }}
        transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="pal-input">
          <Search size={18} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Jump to a room…"
            aria-label="Search rooms"
          />
        </div>

        {results.length === 0 ? (
          <p className="pal-empty">No rooms match "{query}"</p>
        ) : (
          <ul className="pal-list" ref={listRef} role="listbox">
            {results.map((r, i) => (
              <li
                key={r._id}
                role="option"
                aria-selected={i === index}
                className={`pal-item ${i === index ? 'on' : ''}`}
                onMouseEnter={() => setIndex(i)}
                onClick={() => choose(r)}
              >
                <span className="mono">{r.num}</span>
                <span>
                  <span className="pal-name">{r.name}</span>
                  {r.description && <span className="pal-desc">{r.description}</span>}
                </span>
                {unread[r._id] > 0 && <span className="badge">{unread[r._id]}</span>}
              </li>
            ))}
          </ul>
        )}

        <div className="pal-foot mono">
          <span>↑↓ navigate</span>
          <span>↵ open</span>
          <span>esc close</span>
        </div>
      </motion.div>
    </motion.div>
  );
}