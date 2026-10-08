import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { errorMessage } from '../lib/api';
import ThemeToggle from '../components/ThemeToggle.jsx';
import StageVisual from '../components/StageVisual.jsx';
import './auth.css';

export default function Auth({ mode }) {
  const isLogin = mode === 'login';
  const { login, register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [show, setShow] = useState(false);

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!isLogin && !form.name.trim()) return setError('Enter your name.');
    if (!/^\S+@\S+\.\S+$/.test(form.email)) return setError('Enter a valid email address.');
    if (form.password.length < 6) return setError('Password must be at least 6 characters.');

    setLoading(true);
    try {
      if (isLogin) await login(form.email, form.password);
      else await register(form.name, form.email, form.password);
      navigate('/');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="auth">
      <section className="auth-stage">
        <div className="wordmark"><span className="onair" />Nightdesk</div>

        <div className="stage-copy">
          <h2 className="stage-title">Talk like you're in the <em>same room.</em></h2>
          <p className="stage-sub">Rooms, presence and typing, live as it happens.</p>
        </div>

        <StageVisual />
      </section>

      <section className="auth-side">
        <ThemeToggle className="auth-theme" />

        <motion.form
          key={mode}
          className="auth-form"
          onSubmit={submit}
          noValidate
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        >
          <div>
            <h1>{isLogin ? 'Welcome back' : 'Create your account'}</h1>
            <p className="auth-lede">
              {isLogin ? 'Log in to pick up your conversations.' : 'It takes a few seconds.'}
            </p>
          </div>

          {error && <p className="form-error" role="alert">{error}</p>}

          {!isLogin && (
            <label className="field">
              <span>Name</span>
              <input className="input" value={form.name} onChange={set('name')} autoComplete="name" />
            </label>
          )}

          <label className="field">
            <span>Email</span>
            <input className="input" type="email" value={form.email} onChange={set('email')} autoComplete="email" />
          </label>

          <label className="field">
            <span>Password</span>
            <div className="pw">
              <input
                className="input"
                type={show ? 'text' : 'password'}
                value={form.password}
                onChange={set('password')}
                autoComplete={isLogin ? 'current-password' : 'new-password'}
              />
              <button type="button" className="pw-toggle" onClick={() => setShow(!show)} aria-label={show ? 'Hide password' : 'Show password'}>
                {show ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </label>

          <button className="btn btn-primary" disabled={loading}>
            {loading ? <><Loader2 size={18} className="spin" /> Please wait</> : isLogin ? 'Log in' : 'Create account'}
          </button>

          <p className="auth-switch">
            {isLogin ? 'New to Nightdesk? ' : 'Already have an account? '}
            <Link to={isLogin ? '/register' : '/login'}>{isLogin ? 'Create an account' : 'Log in'}</Link>
          </p>
        </motion.form>
      </section>
    </main>
  );
}