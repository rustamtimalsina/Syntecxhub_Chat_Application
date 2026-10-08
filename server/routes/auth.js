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

module.exports = router;