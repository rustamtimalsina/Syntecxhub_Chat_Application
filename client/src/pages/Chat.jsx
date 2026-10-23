import { useEffect, useState } from 'react';
import { AnimatePresence, MotionConfig } from 'motion/react';
import { Menu, Users } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import useChat from '../hooks/useChat.js';
import { otherMember } from '../lib/convo';
import { unlockAudio, isMuted, setMuted, playIncoming } from '../lib/sound';
import { enable, disable, isEnabled } from '../lib/notify';
import Avatar from '../components/Avatar.jsx';
import Sidebar from '../components/Sidebar.jsx';
import MessageList from '../components/MessageList.jsx';
import Composer from '../components/Composer.jsx';
import NewRoomModal from '../components/NewRoomModal.jsx';
import NewMessageModal from '../components/NewMessageModal.jsx';
import NewGroupModal from '../components/NewGroupModal.jsx';
import CommandPalette from '../components/CommandPalette.jsx';
import SettingsModal from '../components/SettingsModal.jsx';
import './chat.css';

export default function Chat() {
  const { user, logout } = useAuth();
  const chat = useChat(user, logout);

  const [navOpen, setNavOpen] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showDm, setShowDm] = useState(false);
  const [showGroup, setShowGroup] = useState(false);
  const [showPalette, setShowPalette] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [replyTo, setReplyTo] = useState(null);
  const [muted, setMutedState] = useState(isMuted);
  const [notify, setNotify] = useState(isEnabled);
  const [note, setNote] = useState('');

  // A reply belongs to one chat, so clear it when you switch chats
  useEffect(() => {
    setReplyTo(null);
  }, [chat.activeId]);

  const sendMessage = async (text, attachment) => {
    const res = await chat.send(text, replyTo?._id, attachment);
    if (res.ok) setReplyTo(null);
    return res;
  };

  // Browsers only allow sound after a click or keypress
  useEffect(() => {
    window.addEventListener('pointerdown', unlockAudio);
    window.addEventListener('keydown', unlockAudio);
    return () => {
      window.removeEventListener('pointerdown', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
    };
  }, []);

  const toggleSound = () => {
    const next = !muted;
    setMuted(next);
    setMutedState(next);
    if (!next) {
      unlockAudio();
      playIncoming(); // a short preview when you turn sound back on
    }
  };

  // Notice at the top that clears itself
  useEffect(() => {
    if (!note) return undefined;
    const t = setTimeout(() => setNote(''), 7000);
    return () => clearTimeout(t);
  }, [note]);

  const toggleNotify = async () => {
    if (notify) {
      disable();
      setNotify(false);
      return;
    }
    const result = await enable();
    if (result === 'granted') setNotify(true);
    else if (result === 'unsupported') setNote("This browser doesn't support notifications.");
    else setNote('Notifications are blocked. Click the lock icon next to the address bar and allow them.');
  };

  // Ctrl+K opens the quick switcher
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
  const isDm = active?.type === 'dm';
  const isGroup = active?.type === 'group';

  const other = isDm ? otherMember(active, user._id) : null;
  const otherOnline = other ? chat.online.has(String(other._id)) : false;
  const otherReadAt = other ? chat.reads[chat.activeId]?.[String(other._id)] : null;

  const title = isDm ? other?.name || 'Chat' : active?.name;
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
        <h3>Couldn't load your chats</h3>
        <p>Check your connection and try again.</p>
        <button className="btn btn-primary" onClick={chat.loadConversations}>
          Retry
        </button>
      </main>
    );
  }

  return (
    <MotionConfig reducedMotion="user">
      <div className="chat-shell">
        <Sidebar
          user={user}
          conversations={chat.conversations}
          activeId={chat.activeId}
          unread={chat.unread}
          last={chat.last}
          online={chat.online}
          open={navOpen}
          muted={muted}
          notify={notify}
          onSelect={select}
          onNewRoom={() => {
            setShowNew(true);
            setNavOpen(false);
          }}
          onNewDm={() => {
            setShowDm(true);
            setNavOpen(false);
          }}
          onNewGroup={() => {
            setShowGroup(true);
            setNavOpen(false);
          }}
          onSearch={() => {
            setShowPalette(true);
            setNavOpen(false);
          }}
          onToggleSound={toggleSound}
          onToggleNotify={toggleNotify}
          onOpenSettings={() => {
            setShowSettings(true);
            setNavOpen(false);
          }}
          onLogout={logout}
          onClose={() => setNavOpen(false)}
        />
        {navOpen && <div className="scrim" onClick={() => setNavOpen(false)} />}

        <section className="chat-main">
          <header className="chat-head">
            <button
              className="icon-btn head-menu"
              onClick={() => setNavOpen(true)}
              aria-label="Open menu"
            >
              <Menu size={18} />
            </button>

            {isDm && other && (
              <span className="av-wrap">
                <Avatar name={other.name} color={other.color} size={40} />
                <i className={`pdot ${otherOnline ? 'on' : ''}`} />
              </span>
            )}

            {isGroup && (
              <span className="grp-head-badge">
                <Users size={20} />
              </span>
            )}

            <div className="head-title">
              <h2>
                {!isDm && !isGroup && index >= 0 && (
                  <span className="mono">{String(index + 1).padStart(2, '0')}</span>
                )}
                {title || ' '}
              </h2>
              {isDm ? (
                <p>{otherOnline ? 'Online' : 'Offline'}</p>
              ) : isGroup ? (
                <p>{active?.members?.length || 0} members · {active?.description || 'Group chat'}</p>
              ) : (
                active?.description && <p>{active.description}</p>
              )}
            </div>

            {!isDm && !isGroup && (
              <span className="online-pill">
                <i /> {chat.online.size} online
              </span>
            )}
          </header>

          {chat.status !== 'connected' && (
            <div className="conn-banner" role="status">
              {chat.status === 'error' ? "Can't reach the server. Retrying…" : 'Connecting…'}
            </div>
          )}
          {note && (
            <div className="conn-banner" role="status">
              {note}
            </div>
          )}

          <MessageList
            conversationId={chat.activeId}
            messages={chat.messages[chat.activeId] || []}
            loading={chat.loading}
            error={chat.historyError}
            onRetry={chat.reloadHistory}
            myId={user._id}
            roomName={title}
            isDm={isDm}
            isGroup={isGroup}
            readAt={otherReadAt}
            hasMore={chat.hasMore}
            loadingOlder={chat.loadingOlder}
            onLoadOlder={chat.loadOlder}
            onEdit={chat.editMessage}
            onDelete={chat.deleteMessage}
            onHide={chat.hideMessage}
            onReact={chat.reactToMessage}
            onReply={setReplyTo}
          />

          <Composer
            key={chat.activeId}
            roomName={title}
            isDm={isDm}
            isGroup={isGroup}
            onSend={sendMessage}
            replyTo={replyTo}
            onCancelReply={() => setReplyTo(null)}
            onTyping={chat.sendTyping}
            typingNames={typingNames}
            disabled={!chat.activeId}
          />
        </section>

        <AnimatePresence>
          {showNew && (
            <NewRoomModal key="new" onCreate={chat.createRoom} onClose={() => setShowNew(false)} />
          )}
          {showDm && (
            <NewMessageModal
              key="dm"
              online={chat.online}
              onPick={chat.openDm}
              onClose={() => setShowDm(false)}
            />
          )}
          {showGroup && (
            <NewGroupModal
              key="group"
              myId={user._id}
              onCreateGroup={chat.createGroup}
              onClose={() => setShowGroup(false)}
            />
          )}
          {showPalette && (
            <CommandPalette
              key="palette"
              conversations={chat.conversations}
              unread={chat.unread}
              myId={user._id}
              onSelect={select}
              onOpenDm={chat.openDm}
              onClose={() => setShowPalette(false)}
            />
          )}
          {showSettings && <SettingsModal key="settings" onClose={() => setShowSettings(false)} />}
        </AnimatePresence>
      </div>
    </MotionConfig>
  );
}
