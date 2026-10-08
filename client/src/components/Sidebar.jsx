import { motion } from 'motion/react';
import Avatar from './Avatar.jsx';
import ThemeToggle from './ThemeToggle.jsx';
import { otherMember } from '../lib/convo';
import { Plus, LogOut, X, Search, Volume2, VolumeX } from 'lucide-react';

const pad = (n) => String(n + 1).padStart(2, '0');
const GLOW = { type: 'spring', stiffness: 520, damping: 42 };

export default function Sidebar({
  user, conversations, activeId, unread, last, online, open,muted,
  onSelect, onNewRoom, onNewDm, onSearch, onLogout, onClose,onToggleSound,
}) {
  const channels = conversations.filter((c) => c.type === 'channel');
  const dms = conversations
    .filter((c) => c.type === 'dm')
    .sort(
      (a, b) =>
        new Date(last[b._id]?.createdAt || b.createdAt) -
        new Date(last[a._id]?.createdAt || a.createdAt)
    );

    const preview = (c, fallback) => {
    const l = last[c._id];
    if (!l) return fallback;
    const text = l.deleted ? 'Message deleted' : l.text;
    const mine = String(l.sender._id) === String(user._id);
    return c.type === 'dm' ? `${mine ? 'You: ' : ''}${text}` : `${l.sender.name}: ${text}`;
  };

  return (
    <aside className={`sidebar ${open ? 'open' : ''}`}>
      <div className="sb-top">
        <span className="sb-brand"><span className="sb-dot" />Nightdesk</span>
        <button className="icon-btn sb-close" onClick={onClose} aria-label="Close menu">
          <X size={18} />
        </button>
      </div>

      <button className="sb-search" onClick={onSearch}>
        <Search size={15} />
        <span>Jump to…</span>
        <kbd className="mono">Ctrl K</kbd>
      </button>

      <nav className="rooms" aria-label="Conversations">
        <div className="sb-section">
          <span>Channels</span>
          <button className="icon-btn sm" onClick={onNewRoom} aria-label="Create a room">
            <Plus size={16} />
          </button>
        </div>

        {channels.map((c, i) => {
          const active = c._id === activeId;
          const count = unread[c._id] || 0;
          return (
            <button key={c._id} className={`room ${active ? 'active' : ''}`} onClick={() => onSelect(c._id)}>
              {active && <motion.span layoutId="room-glow" className="room-glow" transition={GLOW} />}
              <span className="room-num mono">{pad(i)}</span>
              <span className="room-text">
                <span className="room-name">{c.name}</span>
                <span className="room-preview">{preview(c, c.description || 'No messages yet')}</span>
              </span>
              {count > 0 && <span className="badge">{count > 99 ? '99+' : count}</span>}
            </button>
          );
        })}

        <div className="sb-section">
          <span>Direct messages</span>
          <button className="icon-btn sm" onClick={onNewDm} aria-label="Start a direct message">
            <Plus size={16} />
          </button>
        </div>

        {dms.length === 0 && <p className="sb-empty">No private chats yet. Press + to message someone.</p>}

        {dms.map((c) => {
          const other = otherMember(c, user._id);
          if (!other) return null;
          const active = c._id === activeId;
          const count = unread[c._id] || 0;
          const isOn = online.has(String(other._id));
          return (
            <button key={c._id} className={`room ${active ? 'active' : ''}`} onClick={() => onSelect(c._id)}>
              {active && <motion.span layoutId="room-glow" className="room-glow" transition={GLOW} />}
              <span className="av-wrap">
                <Avatar name={other.name} color={other.color} size={26} />
                <i className={`pdot ${isOn ? 'on' : ''}`} />
              </span>
              <span className="room-text">
                <span className="room-name">{other.name}</span>
                <span className="room-preview">{preview(c, 'Say hello')}</span>
              </span>
              {count > 0 && <span className="badge">{count > 99 ? '99+' : count}</span>}
            </button>
          );
        })}
      </nav>

      <div className="sb-foot">
        <Avatar name={user.name} color={user.color} size={36} />
        <div className="sb-me">
          <strong>{user.name}</strong>
          <span>Online</span>
        </div>
                <button
          className="icon-btn"
          onClick={onToggleSound}
          aria-label={muted ? 'Turn message sounds on' : 'Mute message sounds'}
          title={muted ? 'Sounds off' : 'Sounds on'}
        >
          {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
        </button>
        <ThemeToggle />
        <button className="icon-btn" onClick={onLogout} aria-label="Log out">
          <LogOut size={18} />
        </button>
      </div>
    </aside>
  );
}