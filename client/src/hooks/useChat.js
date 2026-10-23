import { useCallback, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import api from '../lib/api';
import { playIncoming, playSent } from '../lib/sound';
import { showNotification } from '../lib/notify';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || undefined;

const merge = (a, b) => {
  const map = new Map();
  [...a, ...b].forEach((m) => map.set(m._id, m));
  return [...map.values()].sort((x, y) => new Date(x.createdAt) - new Date(y.createdAt));
};

export default function useChat(user, onAuthError) {
  const [conversations, setConversations] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [messages, setMessages] = useState({}); // conversationId -> messages[]
  const [pinnedMessages, setPinnedMessages] = useState({}); // conversationId -> messages[]
  const [loadingId, setLoadingId] = useState(null);
  const [historyError, setHistoryError] = useState(false);
  const [historyKey, setHistoryKey] = useState(0);
  const [loadError, setLoadError] = useState(false);
  const [unread, setUnread] = useState({});
  const [last, setLast] = useState({});
  const [online, setOnline] = useState(() => new Set());
  const [typing, setTyping] = useState({}); // conversationId -> { userId: name }
  const [status, setStatus] = useState('connecting');
  const [reads, setReads] = useState({}); // conversationId -> { userId: lastReadAt }
  const [hasMore, setHasMore] = useState({}); // conversationId -> boolean
  const [loadingOlder, setLoadingOlder] = useState(false);

  const socketRef = useRef(null);
  const [socketInstance, setSocketInstance] = useState(null);
  const activeRef = useRef(null);
  const loadedRef = useRef(new Set());
  const timers = useRef({});
  const authErrorRef = useRef(onAuthError);

  useEffect(() => {
    activeRef.current = activeId;
  }, [activeId]);

  useEffect(() => {
    authErrorRef.current = onAuthError;
  }, [onAuthError]);

  const messagesRef = useRef({});
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const convosRef = useRef([]);
  const selectRef = useRef(null);
  useEffect(() => {
    convosRef.current = conversations;
  }, [conversations]);

  const markRead = useCallback((cid) => {
    if (!cid || document.hidden) return;
    const current = convosRef.current.find((c) => c._id === cid);
    if (!current || (current.type !== 'dm' && current.type !== 'group')) return;
    socketRef.current?.emit('conversation:read', { conversationId: cid });
  }, []);

  // Opening a direct message or group marks it as read
  useEffect(() => {
    markRead(activeId);
  }, [activeId, conversations, markRead]);

  // Coming back to the tab marks the open chat as read
  useEffect(() => {
    const onVisible = () => {
      if (!document.hidden) markRead(activeRef.current);
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [markRead]);

  // Rooms and Conversations
  const loadConversations = useCallback(async () => {
    setLoadError(false);
    try {
      const { data } = await api.get('/conversations');
      setConversations(data);
      setReads(
        Object.fromEntries(
          data
            .filter((c) => c.type === 'dm' || c.type === 'group')
            .map((c) => [c._id, c.reads || {}])
        )
      );
      setActiveId((cur) => cur || data.find((c) => c.slug === 'general')?._id || data[0]?._id || null);
    } catch {
      setLoadError(true);
    }
  }, []);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  // Socket
  useEffect(() => {
    const socket = io(SOCKET_URL, {
      auth: (cb) => cb({ token: localStorage.getItem('token') }),
    });
    socketRef.current = socket;
    setSocketInstance(socket);

    const dropTyping = (cid, uid) => {
      clearTimeout(timers.current[`${cid}:${uid}`]);
      setTyping((prev) => {
        if (!prev[cid]?.[uid]) return prev;
        const room = { ...prev[cid] };
        delete room[uid];
        return { ...prev, [cid]: room };
      });
    };

    socket.on('connect', () => setStatus('connected'));
    socket.on('disconnect', () => setStatus('connecting'));
    socket.on('connect_error', (err) => {
      setStatus('error');
      if (/token|user not found/i.test(err.message)) authErrorRef.current?.();
    });

    socket.on('conversation:read', ({ conversationId, userId, at }) =>
      setReads((prev) => ({
        ...prev,
        [conversationId]: { ...(prev[conversationId] || {}), [userId]: at },
      }))
    );

    socket.on('presence:list', (ids) => setOnline(new Set(ids)));
    socket.on('presence:update', ({ userId, online: isOn }) =>
      setOnline((prev) => {
        const next = new Set(prev);
        if (isOn) next.add(userId);
        else next.delete(userId);
        return next;
      })
    );

    socket.on('conversation:created', (room) => {
      setConversations((prev) => (prev.some((c) => c._id === room._id) ? prev : [...prev, room]));
    });

    socket.on('group:updated', (updated) => {
      setConversations((prev) => prev.map((c) => (c._id === updated._id ? { ...c, ...updated } : c)));
    });

    socket.on('group:removed', ({ conversationId }) => {
      setConversations((prev) => prev.filter((c) => c._id !== conversationId));
      setActiveId((cur) => (cur === conversationId ? null : cur));
    });

    socket.on('message:new', (msg) => {
      const cid = msg.conversation;
      if (msg.sender._id === user._id) playSent();
      else playIncoming();

      setMessages((prev) => {
        const list = prev[cid] || [];
        if (list.some((m) => m._id === msg._id)) return prev;
        return { ...prev, [cid]: [...list, msg] };
      });
      setLast((prev) => ({ ...prev, [cid]: msg }));

      if (cid !== activeRef.current && msg.sender._id !== user._id) {
        setUnread((prev) => ({ ...prev, [cid]: (prev[cid] || 0) + 1 }));
      }
      dropTyping(cid, msg.sender._id);

      if (msg.sender._id !== user._id && !msg.deleted) {
        const convo = convosRef.current.find((c) => c._id === cid);
        const roomName =
          convo?.type === 'channel'
            ? ` in #${convo.name}`
            : convo?.type === 'group'
            ? ` in ${convo.name}`
            : '';
        const isMentioned = msg.mentions?.some((m) => String(m._id || m) === String(user._id));
        const bodyText =
          (isMentioned ? 'Mentioned you: ' : '') +
          (msg.text || (msg.audio ? '🎤 Voice message' : msg.attachment ? '🖼️ Shared an attachment' : 'New message'));

        showNotification({
          title: `${msg.sender.name}${roomName}`,
          body: bodyText.length > 140 ? `${bodyText.slice(0, 140)}…` : bodyText,
          tag: cid,
          onClick: () => selectRef.current?.(cid),
        });
      }

      if (cid === activeRef.current && msg.sender._id !== user._id) markRead(cid);
    });

    socket.on('message:updated', (msg) => {
      const cid = msg.conversation;
      setMessages((prev) => {
        const list = prev[cid];
        if (!list) return prev;
        return {
          ...prev,
          [cid]: list.map((m) => {
            if (m._id === msg._id) return { ...msg, replyTo: m.replyTo };
            if (m.replyTo?._id === msg._id) {
              return {
                ...m,
                replyTo: {
                  ...m.replyTo,
                  text: msg.text,
                  attachment: msg.attachment,
                  audio: msg.audio,
                  deleted: msg.deleted,
                },
              };
            }
            return m;
          }),
        };
      });
      setLast((prev) => (prev[cid]?._id === msg._id ? { ...prev, [cid]: msg } : prev));
      setPinnedMessages((prev) => {
        const list = prev[cid];
        if (!list) return prev;
        return {
          ...prev,
          [cid]: msg.deleted || !msg.pinned
            ? list.filter((m) => m._id !== msg._id)
            : list.map((m) => (m._id === msg._id ? msg : m)),
        };
      });
    });

    socket.on('message:pinned', (msg) => {
      const cid = msg.conversation;
      setMessages((prev) => {
        const list = prev[cid];
        if (!list) return prev;
        return {
          ...prev,
          [cid]: list.map((m) => (m._id === msg._id ? msg : m)),
        };
      });
      setPinnedMessages((prev) => {
        const currentList = prev[cid] || [];
        if (msg.pinned) {
          if (currentList.some((m) => m._id === msg._id)) {
            return { ...prev, [cid]: currentList.map((m) => (m._id === msg._id ? msg : m)) };
          }
          return { ...prev, [cid]: [msg, ...currentList] };
        }
        return { ...prev, [cid]: currentList.filter((m) => m._id !== msg._id) };
      });
    });

    socket.on('message:hidden', ({ messageId, conversationId }) => {
      const rest = (messagesRef.current[conversationId] || []).filter((m) => m._id !== messageId);
      setMessages((prev) =>
        prev[conversationId]
          ? { ...prev, [conversationId]: prev[conversationId].filter((m) => m._id !== messageId) }
          : prev
      );
      setLast((prev) =>
        prev[conversationId]?._id === messageId
          ? { ...prev, [conversationId]: rest[rest.length - 1] }
          : prev
      );
      setPinnedMessages((prev) =>
        prev[conversationId]
          ? { ...prev, [conversationId]: prev[conversationId].filter((m) => m._id !== messageId) }
          : prev
      );
    });

    socket.on('message:reacted', ({ messageId, conversationId, reactions }) =>
      setMessages((prev) => {
        const list = prev[conversationId];
        if (!list) return prev;
        return {
          ...prev,
          [conversationId]: list.map((m) => (m._id === messageId ? { ...m, reactions } : m)),
        };
      })
    );

    // Live update when someone changes name or color
    socket.on('user:updated', (u) => {
      const fix = (s) => (s && String(s._id) === String(u._id) ? { ...s, name: u.name, color: u.color } : s);
      setConversations((prev) =>
        prev.map((c) => (c.members?.length ? { ...c, members: c.members.map(fix) } : c))
      );
      setMessages((prev) =>
        Object.fromEntries(
          Object.entries(prev).map(([cid, list]) => [cid, list.map((m) => ({ ...m, sender: fix(m.sender) }))])
        )
      );
      setPinnedMessages((prev) =>
        Object.fromEntries(
          Object.entries(prev).map(([cid, list]) => [cid, list.map((m) => ({ ...m, sender: fix(m.sender) }))])
        )
      );
      setLast((prev) =>
        Object.fromEntries(Object.entries(prev).map(([cid, m]) => [cid, m ? { ...m, sender: fix(m.sender) } : m]))
      );
    });

    socket.on('typing', ({ conversationId, isTyping, user: u }) => {
      if (!isTyping) return dropTyping(conversationId, u._id);
      setTyping((prev) => ({
        ...prev,
        [conversationId]: { ...(prev[conversationId] || {}), [u._id]: u.name },
      }));
      clearTimeout(timers.current[`${conversationId}:${u._id}`]);
      timers.current[`${conversationId}:${u._id}`] = setTimeout(
        () => dropTyping(conversationId, u._id),
        4000
      );
    });

    const pending = timers.current;
    return () => {
      Object.values(pending).forEach(clearTimeout);
      socket.disconnect();
    };
  }, [user._id, markRead]);

  // Initial history for the active room
  useEffect(() => {
    setHistoryError(false);
    const id = activeId;
    if (!id || loadedRef.current.has(id)) return;
    loadedRef.current.add(id);
    setLoadingId(id);

    // Load message history
    api
      .get(`/conversations/${id}/messages`)
      .then((res) => {
        const data = res.data;
        const moreHeader = res.headers['x-has-more'];
        setHasMore((prev) => ({ ...prev, [id]: moreHeader === 'true' || data.length >= 50 }));
        setMessages((prev) => ({ ...prev, [id]: merge(data, prev[id] || []) }));
        if (data.length) {
          setLast((prev) => (prev[id] ? prev : { ...prev, [id]: data[data.length - 1] }));
        }
      })
      .catch(() => {
        loadedRef.current.delete(id);
        setHistoryError(true);
      })
      .finally(() => setLoadingId((cur) => (cur === id ? null : cur)));

    // Load pinned messages
    api
      .get(`/conversations/${id}/pinned`)
      .then(({ data }) => setPinnedMessages((prev) => ({ ...prev, [id]: data })))
      .catch(() => {});
  }, [activeId, historyKey]);

  // Load older messages (infinite scroll back)
  const loadOlder = useCallback(async () => {
    const id = activeRef.current;
    if (!id || loadingOlder || hasMore[id] === false) return;
    const currentList = messagesRef.current[id] || [];
    if (!currentList.length) return;

    const oldest = currentList[0];
    setLoadingOlder(true);
    try {
      const res = await api.get(`/conversations/${id}/messages`, {
        params: { before: oldest.createdAt, limit: 50 },
      });
      const data = res.data;
      const moreHeader = res.headers['x-has-more'];
      setHasMore((prev) => ({ ...prev, [id]: moreHeader === 'true' || data.length >= 50 }));
      setMessages((prev) => ({
        ...prev,
        [id]: merge(data, prev[id] || []),
      }));
    } catch (e) {
      console.error('Failed to load older messages:', e);
    } finally {
      setLoadingOlder(false);
    }
  }, [hasMore, loadingOlder]);

  const select = useCallback((id) => {
    setActiveId(id);
    setUnread((prev) => (prev[id] ? { ...prev, [id]: 0 } : prev));
  }, []);

  useEffect(() => {
    selectRef.current = select;
  }, [select]);

  const reloadHistory = useCallback(() => {
    loadedRef.current.delete(activeRef.current);
    setHistoryKey((k) => k + 1);
  }, []);

  const send = useCallback(
    (text, replyTo, attachment, audio, mentions) =>
      new Promise((resolve) => {
        const socket = socketRef.current;
        if (!socket?.connected) return resolve({ ok: false, error: 'Not connected yet. Reconnecting…' });
        socket
          .timeout(9000)
          .emit(
            'message:send',
            { conversationId: activeRef.current, text, replyTo, attachment, audio, mentions },
            (err, ack) => resolve(err ? { ok: false, error: 'The server took too long. Try again.' } : ack)
          );
      }),
    []
  );

  const request = useCallback(
    (event, payload) =>
      new Promise((resolve) => {
        const socket = socketRef.current;
        if (!socket?.connected) return resolve({ ok: false, error: 'Not connected yet. Reconnecting…' });
        socket
          .timeout(8000)
          .emit(event, payload, (err, ack) =>
            resolve(err ? { ok: false, error: 'The server took too long. Try again.' } : ack)
          );
      }),
    []
  );

  const pinMessage = useCallback(
    (messageId, pinned) => request('message:pin', { messageId, pinned }),
    [request]
  );

  const searchMessages = useCallback(async (conversationId, query) => {
    const { data } = await api.get(`/conversations/${conversationId}/search`, {
      params: { q: query },
    });
    return data;
  }, []);

  const editMessage = useCallback((messageId, text) => request('message:edit', { messageId, text }), [request]);
  const deleteMessage = useCallback((messageId) => request('message:delete', { messageId }), [request]);
  const hideMessage = useCallback((messageId) => request('message:hide', { messageId }), [request]);
  const reactToMessage = useCallback((messageId, key) => request('message:react', { messageId, key }), [request]);

  const sendTyping = useCallback((isTyping) => {
    socketRef.current?.emit('typing', { conversationId: activeRef.current, isTyping });
  }, []);

  const createRoom = useCallback(
    async (name, description) => {
      const { data } = await api.post('/conversations/channels', { name, description });
      setConversations((prev) => (prev.some((c) => c._id === data._id) ? prev : [...prev, data]));
      select(data._id);
      return data;
    },
    [select]
  );

  const openDm = useCallback(
    async (userId) => {
      const { data } = await api.post('/conversations/dm', { userId });
      setConversations((prev) => (prev.some((c) => c._id === data._id) ? prev : [...prev, data]));
      select(data._id);
      return data;
    },
    [select]
  );

  const createGroup = useCallback(
    async (name, memberIds, description) => {
      const { data } = await api.post('/conversations/groups', { name, memberIds, description });
      setConversations((prev) => (prev.some((c) => c._id === data._id) ? prev : [...prev, data]));
      select(data._id);
      return data;
    },
    [select]
  );

  const loading = activeId
    ? (messages[activeId] === undefined || loadingId === activeId) && !historyError
    : true;

  return {
    socket: socketInstance,
    conversations,
    activeId,
    messages,
    pinnedMessages: activeId ? pinnedMessages[activeId] || [] : [],
    loading,
    historyError,
    reloadHistory,
    loadError,
    loadConversations,
    unread,
    last,
    online,
    typing,
    status,
    reads,
    hasMore: activeId ? Boolean(hasMore[activeId]) : false,
    loadingOlder,
    loadOlder,
    select,
    send,
    sendTyping,
    createRoom,
    openDm,
    createGroup,
    pinMessage,
    searchMessages,
    editMessage,
    deleteMessage,
    hideMessage,
    reactToMessage,
  };
}
