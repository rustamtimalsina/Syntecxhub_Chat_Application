import { motion } from 'motion/react';
import { Plus, LogOut, X } from 'lucide-react';
import Avatar from './Avatar.jsx';
import ThemeToggle from './ThemeToggle.jsx';

const pad = (n) => String(n + 1).padStart(2, '0');

export default function Sidebar({
  user, conversations, activeId, unread, last, open,
  onSelect, onNewRoom, onLogout, onClose,
}) {
  const channels = conversations.filter((c) => c.type === 'channel');

  return (
    <aside className={`sidebar ${open ? 'open' : ''}`}>
      <div className="sb-top">
        <span className="sb-brand"><span className="sb-dot" />Nightdesk</span>
        <button className="icon-btn sb-close" onClick={onClose} aria-label="Close menu">
          <X size={18} />
        </button>
      </div>

      <div className="sb-section">
        <span>Channels</span>
        <button className="icon-btn sm" onClick={onNewRoom} aria-label="Create a room">
          <Plus size={16} />
        </button>
      </div>

      <nav className="rooms" aria-label="Channels">
        {channels.map((c, i) => {
          const active = c._id === activeId;
          const l = last[c._id];
          const count = unread[c._id] || 0;
          return (
            <button key={c._id} className={`room ${active ? 'active' : ''}`} onClick={() => onSelect(c._id)}>
              {active && (
                <motion.span
                  layoutId="room-glow"
                  className="room-glow"
                  transition={{ type: 'spring', stiffness: 520, damping: 42 }}
                />
              )}
              <span className="room-num mono">{pad(i)}</span>
              <span className="room-text">
                <span className="room-name">{c.name}</span>
                <span className="room-preview">
                  {l ? `${l.sender.name}: ${l.text}` : c.description || 'No messages yet'}
                </span>
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
        <ThemeToggle />
        <button className="icon-btn" onClick={onLogout} aria-label="Log out">
          <LogOut size={18} />
        </button>
      </div>
    </aside>
  );
}