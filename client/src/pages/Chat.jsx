import { useAuth } from '../context/AuthContext.jsx';

export default function Chat() {
  const { user, logout } = useAuth();
  return (
    <main style={{ display: 'grid', placeItems: 'center', height: '100%', gap: 16, textAlign: 'center' }}>
      <div>
        <h1>Signed in as {user.name}</h1>
        <p style={{ color: 'var(--text-2)' }}>The chat screen arrives in Step 7.</p>
        <button className="btn btn-primary" onClick={logout}>Log out</button>
      </div>
    </main>
  );
}