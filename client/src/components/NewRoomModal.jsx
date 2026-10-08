import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { errorMessage } from '../lib/api';

export default function NewRoomModal({ onCreate, onClose }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (name.trim().length < 2) return setError('Room name must be at least 2 characters.');
    setBusy(true);
    try {
      await onCreate(name.trim(), description.trim());
      onClose();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <motion.div
      className="modal-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.form
        className="modal"
        onSubmit={submit}
        initial={{ opacity: 0, y: 18, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 10, scale: 0.98 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      >
        <h3>Create a room</h3>
        {error && <p className="form-error" role="alert">{error}</p>}
        <label className="field">
          <span>Name</span>
          <input ref={inputRef} className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
        </label>
        <label className="field">
          <span>Description (optional)</span>
          <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={120} />
        </label>
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy}>{busy ? 'Creating…' : 'Create room'}</button>
        </div>
      </motion.form>
    </motion.div>
  );
}