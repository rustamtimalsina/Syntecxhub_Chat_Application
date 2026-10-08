const router = require('express').Router();
const User = require('../models/User');
const { protect } = require('../middleware/auth');

router.use(protect);

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// List other people, optionally filtered by name. Never exposes emails.
router.get('/', async (req, res) => {
  try {
    const q = (req.query.q || '').trim().slice(0, 40);
    const filter = { _id: { $ne: req.user._id } };
    if (q) filter.name = new RegExp(escapeRegex(q), 'i');
    const users = await User.find(filter).select('name color').sort({ name: 1 }).limit(50);
    res.json(users);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;