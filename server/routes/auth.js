const router = require('express').Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { protect } = require('../middleware/auth');

const makeToken = (id) => jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '7d' });

const payload = (u) => ({
  _id: u._id,
  name: u.name,
  email: u.email,
  color: u.color,
  token: makeToken(u._id),
});

router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    const user = await User.create({ name, email, password });
    res.status(201).json(payload(user));
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ message: 'That email is already registered' });
    }
    res.status(400).json({ message: err.message });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }
    const user = await User.findOne({ email: email.toLowerCase() }).select('+password');
    if (!user || !(await user.matchPassword(password))) {
      return res.status(401).json({ message: 'Incorrect email or password' });
    }
    res.json(payload(user));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/me', protect, (req, res) => {
  const { _id, name, email, color } = req.user;
  res.json({ _id, name, email, color });
});
const COLORS = ['#FFB547', '#7BC4A8', '#E07A5F', '#8FA8D6', '#C792B8', '#D4A373', '#6FB1C9', '#B5C46B'];

// Change my name and avatar color
router.patch('/profile', protect, async (req, res) => {
  try {
    const { name, color } = req.body;
    if (name !== undefined) {
      const clean = typeof name === 'string' ? name.trim() : '';
      if (clean.length < 2 || clean.length > 40) {
        return res.status(400).json({ message: 'Name must be 2 to 40 characters' });
      }
      req.user.name = clean;
    }
    if (color !== undefined) {
      if (!COLORS.includes(color)) return res.status(400).json({ message: 'Pick one of the listed colors' });
      req.user.color = color;
    }
    await req.user.save();

    const io = req.app.get('io');
    const fresh = { _id: req.user._id, name: req.user.name, color: req.user.color };
    // Keep this user's open sockets in sync, so typing indicators show the new name
    for (const s of io.sockets.sockets.values()) {
      if (String(s.user?._id) === String(req.user._id)) {
        s.user.name = fresh.name;
        s.user.color = fresh.color;
      }
    }
    io.emit('user:updated', fresh);
    res.json(fresh);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Change my password
router.put('/password', protect, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'Fill in both passwords' });
    }
    if (typeof newPassword !== 'string' || newPassword.length < 6) {
      return res.status(400).json({ message: 'New password must be at least 6 characters' });
    }
    const user = await User.findById(req.user._id).select('+password');
    // 400 on purpose: a 401 would make the app log you out
    if (!(await user.matchPassword(currentPassword))) {
      return res.status(400).json({ message: 'Current password is incorrect' });
    }
    user.password = newPassword;
    await user.save();
    res.json({ message: 'Password updated' });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

module.exports = router;