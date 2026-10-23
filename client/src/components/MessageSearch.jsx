import { useEffect, useRef, useState } from 'react';
import { Search, X, Loader2, ArrowUpRight } from 'lucide-react';
import Avatar from './Avatar.jsx';

const time = (d) => new Date(d).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

export default function MessageSearch({ onSearch, onJump, onClose }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const q = query.trim();

  useEffect(() => {
    if (!q) {
      setResults([]);
      return undefined;
    }
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const data = await onSearch(q);
        if (!cancelled) setResults(data);
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q, onSearch]);

  const highlight = (text, word) => {
    if (!word || !text) return text;
    const parts = text.split(new RegExp(`(${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
    return parts.map((part, i) =>
      part.toLowerCase() === word.toLowerCase() ? (
        <mark key={i} className="search-match">{part}</mark>
      ) : (
        part
      )
    );
  };

  return (
    <div className="search-drawer">
      <div className="search-drawer-head">
        <div className="search-drawer-input">
          <Search size={16} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search messages in this conversation…"
            aria-label="Search messages"
          />
          {query && (
            <button type="button" className="icon-btn sm" onClick={() => setQuery('')} aria-label="Clear">
              <X size={14} />
            </button>
          )}
        </div>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Close search">
          <X size={18} />
        </button>
      </div>

      <div className="search-drawer-body">
        {loading && (
          <div className="search-status">
            <Loader2 size={16} className="spin" /> Searching messages…
          </div>
        )}

        {!loading && q && results.length === 0 && (
          <div className="search-status">No messages matching "{q}"</div>
        )}

        {!loading && !q && (
          <div className="search-status">Type to search message text</div>
        )}

        <div className="search-results-list">
          {results.map((m) => (
            <button
              key={m._id}
              type="button"
              className="search-result-row"
              onClick={() => onJump(m._id)}
            >
              <div className="search-res-top">
                <span className="search-res-sender">
                  <Avatar name={m.sender.name} color={m.sender.color} size={20} />
                  <strong>{m.sender.name}</strong>
                </span>
                <span className="search-res-time mono">{time(m.createdAt)}</span>
              </div>
              <p className="search-res-text">{highlight(m.text, q)}</p>
              <span className="search-jump-hint mono">
                Jump <ArrowUpRight size={13} />
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
