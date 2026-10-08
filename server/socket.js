const jwt = require('jsonwebtoken');
const User = require('./models/User');
const Conversation = require('./models/Conversation');
const Message = require('./models/Message');
const mongoose = require('mongoose');

const room = (id) => `convo:${id}`;

module.exports = function setupSocket(io) {
  const online = new Map(); // userId -> Set of socket ids (one user can have many tabs)

  // 1. Authenticate every connection with the same JWT used for the REST API
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error('No token'));
      const { id } = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(id).select('name color');
      if (!user) return next(new Error('User not found'));
      socket.user = user;
      next();
    } catch {
      next(new Error('Invalid or expired token'));
    }
  });

  io.on('connection', async (socket) => {
    const userId = String(socket.user._id);

    // 2. Join every channel and every DM this user belongs to
    const convos = await Conversation.find({
      $or: [{ type: 'channel' }, { type: 'dm', members: socket.user._id }],
    }).select('_id');
    socket.join(convos.map((c) => room(c._id)));
    socket.join(`user:${userId}`);   // a personal room, so we can message one user's tabs

    // 3. Presence
    if (!online.has(userId)) online.set(userId, new Set());
    online.get(userId).add(socket.id);
    if (online.get(userId).size === 1) io.emit('presence:update', { userId, online: true });
    socket.emit('presence:list', [...online.keys()]);

    // 4. Send a message
    const sent = [];
    socket.on('message:send', async ({ conversationId, text } = {}, ack = () => {}) => {
      try {
        const now = Date.now();
        while (sent.length && now - sent[0] > 5000) sent.shift();
        if (sent.length >= 10) return ack({ ok: false, error: 'Slow down a little' });
        sent.push(now);

        const clean = typeof text === 'string' ? text.trim() : '';
        if (!clean) return ack({ ok: false, error: 'Message is empty' });
        if (clean.length > 2000) return ack({ ok: false, error: 'Message is too long' });
        if (!socket.rooms.has(room(conversationId))) {
          return ack({ ok: false, error: 'You are not part of this conversation' });
        }

        const msg = await Message.create({
          conversation: conversationId,
          sender: socket.user._id,
          text: clean,
        });
        await msg.populate('sender', 'name color');
        io.to(room(conversationId)).emit('message:new', msg);
        ack({ ok: true });
      } catch {
        ack({ ok: false, error: 'Could not send message' });
      }
    });
        // 4b. Edit and delete (only your own messages)
    const tooFast = () => {
      const now = Date.now();
      while (sent.length && now - sent[0] > 5000) sent.shift();
      if (sent.length >= 10) return true;
      sent.push(now);
      return false;
    };

    socket.on('message:edit', async ({ messageId, text } = {}, ack = () => {}) => {
      try {
        if (tooFast()) return ack({ ok: false, error: 'Slow down a little' });
        if (!mongoose.isValidObjectId(messageId)) return ack({ ok: false, error: 'Message not found' });
        const clean = typeof text === 'string' ? text.trim() : '';
        if (!clean) return ack({ ok: false, error: 'Message is empty' });
        if (clean.length > 2000) return ack({ ok: false, error: 'Message is too long' });

        const msg = await Message.findOne({ _id: messageId, sender: socket.user._id, deleted: { $ne: true } });
        if (!msg) return ack({ ok: false, error: 'Message not found' });
        if (!socket.rooms.has(room(msg.conversation))) return ack({ ok: false, error: 'Not allowed' });

        msg.text = clean;
        msg.edited = true;
        await msg.save();
        await msg.populate('sender', 'name color');
        io.to(room(msg.conversation)).emit('message:updated', msg);
        ack({ ok: true });
      } catch {
        ack({ ok: false, error: 'Could not edit message' });
      }
    });

    socket.on('message:delete', async ({ messageId } = {}, ack = () => {}) => {
      try {
        if (tooFast()) return ack({ ok: false, error: 'Slow down a little' });
        if (!mongoose.isValidObjectId(messageId)) return ack({ ok: false, error: 'Message not found' });

        const msg = await Message.findOne({ _id: messageId, sender: socket.user._id });
        if (!msg) return ack({ ok: false, error: 'Message not found' });
        if (!socket.rooms.has(room(msg.conversation))) return ack({ ok: false, error: 'Not allowed' });

        if (!msg.deleted) {
          msg.deleted = true;
          msg.text = '';
          await msg.save();
        }
        await msg.populate('sender', 'name color');
        io.to(room(msg.conversation)).emit('message:updated', msg);
        ack({ ok: true });
      } catch {
        ack({ ok: false, error: 'Could not delete message' });
      }
    });

    // 5. Typing indicator (not saved, only relayed)
    socket.on('typing', ({ conversationId, isTyping } = {}) => {
      if (!socket.rooms.has(room(conversationId))) return;
      socket.to(room(conversationId)).emit('typing', {
        conversationId,
        isTyping: Boolean(isTyping),
        user: { _id: userId, name: socket.user.name },
      });
    });

    // 6. Disconnect
    socket.on('disconnect', () => {
      const set = online.get(userId);
      if (!set) return;
      set.delete(socket.id);
      if (set.size === 0) {
        online.delete(userId);
        io.emit('presence:update', { userId, online: false });
      }
    });
  });
};