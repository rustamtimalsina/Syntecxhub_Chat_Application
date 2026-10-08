const { io } = require('socket.io-client');

const API = 'http://localhost:5001';
const PASSWORD = '123456';

const login = async (email) => {
  const res = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  return res.json();
};

const connect = (token, label) =>
  new Promise((resolve, reject) => {
    const socket = io(API, { auth: { token } });
    socket.on('presence:update', (p) => console.log(`${label} saw presence:`, p));
    socket.on('connect', () => { console.log(`${label} connected`); resolve(socket); });
    socket.on('connect_error', (e) => reject(new Error(`${label}: ${e.message}`)));
  });

(async () => {
  const [a, b] = await Promise.all([login('rustam@chat.com'), login('aarav@chat.com')]);

  const sa = await connect(a.token, 'Rustam');
  const sb = await connect(b.token, 'Aarav');

  const list = await (await fetch(`${API}/api/conversations`, {
    headers: { Authorization: `Bearer ${a.token}` },
  })).json();
  const general = list.find((c) => c.slug === 'general');

  sb.on('typing', (t) => console.log(`Aarav sees: ${t.user.name} typing = ${t.isTyping}`));
  sb.on('message:new', (m) => console.log(`Aarav received: "${m.text}" from ${m.sender.name}`));

  sa.emit('typing', { conversationId: general._id, isTyping: true });
  sa.emit('message:send', { conversationId: general._id, text: 'Hello from the test script' },
    (ack) => console.log('Rustam ack:', ack));

  // A bad token must be rejected
  const bad = io(API, { auth: { token: 'fake' } });
  bad.on('connect_error', (e) => console.log('Fake token rejected:', e.message));

  setTimeout(async () => {
    const hist = await (await fetch(`${API}/api/conversations/${general._id}/messages`, {
      headers: { Authorization: `Bearer ${a.token}` },
    })).json();
    console.log(`History in General: ${hist.length} message(s), latest: "${hist.at(-1)?.text}"`);
    process.exit(0);
  }, 1500);
})().catch((e) => { console.error('Test failed:', e.message); process.exit(1); });
