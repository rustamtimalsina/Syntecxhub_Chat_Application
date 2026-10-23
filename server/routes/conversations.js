const router = require('express').Router();
const mongoose = require('mongoose');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const { protect } = require('../middleware/auth');
const { toSlug } = require('../utils/slug');
const User = require('../models/User');
const ReadState = require('../models/ReadState');

router.use(protect);

// List: all channels plus direct messages and groups I'm part of
router.get('/', async (req, res) => {
  try {
    const list = await Conversation.find({
      $or: [
        { type: 'channel' },
        { type: { $in: ['dm', 'group'] }, members: req.user._id },
      ],
    })
      .sort({ type: 1, createdAt: 1 })
      .populate('members', 'name color')
      .populate('createdBy', 'name color');

    const trackedIds = list.filter((c) => c.type === 'dm' || c.type === 'group').map((c) => c._id);
    const states = trackedIds.length
      ? await ReadState.find({ conversation: { $in: trackedIds } }).select('conversation user lastReadAt')
      : [];
    const reads = {};
    states.forEach((s) => {
      (reads[s.conversation] ||= {})[s.user] = s.lastReadAt;
    });
    res.json(list.map((c) => ({ ...c.toObject(), reads: reads[c._id] || {} })));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Create a channel
router.post('/channels', async (req, res) => {
  try {
    const name = (req.body.name || '').trim();
    const description = (req.body.description || '').trim();
    const slug = toSlug(name);
    if (name.length < 2 || !slug) {
      return res.status(400).json({ message: 'Room name must be at least 2 characters' });
    }
    if (await Conversation.exists({ type: 'channel', slug })) {
      return res.status(400).json({ message: 'A room with that name already exists' });
    }
    const room = await Conversation.create({
      type: 'channel',
      name,
      slug,
      description,
      createdBy: req.user._id,
    });
    const io = req.app.get('io');
    io.socketsJoin(`convo:${room._id}`); // everyone online joins the new room
    io.emit('conversation:created', room); // and sidebars update live
    res.status(201).json(room);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Start (or reopen) a private chat with one other user
router.post('/dm', async (req, res) => {
  try {
    const { userId } = req.body;
    if (!mongoose.isValidObjectId(userId)) {
      return res.status(400).json({ message: 'Invalid user' });
    }
    if (String(userId) === String(req.user._id)) {
      return res.status(400).json({ message: "You can't message yourself" });
    }
    if (!(await User.exists({ _id: userId }))) {
      return res.status(404).json({ message: 'User not found' });
    }

    const dmKey = [String(req.user._id), String(userId)].sort().join(':');
    const find = () =>
      Conversation.findOneAndUpdate(
        { dmKey },
        { $setOnInsert: { type: 'dm', dmKey, members: [req.user._id, userId], createdBy: req.user._id } },
        { upsert: true, new: true }
      );

    let convo;
    try {
      convo = await find();
    } catch (err) {
      if (err.code !== 11000) throw err; // two requests raced; the other one won
      convo = await Conversation.findOne({ dmKey });
    }
    await convo.populate('members', 'name color');

    // Put both users' open sockets into the room and show the chat in both sidebars
    const io = req.app.get('io');
    const ids = [String(req.user._id), String(userId)];
    ids.forEach((id) => io.in(`user:${id}`).socketsJoin(`convo:${convo._id}`));
    io.to(ids.map((id) => `user:${id}`)).emit('conversation:created', convo);

    res.json(convo);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Create a private multi-user group chat
router.post('/groups', async (req, res) => {
  try {
    const name = (req.body.name || '').trim();
    const memberIds = Array.isArray(req.body.memberIds) ? req.body.memberIds : [];

    if (name.length < 2 || name.length > 40) {
      return res.status(400).json({ message: 'Group name must be between 2 and 40 characters' });
    }

    // Filter valid unique IDs excluding caller
    const uniqueIds = [
      ...new Set(
        memberIds.filter(
          (id) => mongoose.isValidObjectId(id) && String(id) !== String(req.user._id)
        )
      ),
    ];

    if (uniqueIds.length < 1) {
      return res.status(400).json({ message: 'Select at least 1 other person for the group' });
    }

    const validUsersCount = await User.countDocuments({ _id: { $in: uniqueIds } });
    if (validUsersCount !== uniqueIds.length) {
      return res.status(400).json({ message: 'One or more selected users do not exist' });
    }

    const members = [req.user._id, ...uniqueIds];
    const group = await Conversation.create({
      type: 'group',
      name,
      members,
      createdBy: req.user._id,
      description: (req.body.description || '').trim(),
    });

    await group.populate([
      { path: 'members', select: 'name color' },
      { path: 'createdBy', select: 'name color' },
    ]);

    const io = req.app.get('io');
    const strIds = members.map((m) => String(m._id || m));
    strIds.forEach((id) => io.in(`user:${id}`).socketsJoin(`convo:${group._id}`));
    io.to(strIds.map((id) => `user:${id}`)).emit('conversation:created', group);

    res.status(201).json(group);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Add or remove members in a group
router.patch('/:id/members', async (req, res) => {
  try {
    const { id } = req.params;
    const { action, userId } = req.body; // action: 'add' | 'remove' | 'leave'
    if (!mongoose.isValidObjectId(id) || (!['leave'].includes(action) && !mongoose.isValidObjectId(userId))) {
      return res.status(400).json({ message: 'Invalid parameters' });
    }

    const convo = await Conversation.findById(id);
    if (!convo || convo.type !== 'group') {
      return res.status(404).json({ message: 'Group not found' });
    }

    const isMember = convo.members.some((m) => m.equals(req.user._id));
    if (!isMember) {
      return res.status(403).json({ message: 'You are not a member of this group' });
    }

    const io = req.app.get('io');
    const targetId = action === 'leave' ? req.user._id : userId;

    if (action === 'add') {
      if (convo.members.some((m) => m.equals(targetId))) {
        return res.status(400).json({ message: 'User is already a member' });
      }
      convo.members.push(targetId);
      await convo.save();
      await convo.populate('members', 'name color');
      io.in(`user:${targetId}`).socketsJoin(`convo:${convo._id}`);
      io.to(`user:${targetId}`).emit('conversation:created', convo);
      io.to(`convo:${convo._id}`).emit('group:updated', convo);
    } else if (action === 'remove' || action === 'leave') {
      const isCreator = convo.createdBy?.equals(req.user._id);
      if (action === 'remove' && !isCreator) {
        return res.status(403).json({ message: 'Only the group creator can remove members' });
      }
      convo.members = convo.members.filter((m) => !m.equals(targetId));
      await convo.save();
      await convo.populate('members', 'name color');
      io.in(`user:${targetId}`).socketsLeave(`convo:${convo._id}`);
      io.to(`user:${targetId}`).emit('group:removed', { conversationId: convo._id });
      io.to(`convo:${convo._id}`).emit('group:updated', convo);
    }

    res.json(convo);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Message history: default limit 50, oldest first. ?before=<date> loads older ones.
router.get('/:id/messages', async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(404).json({ message: 'Conversation not found' });

    const convo = await Conversation.findById(id);
    if (!convo) return res.status(404).json({ message: 'Conversation not found' });

    const allowed = convo.type === 'channel' || convo.members.some((m) => m.equals(req.user._id));
    if (!allowed) return res.status(403).json({ message: 'You are not part of this conversation' });

    const filter = { conversation: id, hiddenFor: { $ne: req.user._id } };
    if (req.query.before) filter.createdAt = { $lt: new Date(req.query.before) };

    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 100);

    const messages = await Message.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit + 1)
      .populate([
        { path: 'sender', select: 'name color' },
        {
          path: 'replyTo',
          select: 'text attachment deleted sender',
          populate: { path: 'sender', select: 'name color' },
        },
      ]);

    const hasMore = messages.length > limit;
    const items = hasMore ? messages.slice(0, limit) : messages;

    res.set('X-Has-More', hasMore ? 'true' : 'false');
    res.set('Access-Control-Expose-Headers', 'X-Has-More');

    res.json(items.reverse());
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
