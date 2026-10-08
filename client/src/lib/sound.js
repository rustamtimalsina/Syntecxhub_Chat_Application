let ctx = null;
let lastIncoming = 0;
let muted = false;
try { muted = localStorage.getItem('muted') === '1'; } catch { /* ignore */ }

const getCtx = () => {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  return ctx;
};

// Browsers only allow sound after a user gesture, so this runs on the first click or keypress
export const unlockAudio = () => {
  const c = getCtx();
  if (c && c.state === 'suspended') c.resume().catch(() => {});
};

export const isMuted = () => muted;

export const setMuted = (value) => {
  muted = value;
  try { localStorage.setItem('muted', value ? '1' : '0'); } catch { /* ignore */ }
};

// One soft sine note with a quick fade in and out, which avoids clicks
const note = (c, freq, start, duration, volume) => {
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(freq, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(gain).connect(c.destination);
  osc.start(start);
  osc.stop(start + duration + 0.02);
};

const play = (notes) => {
  if (muted) return;
  const c = getCtx();
  if (!c) return;
  if (c.state === 'suspended') c.resume().catch(() => {});
  if (c.state !== 'running') return; // not unlocked yet, so stay silent
  const t = c.currentTime;
  notes.forEach(([freq, offset, dur, vol]) => note(c, freq, t + offset, dur, vol));
};

// A5 then E6: a bright, short two-note chime
export const playIncoming = () => {
  const now = Date.now();
  if (now - lastIncoming < 300) return; // a burst of messages makes one chime
  lastIncoming = now;
  play([[880, 0, 0.2, 0.12], [1318.5, 0.1, 0.3, 0.1]]);
};

// E5: one quiet tick
export const playSent = () => play([[659.25, 0, 0.14, 0.05]]);