const jwt = require('jsonwebtoken');
const User = require('./models/User');
const Conversation = require('./models/Conversation');
const Message = require('./models/Message');
const mongoose = require('mongoose');
const ReadState = require('./models/ReadState');
const { getLinkPreview } = require('./utils/linkPreview');

const REACTION_KEYS = ['like', 'love', 'laugh', 'wow', 'fire', 'thanks'];

const room = (id) => `convo:${id}`;

const MSG_POPULATE = [
  { path: 'sender', select: 'name color' },
  { path: 'pinnedBy', select: 'name color' },
  { path: 'mentions', select: 'name color' },
  {
    path: 'replyTo',
    select: 'text attachment audio deleted sender',
    populate: { path: 'sender', select: 'name color' },
  },
];

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

    // 2. Join every channel, group, and DM this user belongs to
    const convos = await Conversation.find({
      $or: [
        { type: 'channel' },
        { type: { $in: ['dm', 'group'] }, members: socket.user._id },
      ],
    }).select('_id');
    socket.join(convos.map((c) => room(c._id)));
    socket.join(`user:${userId}`); // personal room, so we can message one user's tabs

    // 3. Presence
    if (!online.has(userId)) online.set(userId, new Set());
    online.get(userId).add(socket.id);
    if (online.get(userId).size === 1) io.emit('presence:update', { userId, online: true });
    socket.emit('presence:list', [...online.keys()]);

    // 4. Send a message
    const sent = [];
    socket.on(
      'message:send',
      async ({ conversationId, text, replyTo, attachment, audio, mentions } = {}, ack = () => {}) => {
        try {
          const now = Date.now();
          while (sent.length && now - sent[0] > 5000) sent.shift();
          if (sent.length >= 10) return ack({ ok: false, error: 'Slow down a little' });
          sent.push(now);

          const clean = typeof text === 'string' ? text.trim() : '';
          const validAttachment =
            attachment && typeof attachment.url === 'string'
              ? {
                  url: attachment.url,
                  publicId: attachment.publicId || null,
                  fileName: attachment.fileName || null,
                  fileType: attachment.fileType || null,
                  size: typeof attachment.size === 'number' ? attachment.size : null,
                }
              : null;

          const validAudio =
            audio && typeof audio.url === 'string'
              ? {
                  url: audio.url,
                  duration: typeof audio.duration === 'number' ? audio.duration : 0,
                  publicId: audio.publicId || null,
                }
              : null;

          if (!clean && !validAttachment && !validAudio) {
            return ack({ ok: false, error: 'Message cannot be empty' });
          }
          if (clean.length > 2000) return ack({ ok: false, error: 'Message is too long' });
          if (!socket.rooms.has(room(conversationId))) {
            return ack({ ok: false, error: 'You are not part of this conversation' });
          }

          let replyId = null;
          if (replyTo) {
            const original = mongoose.isValidObjectId(replyTo)
              ? await Message.findOne({ _id: replyTo, conversation: conversationId }).select('_id')
              : null;
            if (!original) return ack({ ok: false, error: 'The original message was not found' });
            replyId = original._id;
          }

          // Fetch link preview asynchronously if any URL present
          let linkPreview = null;
          if (clean) {
            try {
              linkPreview = await getLinkPreview(clean);
            } catch {
              linkPreview = null;
            }
          }

          const validMentions = Array.isArray(mentions)
            ? mentions.filter((id) => mongoose.isValidObjectId(id))
            : [];

          const msg = await Message.create({
            conversation: conversationId,
            sender: socket.user._id,
            text: clean,
            replyTo: replyId,
            attachment: validAttachment,
            audio: validAudio,
            mentions: validMentions,
            linkPreview,
          });

          await msg.populate(MSG_POPULATE);

          io.to(room(conversationId)).emit('message:new', msg);
          ack({ ok: true, message: msg });
        } catch {
          ack({ ok: false, error: 'Could not send message' });
        }
      }
    );

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

        const msg = await Message.findOne({
          _id: messageId,
          sender: socket.user._id,
          deleted: { $ne: true },
        });
        if (!msg) return ack({ ok: false, error: 'Message not found' });
        if (!socket.rooms.has(room(msg.conversation))) return ack({ ok: false, error: 'Not allowed' });

        msg.text = clean;
        msg.edited = true;
        if (clean) {
          msg.linkPreview = await getLinkPreview(clean);
        } else {
          msg.linkPreview = null;
        }

        await msg.save();
        await msg.populate(MSG_POPULATE);
        io.to(room(msg.conversation)).emit('message:updated', msg);
        ack({ ok: true, message: msg });
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
          msg.attachment = null;
          msg.audio = null;
          msg.linkPreview = null;
          msg.pinned = false;
          await msg.save();
        }
        await msg.populate(MSG_POPULATE);
        io.to(room(msg.conversation)).emit('message:updated', msg);
        ack({ ok: true });
      } catch {
        ack({ ok: false, error: 'Could not delete message' });
      }
    });

    // 4c. Pin and Unpin messages
    socket.on('message:pin', async ({ messageId, pinned } = {}, ack = () => {}) => {
      try {
        if (tooFast()) return ack({ ok: false, error: 'Slow down a little' });
        if (!mongoose.isValidObjectId(messageId)) return ack({ ok: false, error: 'Message not found' });

        const msg = await Message.findById(messageId);
        if (!msg || msg.deleted) return ack({ ok: false, error: 'Message not found' });
        if (!socket.rooms.has(room(msg.conversation))) return ack({ ok: false, error: 'Not allowed' });

        const isPinned = Boolean(pinned);
        msg.pinned = isPinned;
        msg.pinnedAt = isPinned ? new Date() : null;
        msg.pinnedBy = isPinned ? socket.user._id : null;

        await msg.save();
        await msg.populate(MSG_POPULATE);

        io.to(room(msg.conversation)).emit('message:pinned', msg);
        ack({ ok: true, message: msg });
      } catch {
        ack({ ok: false, error: 'Could not pin message' });
      }
    });

    // 4d. Delete for me: hide any message from my own view only
    socket.on('message:hide', async ({ messageId } = {}, ack = () => {}) => {
      try {
        if (tooFast()) return ack({ ok: false, error: 'Slow down a little' });
        if (!mongoose.isValidObjectId(messageId)) return ack({ ok: false, error: 'Message not found' });

        const msg = await Message.findById(messageId).select('conversation');
        if (!msg) return ack({ ok: false, error: 'Message not found' });
        if (!socket.rooms.has(room(msg.conversation))) return ack({ ok: false, error: 'Not allowed' });

        await Message.updateOne({ _id: messageId }, { $addToSet: { hiddenFor: socket.user._id } });
        io.to(`user:${userId}`).emit('message:hidden', {
          messageId: String(messageId),
          conversationId: String(msg.conversation),
        });
        ack({ ok: true });
      } catch {
        ack({ ok: false, error: 'Could not delete the message' });
      }
    });

    // 4e. Read receipts (direct messages and groups)
    const lastReadEmit = {};
    socket.on('conversation:read', async ({ conversationId } = {}) => {
      try {
        if (!mongoose.isValidObjectId(conversationId)) return;
        if (!socket.rooms.has(room(conversationId))) return;
        const nowMs = Date.now();
        if (nowMs - (lastReadEmit[conversationId] || 0) < 400) return;
        lastReadEmit[conversationId] = nowMs;

        const convo = await Conversation.findById(conversationId).select('type');
        if (!convo || !['dm', 'group'].includes(convo.type)) return;

        const at = new Date();
        await ReadState.updateOne(
          { conversation: conversationId, user: socket.user._id },
          { $set: { lastReadAt: at } },
          { upsert: true }
        );
        io.to(room(conversationId)).emit('conversation:read', {
          conversationId: String(conversationId),
          userId,
          at,
        });
      } catch {
        /* ignore */
      }
    });

    // 4f. Reactions
    socket.on('message:react', async ({ messageId, key } = {}, ack = () => {}) => {
      try {
        if (tooFast()) return ack({ ok: false, error: 'Slow down a little' });
        if (!REACTION_KEYS.includes(key)) return ack({ ok: false, error: 'Unknown reaction' });
        if (!mongoose.isValidObjectId(messageId)) return ack({ ok: false, error: 'Message not found' });

        const msg = await Message.findById(messageId).select('conversation deleted reactions');
        if (!msg || msg.deleted) return ack({ ok: false, error: 'Message not found' });
        if (!socket.rooms.has(room(msg.conversation))) return ack({ ok: false, error: 'Not allowed' });

        const mine = msg.reactions.find((r) => String(r.user) === userId);
        await Message.updateOne({ _id: messageId }, { $pull: { reactions: { user: socket.user._id } } });
        if (!mine || mine.key !== key) {
          await Message.updateOne(
            { _id: messageId },
            { $push: { reactions: { user: socket.user._id, key } } }
          );
        }

        const fresh = await Message.findById(messageId).select('reactions');
        io.to(room(msg.conversation)).emit('message:reacted', {
          messageId: String(messageId),
          conversationId: String(msg.conversation),
          reactions: fresh.reactions,
        });
        ack({ ok: true });
      } catch {
        ack({ ok: false, error: 'Could not react' });
      }
    });

    // 5. Typing indicator
    socket.on('typing', ({ conversationId, isTyping } = {}) => {
      if (!socket.rooms.has(room(conversationId))) return;
      socket.to(room(conversationId)).emit('typing', {
        conversationId,
        isTyping: Boolean(isTyping),
        user: { _id: userId, name: socket.user.name },
      });
    });

        // 6. WebRTC Audio & Video Calling
    socket.on('call:initiate', ({ conversationId, isVideo } = {}, ack = () => {}) => {
      try {
        if (!conversationId || !socket.rooms.has(room(conversationId))) {
          return ack({ ok: false, error: 'You are not in this conversation' });
        }
        const callId = `call_${conversationId}_${Date.now()}`;
        socket.activeCallId = callId;
        socket.activeCallConvo = conversationId;

        socket.to(room(conversationId)).emit('call:incoming', {
          callId,
          conversationId,
          isVideo: Boolean(isVideo),
          caller: {
            _id: socket.user._id,
            name: socket.user.name,
            color: socket.user.color,
          },
        });

        ack({ ok: true, callId });
      } catch (err) {
        ack({ ok: false, error: 'Failed to initiate call' });
      }
    });

    socket.on('call:accept', ({ callId, conversationId } = {}, ack = () => {}) => {
      if (!conversationId || !socket.rooms.has(room(conversationId))) return ack({ ok: false });
      socket.activeCallId = callId;
      socket.activeCallConvo = conversationId;

      socket.to(room(conversationId)).emit('call:accepted', {
        callId,
        conversationId,
        user: {
          _id: socket.user._id,
          name: socket.user.name,
          color: socket.user.color,
        },
      });
      ack({ ok: true });
    });

    socket.on('call:reject', ({ callId, conversationId } = {}) => {
      if (!conversationId) return;
      socket.to(room(conversationId)).emit('call:rejected', {
        callId,
        conversationId,
        user: { _id: socket.user._id, name: socket.user.name },
      });
    });

    socket.on('call:signal', ({ callId, conversationId, signal, toUserId } = {}) => {
      if (!callId || !signal) return;
      const payload = {
        callId,
        conversationId,
        signal,
        fromUserId: String(socket.user._id),
      };
      if (toUserId) {
        socket.to(`user:${toUserId}`).emit('call:signal', payload);
      } else if (conversationId) {
        socket.to(room(conversationId)).emit('call:signal', payload);
      }
    });

    socket.on('call:ice-candidate', ({ callId, conversationId, candidate, toUserId } = {}) => {
      if (!callId || !candidate) return;
      const payload = {
        callId,
        conversationId,
        candidate,
        fromUserId: String(socket.user._id),
      };
      if (toUserId) {
        socket.to(`user:${toUserId}`).emit('call:ice-candidate', payload);
      } else if (conversationId) {
        socket.to(room(conversationId)).emit('call:ice-candidate', payload);
      }
    });

    socket.on('call:toggle-media', ({ callId, conversationId, audioMuted, videoMuted } = {}) => {
      if (!conversationId) return;
      socket.to(room(conversationId)).emit('call:media-toggled', {
        callId,
        conversationId,
        userId: String(socket.user._id),
        audioMuted: Boolean(audioMuted),
        videoMuted: Boolean(videoMuted),
      });
    });

    socket.on('call:end', ({ callId, conversationId } = {}) => {
      socket.activeCallId = null;
      socket.activeCallConvo = null;
      if (conversationId) {
        io.to(room(conversationId)).emit('call:ended', {
          callId,
          conversationId,
          endedBy: String(socket.user._id),
        });
      }
    });

// 7. Disconnect
    socket.on('disconnect', () => {
      if (socket.activeCallId && socket.activeCallConvo) {
        io.to(room(socket.activeCallConvo)).emit('call:ended', {
          callId: socket.activeCallId,
          conversationId: socket.activeCallConvo,
          endedBy: String(socket.user._id),
        });
      }
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
