import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Check } from 'lucide-react';
import api, { errorMessage } from '../lib/api';
import { useAuth } from '../context/AuthContext.jsx';
import Avatar from './Avatar.jsx';

const COLORS = ['#FFB547', '#7BC4A8', '#E07A5F', '#8FA8D6', '#C792B8', '#D4A373', '#6FB1C9', '#B5C46B'];

export default function SettingsModal({ onClose }) {
  const { user, updateUser } = useAuth();
  const [name, setName] = useState(user.name);
  const [color, setColor] = useState(user.color || COLORS[0]);
  const [profileMsg, setProfileMsg] = useState(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const [pwMsg, setPwMsg] = useState(null);
  const [savingPw, setSavingPw] = useState(false);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const saveProfile = async (e) => {
    e.preventDefault();
    setProfileMsg(null);
    if (name.trim().length < 2) return setProfileMsg({ ok: false, text: 'Name must be at least 2 characters.' });
    setSavingProfile(true);
    try {
      const { data } = await api.patch('/auth/profile', { name: name.trim(), color });
      updateUser({ name: data.name, color: data.color });
      setProfileMsg({ ok: true, text: 'Profile saved.' });
    } catch (err) {
      setProfileMsg({ ok: false, text: errorMessage(err) });
    } finally {
      setSavingProfile(false);
    }
  };

  const savePassword = async (e) => {
    e.preventDefault();
    setPwMsg(null);
    if (!pw.current) return setPwMsg({ ok: false, text: 'Enter your current password.' });
    if (pw.next.length < 6) return setPwMsg({ ok: false, text: 'New password must be at least 6 characters.' });
    if (pw.next !== pw.confirm) return setPwMsg({ ok: false, text: "The new passwords don't match." });
    if (pw.next === pw.current) return setPwMsg({ ok: false, text: 'Choose a different password from the current one.' });
    setSavingPw(true);
    try {
      await api.put('/auth/password', { currentPassword: pw.current, newPassword: pw.next });
      setPw({ current: '', next: '', confirm: '' });
      setPwMsg({ ok: true, text: 'Password updated.' });
    } catch (err) {
      setPwMsg({ ok: false, text: errorMessage(err) });
    } finally {
      setSavingPw(false);
    }
  };

  const setField = (key) => (e) => setPw({ ...pw, [key]: e.target.value });

  return (
    <motion.div
      className="modal-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        className="modal settings"
        initial={{ opacity: 0, y: 18, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 10, scale: 0.98 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      >
        <h3>Profile settings</h3>

        <form className="settings-sec" onSubmit={saveProfile} noValidate>
          <div className="settings-preview">
            <Avatar name={name || user.name} color={color} size={56} />
            <div>
              <strong>{name.trim() || user.name}</strong>
              <small>{user.email}</small>
            </div>
          </div>

          <label className="field">
            <span>Name</span>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
          </label>

          <div className="field">
            <span>Avatar color</span>
            <div className="swatches" role="radiogroup" aria-label="Avatar color">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={color === c}
                  aria-label={`Color ${c}`}
                  className={`swatch ${color === c ? 'on' : ''}`}
                  style={{ background: c }}
                  onClick={() => setColor(c)}
                >
                  {color === c && <Check size={16} />}
                </button>
              ))}
            </div>
          </div>

          {profileMsg && <p className={profileMsg.ok ? 'ok-msg' : 'form-error'} role="status">{profileMsg.text}</p>}
          <button className="btn btn-primary" disabled={savingProfile}>
            {savingProfile ? 'Saving…' : 'Save profile'}
          </button>
        </form>

        <div className="divider" />

        <form className="settings-sec" onSubmit={savePassword} noValidate>
          <h4>Change password</h4>
          <label className="field">
            <span>Current password</span>
            <input className="input" type="password" value={pw.current} onChange={setField('current')} autoComplete="current-password" />
          </label>
          <label className="field">
            <span>New password</span>
            <input className="input" type="password" value={pw.next} onChange={setField('next')} autoComplete="new-password" />
          </label>
          <label className="field">
            <span>Confirm new password</span>
            <input className="input" type="password" value={pw.confirm} onChange={setField('confirm')} autoComplete="new-password" />
          </label>
          {pwMsg && <p className={pwMsg.ok ? 'ok-msg' : 'form-error'} role="status">{pwMsg.text}</p>}
          <button className="btn btn-primary" disabled={savingPw}>
            {savingPw ? 'Updating…' : 'Update password'}
          </button>
        </form>

        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Close</button>
        </div>
      </motion.div>
    </motion.div>
  );
}