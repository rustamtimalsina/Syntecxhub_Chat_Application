import { useEffect, useState } from 'react';
   import CommandPalette from '../components/CommandPalette.jsx';
import { AnimatePresence, MotionConfig } from 'motion/react';
import { Menu } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import useChat from '../hooks/useChat.js';
import Sidebar from '../components/Sidebar.jsx';
import MessageList from '../components/MessageList.jsx';
import Composer from '../components/Composer.jsx';
import NewRoomModal from '../components/NewRoomModal.jsx';
import './chat.css';

export default function Chat() {
  const { user, logout } = useAuth();
  const chat = useChat(user, logout);
  const [navOpen, setNavOpen] = useState(false);
  const [showNew, setShowNew] = useState(false);
     const [showPalette, setShowPalette] = useState(false);

   useEffect(() => {
     const onKey = (e) => {
       if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
         e.preventDefault();
         setShowPalette((v) => !v);
       }
     };
     window.addEventListener('keydown', onKey);
     return () => window.removeEventListener('keydown', onKey);
   }, []);

  const channels = chat.conversations.filter((c) => c.type === 'channel');
  const active = chat.conversations.find((c) => c._id === chat.activeId);
  const index = channels.findIndex((c) => c._id === chat.activeId);
  const typingNames = Object.entries(chat.typing[chat.activeId] || {})
    .filter(([id]) => id !== user._id)
    .map(([, name]) => name);

  const select = (id) => {
    chat.select(id);
    setNavOpen(false);
  };

  if (chat.loadError) {
    return (
      <main className="empty" style={{ height: '100%' }}>
        <h3>Couldn't load your rooms</h3>
        <p>Check your connection and try again.</p>
        <button className="btn btn-primary" onClick={chat.loadConversations}>Retry</button>
      </main>
    );
  }

  return (
    <MotionConfig reducedMotion="user">
      <div className="chat-shell">
        <Sidebar
           onSearch={() => { setShowPalette(true); setNavOpen(false); }}
          user={user}
          conversations={chat.conversations}
          activeId={chat.activeId}
          unread={chat.unread}
          last={chat.last}
          open={navOpen}
          onSelect={select}
          onNewRoom={() => { setShowNew(true); setNavOpen(false); }}
          onLogout={logout}
          onClose={() => setNavOpen(false)}
        />
        {navOpen && <div className="scrim" onClick={() => setNavOpen(false)} />}

        <section className="chat-main">
          <header className="chat-head">
            <button className="icon-btn head-menu" onClick={() => setNavOpen(true)} aria-label="Open menu">
              <Menu size={18} />
            </button>
            <div className="head-title">
              <h2>
                {index >= 0 && <span className="mono">{String(index + 1).padStart(2, '0')}</span>}
                {active?.name || ' '}
              </h2>
              {active?.description && <p>{active.description}</p>}
            </div>
            <span className="online-pill"><i /> {chat.online.size} online</span>
          </header>

          {chat.status !== 'connected' && (
            <div className="conn-banner" role="status">
              {chat.status === 'error' ? "Can't reach the server. Retrying…" : 'Connecting…'}
            </div>
          )}

          <MessageList
            conversationId={chat.activeId}
            messages={chat.messages[chat.activeId] || []}
            loading={chat.loading}
            error={chat.historyError}
            onRetry={chat.reloadHistory}
            myId={user._id}
            roomName={active?.name}
          />

          <Composer
            key={chat.activeId}
            roomName={active?.name}
            onSend={chat.send}
            onTyping={chat.sendTyping}
            typingNames={typingNames}
            disabled={!chat.activeId}
          />
        </section>

           <AnimatePresence>
     {showNew && (
       <NewRoomModal key="new" onCreate={chat.createRoom} onClose={() => setShowNew(false)} />
     )}
     {showPalette && (
       <CommandPalette
         key="palette"
         conversations={chat.conversations}
         unread={chat.unread}
         onSelect={select}
         onClose={() => setShowPalette(false)}
       />
     )}
   </AnimatePresence>
      </div>
    </MotionConfig>
  );
}