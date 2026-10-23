import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { X, Search, Check, Users, Loader2 } from 'lucide-react';
import api, { errorMessage } from '../lib/api';
import Avatar from './Avatar.jsx';

export default function NewGroupModal({ myId, onCreateGroup, onClose }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [query, setQuery] = useState('');
  const [people, setPeople] = useState([]);
  const [selected, setSelected] = useState([]); // array of user objects
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const nameInputRef = useRef(null);

  useEffect(() => {
    nameInputRef.current?.focus();
  }, []);

  const q = query.trim().toLowerCase();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(() => {
      api
        .get('/users', { params: { q } })
        .then(({ data }) => {
          if (!cancelled) {
            setPeople(data.filter((u) => String(u._id) !== String(myId)));
          }
        })
        .catch(() => {
          if (!cancelled) setPeople([]);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 200);

    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q, myId]);

  const toggleUser = (u) => {
    setError('');
    if (selected.some((s) => s._id === u._id)) {
      setSelected((prev) => prev.filter((s) => s._id !== u._id));
    } else {
      setSelected((prev) => [...prev, u]);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    const cleanName = name.trim();
    if (cleanName.length < 2 || cleanName.length > 40) {
      setError('Group name must be between 2 and 40 characters');
      return;
    }
    if (selected.length < 1) {
      setError('Select at least 1 other person for the group');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      await onCreateGroup(
        cleanName,
        selected.map((s) => s._id),
        description.trim()
      );
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="backdrop" onClick={onClose}>
      <motion.div
        className="modal modal-group"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-group-title"
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 8 }}
        transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="modal-head">
          <div className="modal-icon-title">
            <Users size={20} />
            <h2 id="new-group-title">New Group Chat</h2>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close dialog">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={submit} className="modal-form">
          {error && <p className="form-error" role="alert">{error}</p>}

          <label className="field">
            <span>Group Name</span>
            <input
              ref={nameInputRef}
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Design Team, Project Alpha"
              maxLength={40}
              required
            />
          </label>

          <label className="field">
            <span>Description (Optional)</span>
            <input
              className="input"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this group for?"
              maxLength={120}
            />
          </label>

          <div className="field">
            <span>Members ({selected.length} selected)</span>

            {selected.length > 0 && (
              <div className="selected-chips">
                {selected.map((u) => (
                  <span key={u._id} className="selected-chip">
                    <Avatar name={u.name} color={u.color} size={18} />
                    <span>{u.name}</span>
                    <button
                      type="button"
                      onClick={() => toggleUser(u)}
                      aria-label={`Remove ${u.name}`}
                    >
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>
            )}

            <div className="input-search-wrap">
              <Search size={15} />
              <input
                className="input input-search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search people by name..."
              />
            </div>

            <div className="member-picker-list">
              {loading && <p className="sb-empty">Searching...</p>}
              {!loading && people.length === 0 && (
                <p className="sb-empty">{q ? 'No matching people found' : 'No other users registered'}</p>
              )}
              {people.map((u) => {
                const isPicked = selected.some((s) => s._id === u._id);
                return (
                  <button
                    key={u._id}
                    type="button"
                    className={`member-pick-row ${isPicked ? 'picked' : ''}`}
                    onClick={() => toggleUser(u)}
                  >
                    <div className="member-info">
                      <Avatar name={u.name} color={u.color} size={28} />
                      <span className="member-name">{u.name}</span>
                    </div>
                    <div className={`pick-check ${isPicked ? 'checked' : ''}`}>
                      {isPicked && <Check size={14} />}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="modal-foot">
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={submitting || !name.trim() || selected.length === 0}
            >
              {submitting ? <Loader2 size={16} className="spin" /> : 'Create Group'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
