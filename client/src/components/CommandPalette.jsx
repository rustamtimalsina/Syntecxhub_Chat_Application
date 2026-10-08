import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Search } from 'lucide-react';
import api from '../lib/api';
import Avatar from './Avatar.jsx';
import { otherMember } from '../lib/convo';

export default function CommandPalette({ conversations, unread, myId, onSelect, onOpenDm, onClose }) {
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const [people, setPeople] = useState([]);
  const [error, setError] = useState('');
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const q = query.trim().toLowerCase();

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    if (!q) { setPeople([]); return undefined; }
    let cancelled = false;
    const t = setTimeout(() => {
      api.get('/users', { params: { q } })
        .then(({ data }) => { if (!cancelled) setPeople(data); })
        .catch(() => { if (!cancelled) setPeople([]); });
    }, 200);
    return () => { cancelled = true; clearTimeout(t); };
  }, [q]);

  const items = useMemo(() => {
    const rooms = conversations
      .filter((c) => c.type === 'channel')
      .map((c, i) => ({ kind: 'room', id: c._id, label: c.name, sub: c.description, num: String(i + 1).padStart(2, '0') }));

    const dms = conversations
      .filter((c) => c.type === 'dm')
      .map((c) => {
        const o = otherMember(c, myId);
        return { kind: 'dm', id: c._id, label: o?.name || 'Unknown', sub: 'Direct message', color: o?.color };
      });

    const hasDm = new Set(
      conversations.filter((c) => c.type === 'dm').map((c) => String(otherMember(c, myId)?._id))
    );
    const newPeople = people
      .filter((p) => !hasDm.has(String(p._id)))
      .map((p) => ({ kind: 'person', id: p._id, label: p.name, sub: 'Start a new message', color: p.color }));

    const match = (it) => !q || it.label.toLowerCase().includes(q) || (it.sub || '').toLowerCase().includes(q);
    return [...rooms.filter(match), ...dms.filter(match), ...(q ? newPeople : [])];
  }, [conversations, people, q, myId]);

  useEffect(() => { setIndex(0); }, [query]);
  useEffect(() => { listRef.current?.children[index]?.scrollIntoView({ block: 'nearest' }); }, [index]);

  const choose = async (item) => {
    if (!item) return;
    setError('');
    if (item.kind === 'person') {
      try {
        await onOpenDm(item.id);
      } catch {
        return setError('Could not open that chat. Try again.');
      }
    } else {
      onSelect(item.id);
    }
    onClose();
  };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setIndex((i) => Math.min(i + 1, Math.max(items.length - 1, 0)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      choose(items[index]);
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
        aria-label="Jump to a room or person"
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
            placeholder="Jump to a room or person…"
            aria-label="Search rooms and people"
          />
        </div>

        {error && <p className="pal-error" role="alert">{error}</p>}

        {items.length === 0 ? (
          <p className="pal-empty">Nothing matches "{query}"</p>
        ) : (
          <ul className="pal-list" ref={listRef} role="listbox">
            {items.map((it, i) => (
              <li
                key={`${it.kind}-${it.id}`}
                role="option"
                aria-selected={i === index}
                className={`pal-item ${i === index ? 'on' : ''}`}
                onMouseEnter={() => setIndex(i)}
                onClick={() => choose(it)}
              >
                {it.kind === 'room' ? (
                  <span className="mono">{it.num}</span>
                ) : (
                  <Avatar name={it.label} color={it.color} size={24} />
                )}
                <span>
                  <span className="pal-name">{it.label}</span>
                  {it.sub && <span className="pal-desc">{it.sub}</span>}
                </span>
                {unread[it.id] > 0 && <span className="badge">{unread[it.id]}</span>}
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