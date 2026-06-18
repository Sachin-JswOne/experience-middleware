import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!username || !password) {
      setError('Please enter your username and password.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await login(username, password);
      navigate('/');
    } catch {
      setError('Invalid username or password.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      background: 'var(--color-surface-soft)',
      padding: 'var(--space-xl)',
    }}>
      {/* Wordmark */}
      <div style={{ marginBottom: 'var(--space-xxl)', textAlign: 'center' }}>
        <div style={{
          width: '52px',
          height: '52px',
          borderRadius: 'var(--radius-lg)',
          background: 'var(--gradient-primary)',
          boxShadow: 'var(--shadow-colored)',
          margin: '0 auto var(--space-base)',
        }} />
        <div style={{
          fontSize: '22px',
          fontWeight: 700,
          color: 'var(--color-heading)',
          letterSpacing: '-0.02em',
          marginBottom: 'var(--space-xxs)',
        }}>
          BEFE Admin
        </div>
        <div style={{ fontSize: '14px', color: 'var(--color-muted)' }}>
          Experience middleware configuration
        </div>
      </div>

      {/* Card */}
      <div className="card" style={{ width: '100%', maxWidth: '380px' }}>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-base)' }}>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--color-heading)', marginBottom: 'var(--space-xxs)' }}>
              Username
            </label>
            <input
              className="input"
              type="text"
              placeholder="admin"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              autoFocus
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--color-heading)', marginBottom: 'var(--space-xxs)' }}>
              Password
            </label>
            <input
              className="input"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>

          {error && (
            <p className="text-error" role="alert">{error}</p>
          )}

          <button
            type="submit"
            className="btn btn--primary"
            disabled={loading}
            style={{ width: '100%', marginTop: 'var(--space-xs)' }}
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}