const router = require('express').Router();
const mongoose = require('mongoose');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const { protect } = require('../middleware/auth');
const { toSlug } = require('../utils/slug');
const User = require('../models/User');

router.use(protect);

// List: all channels plus the direct messages I'm part of
router.get('/', async (req, res) => {
  try {
    const list = await Conversation.find({
      $or: [{ type: 'channel' }, { type: 'dm', members: req.user._id }],
    })
      .sort({ type: 1, createdAt: 1 })
      .populate('members', 'name color');
    res.json(list);
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
      type: 'channel', name, slug, description, createdBy: req.user._id,
    });
    const io = req.app.get('io');
    io.socketsJoin(`convo:${room._id}`);        // everyone online joins the new room
    io.emit('conversation:created', room);      // and sidebars update live
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
      if (err.code !== 11000) throw err;   // two requests raced; the other one won
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

// Message history: the latest 50, oldest first. ?before=<date> loads older ones.
router.get('/:id/messages', async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(404).json({ message: 'Conversation not found' });

    const convo = await Conversation.findById(id);
    if (!convo) return res.status(404).json({ message: 'Conversation not found' });

    const allowed = convo.type === 'channel' || convo.members.some((m) => m.equals(req.user._id));
    if (!allowed) return res.status(403).json({ message: 'You are not part of this conversation' });

    const filter = { conversation: id };
    if (req.query.before) filter.createdAt = { $lt: new Date(req.query.before) };

    const messages = await Message.find(filter)
      .sort({ createdAt: -1 })
      .limit(50)
      .populate('sender', 'name color');
    res.json(messages.reverse());
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;