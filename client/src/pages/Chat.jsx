import { useEffect, useState } from 'react';
import { AnimatePresence, MotionConfig } from 'motion/react';
import { Menu, Users, Search as SearchIcon, Phone, Video } from 'lucide-react';
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
import PinnedBanner from '../components/PinnedBanner.jsx';
import MessageSearch from '../components/MessageSearch.jsx';
import useCall from '../hooks/useCall.js';
import IncomingCallModal from '../components/IncomingCallModal.jsx';
import CallModal from '../components/CallModal.jsx';
import './chat.css';

export default function Chat() {
  const { user, logout } = useAuth();
  const chat = useChat(user, logout);
  const call = useCall(chat.socket, user);

  const [navOpen, setNavOpen] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showDm, setShowDm] = useState(false);
  const [showGroup, setShowGroup] = useState(false);
  const [showPalette, setShowPalette] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [replyTo, setReplyTo] = useState(null);
  const [muted, setMutedState] = useState(isMuted);
  const [notify, setNotify] = useState(isEnabled);
  const [note, setNote] = useState('');

  // A reply belongs to one chat, so clear it when you switch chats
  useEffect(() => {
    setReplyTo(null);
    setShowSearch(false);
  }, [chat.activeId]);

  const sendMessage = async (text, attachment, audio, mentions) => {
    const res = await chat.send(text, replyTo?._id, attachment, audio, mentions);
    if (res.ok) setReplyTo(null);
    return res;
  };

  const jumpToMessage = (targetId) => {
    const el = document.getElementById(`m-${targetId}`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('flash');
    setTimeout(() => el.classList.remove('flash'), 1400);
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
      playIncoming();
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

  // Ctrl+K opens the quick switcher, Ctrl+F opens in-chat search
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setShowPalette((v) => !v);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setShowSearch((v) => !v);
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

  // Collect conversation members for mention autocomplete
  const convoMembers = isGroup
    ? active?.members || []
    : isDm
    ? other
      ? [other]
      : []
    : chat.conversations
        .flatMap((c) => c.members || [])
        .filter((m, idx, arr) => arr.findIndex((x) => x._id === m._id) === idx);

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

            <div className="head-actions">
              <button
                type="button"
                className="icon-btn"
                onClick={() => call.startCall(chat.activeId, false, other)}
                title="Start audio call"
                aria-label="Start audio call"
                disabled={call.callState !== 'idle' || !chat.activeId}
              >
                <Phone size={18} />
              </button>

              <button
                type="button"
                className="icon-btn"
                onClick={() => call.startCall(chat.activeId, true, other)}
                title="Start video call"
                aria-label="Start video call"
                disabled={call.callState !== 'idle' || !chat.activeId}
              >
                <Video size={18} />
              </button>

              <button
                type="button"
                className={`icon-btn ${showSearch ? 'active' : ''}`}
                onClick={() => setShowSearch((v) => !v)}
                title="Search messages in this conversation (Ctrl+F)"
                aria-label="Search conversation"
              >
                <SearchIcon size={18} />
              </button>

              {!isDm && !isGroup && (
                <span className="online-pill">
                  <i /> {chat.online.size} online
                </span>
              )}
            </div>
          </header>

          {showSearch && (
            <MessageSearch
              onSearch={(q) => chat.searchMessages(chat.activeId, q)}
              onJump={jumpToMessage}
              onClose={() => setShowSearch(false)}
            />
          )}

          {chat.status !== 'connected' && (
            <div className="conn-banner" role="status">
              {chat.status === 'error' ? "Can't reach the server. Retrying…" : 'Connecting…'}
            </div>
          )}
          {note && (
            <div className="conn-banner" role="status">{note}</div>
          )}

          {/* Pinned Messages Banner */}
          <PinnedBanner
            pinnedMessages={chat.pinnedMessages}
            onJump={jumpToMessage}
            onUnpin={(id) => chat.pinMessage(id, false)}
          />

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
            onPin={chat.pinMessage}
            onReply={setReplyTo}
          />

          <Composer
            key={chat.activeId}
            roomName={title}
            isDm={isDm}
            isGroup={isGroup}
            members={convoMembers}
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
