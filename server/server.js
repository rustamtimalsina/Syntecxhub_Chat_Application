require('dotenv').config();
const http = require('http');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { Server } = require('socket.io');
const { rateLimit } = require('express-rate-limit');
const connectDB = require('./config/db');
const seedDefaults = require('./utils/seed');

['MONGO_URI', 'JWT_SECRET'].forEach((key) => {
  if (!process.env[key]) {
    console.error(`Missing ${key} in .env`);
    process.exit(1);
  }
});

const app = express();
app.set('trust proxy', 1);
app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_URL || '*' }));
app.use(express.json({ limit: '10kb' }));

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api/users', require('./routes/users'));
// Strict limit on login/register: 20 attempts per 15 minutes per IP
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many attempts, please try again in 15 minutes.' },
});

app.use('/api/auth', authLimiter, require('./routes/auth'));
app.use('/api/conversations', require('./routes/conversations'));
// Socket.io shares the same HTTP server as Express
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: process.env.CLIENT_URL || '*' },
});

app.set('io', io); // lets REST routes reach the socket server
require('./socket')(io);

const PORT = process.env.PORT || 5001;

connectDB()
  .then(seedDefaults)
  .then(() => server.listen(PORT, () => console.log(`Server running on port ${PORT}`)))
  .catch((err) => {
    console.error('Startup failed:', err.message);
    process.exit(1);
  });