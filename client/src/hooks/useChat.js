import { useCallback, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import api from '../lib/api';

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
  const [loadingId, setLoadingId] = useState(null);
  const [historyError, setHistoryError] = useState(false);
  const [historyKey, setHistoryKey] = useState(0);
  const [loadError, setLoadError] = useState(false);
  const [unread, setUnread] = useState({});
  const [last, setLast] = useState({});
  const [online, setOnline] = useState(() => new Set());
  const [typing, setTyping] = useState({}); // conversationId -> { userId: name }
  const [status, setStatus] = useState('connecting');

  const socketRef = useRef(null);
  const activeRef = useRef(null);
  const loadedRef = useRef(new Set());
  const timers = useRef({});
  const authErrorRef = useRef(onAuthError);

  useEffect(() => { activeRef.current = activeId; }, [activeId]);
  useEffect(() => { authErrorRef.current = onAuthError; }, [onAuthError]);

  // Rooms
  const loadConversations = useCallback(async () => {
    setLoadError(false);
    try {
      const { data } = await api.get('/conversations');
      setConversations(data);
      setActiveId((cur) => cur || data.find((c) => c.slug === 'general')?._id || data[0]?._id || null);
    } catch {
      setLoadError(true);
    }
  }, []);

  useEffect(() => { loadConversations(); }, [loadConversations]);

  // Socket
  useEffect(() => {
    const socket = io(SOCKET_URL, {
      auth: (cb) => cb({ token: localStorage.getItem('token') }),
    });
    socketRef.current = socket;

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

    socket.on('presence:list', (ids) => setOnline(new Set(ids)));
    socket.on('presence:update', ({ userId, online: isOn }) =>
      setOnline((prev) => {
        const next = new Set(prev);
        if (isOn) next.add(userId); else next.delete(userId);
        return next;
      })
    );

    socket.on('conversation:created', (room) =>
      setConversations((prev) => (prev.some((c) => c._id === room._id) ? prev : [...prev, room]))
    );

    socket.on('message:new', (msg) => {
      const cid = msg.conversation;
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
    });

    socket.on('typing', ({ conversationId, isTyping, user: u }) => {
      if (!isTyping) return dropTyping(conversationId, u._id);
      setTyping((prev) => ({
        ...prev,
        [conversationId]: { ...(prev[conversationId] || {}), [u._id]: u.name },
      }));
      clearTimeout(timers.current[`${conversationId}:${u._id}`]);
      timers.current[`${conversationId}:${u._id}`] = setTimeout(
        () => dropTyping(conversationId, u._id), 4000
      );
    });

    const pending = timers.current;
    return () => {
      Object.values(pending).forEach(clearTimeout);
      socket.disconnect();
    };
  }, [user._id]);

  // History for the active room
  useEffect(() => {
    setHistoryError(false);
    const id = activeId;
    if (!id || loadedRef.current.has(id)) return;
    loadedRef.current.add(id);
    setLoadingId(id);
    api.get(`/conversations/${id}/messages`)
      .then(({ data }) => {
        setMessages((prev) => ({ ...prev, [id]: merge(data, prev[id] || []) }));
        if (data.length) setLast((prev) => (prev[id] ? prev : { ...prev, [id]: data[data.length - 1] }));
      })
      .catch(() => {
        loadedRef.current.delete(id);
        setHistoryError(true);
      })
      .finally(() => setLoadingId((cur) => (cur === id ? null : cur)));
  }, [activeId, historyKey]);

  const select = useCallback((id) => {
    setActiveId(id);
    setUnread((prev) => (prev[id] ? { ...prev, [id]: 0 } : prev));
  }, []);

  const reloadHistory = useCallback(() => {
    loadedRef.current.delete(activeRef.current);
    setHistoryKey((k) => k + 1);
  }, []);

  const send = useCallback((text) => new Promise((resolve) => {
    const socket = socketRef.current;
    if (!socket?.connected) return resolve({ ok: false, error: 'Not connected yet. Reconnecting…' });
    socket.timeout(8000).emit(
      'message:send',
      { conversationId: activeRef.current, text },
      (err, ack) => resolve(err ? { ok: false, error: 'The server took too long. Try again.' } : ack)
    );
  }), []);

  const sendTyping = useCallback((isTyping) => {
    socketRef.current?.emit('typing', { conversationId: activeRef.current, isTyping });
  }, []);

  const createRoom = useCallback(async (name, description) => {
    const { data } = await api.post('/conversations/channels', { name, description });
    setConversations((prev) => (prev.some((c) => c._id === data._id) ? prev : [...prev, data]));
    select(data._id);
    return data;
  }, [select]);

  const loading = activeId
    ? (messages[activeId] === undefined || loadingId === activeId) && !historyError
    : true;

  return {
    conversations, activeId, messages, loading, historyError, reloadHistory, loadError,
    loadConversations, unread, last, online, typing, status,
    select, send, sendTyping, createRoom,
  };
}