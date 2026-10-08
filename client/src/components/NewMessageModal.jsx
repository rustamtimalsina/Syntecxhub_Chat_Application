import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Search } from 'lucide-react';
import api, { errorMessage } from '../lib/api';
import Avatar from './Avatar.jsx';

export default function NewMessageModal({ online, onPick, onClose }) {
  const [query, setQuery] = useState('');
  const [people, setPeople] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(() => {
      api.get('/users', { params: { q: query.trim() } })
        .then(({ data }) => { if (!cancelled) { setPeople(data); setError(''); } })
        .catch((err) => { if (!cancelled) setError(errorMessage(err)); })
        .finally(() => { if (!cancelled) setLoading(false); });
    }, query ? 200 : 0);
    return () => { cancelled = true; clearTimeout(t); };
  }, [query]);

  const pick = async (id) => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await onPick(id);
      onClose();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <motion.div
      className="modal-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        className="modal"
        initial={{ opacity: 0, y: 18, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 10, scale: 0.98 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      >
        <h3>New message</h3>
        {error && <p className="form-error" role="alert">{error}</p>}

        <div className="pal-input people-search">
          <Search size={18} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search people…"
            aria-label="Search people"
          />
        </div>

        <ul className="people">
          {loading && people.length === 0 && <li className="people-note">Loading…</li>}
          {!loading && people.length === 0 && !error && (
            <li className="people-note">{query ? `No one named "${query}"` : 'No other users yet.'}</li>
          )}
          {people.map((p) => (
            <li key={p._id}>
              <button className="person" onClick={() => pick(p._id)} disabled={busy}>
                <span className="av-wrap">
                  <Avatar name={p.name} color={p.color} size={34} />
                  <i className={`pdot ${online.has(String(p._id)) ? 'on' : ''}`} />
                </span>
                <span>
                  <strong>{p.name}</strong>
                  <small>{online.has(String(p._id)) ? 'Online' : 'Offline'}</small>
                </span>
              </button>
            </li>
          ))}
        </ul>

        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
        </div>
      </motion.div>
    </motion.div>
  );
}