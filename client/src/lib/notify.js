let enabled = false;
try { enabled = localStorage.getItem('notify') === '1'; } catch { /* ignore */ }

const save = (v) => { try { localStorage.setItem('notify', v ? '1' : '0'); } catch { /* ignore */ } };

export const supported = () => typeof Notification !== 'undefined';
export const isEnabled = () => enabled && supported() && Notification.permission === 'granted';

// Must be called from a click, because browsers only show the permission prompt after a user gesture
export const enable = async () => {
  if (!supported()) return 'unsupported';
  let result = Notification.permission;
  if (result === 'default') result = await Notification.requestPermission();
  if (result === 'granted') { enabled = true; save(true); }
  return result;
};

export const disable = () => { enabled = false; save(false); };

// Only notify when the app isn't the window you're looking at
export const showNotification = ({ title, body, tag, onClick }) => {
  if (!isEnabled()) return;
  if (document.hasFocus() && !document.hidden) return;
  try {
    const n = new Notification(title, { body, tag, icon: '/favicon.svg' });
    n.onclick = () => {
      window.focus();
      onClick?.();
      n.close();
    };
  } catch { /* some mobile browsers don't allow this */ }
};