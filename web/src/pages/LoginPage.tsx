import { useState, type FormEvent } from 'react';
import { useNavigate, Link } from '@tanstack/react-router';
import { useAuth } from '@/hooks/useAuth';
import { ApiError } from '@/api/client';

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      await navigate({ to: '/' });
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message || 'Invalid credentials');
      } else {
        setError('Network error — is the API running?');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--paper)',
        display: 'grid',
        placeItems: 'center',
        padding: 24,
      }}
    >
      <div style={{ width: '100%', maxWidth: 380 }}>
        {/* Logo / wordmark */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 12,
              background: 'var(--ink)',
              color: 'var(--paper)',
              display: 'grid',
              placeItems: 'center',
              fontFamily: 'Libre Baskerville, serif',
              fontSize: 28,
              fontWeight: 700,
              margin: '0 auto 16px',
              letterSpacing: '-0.02em',
            }}
          >
            G
          </div>
          <div
            style={{
              fontFamily: 'Libre Baskerville, serif',
              fontSize: 24,
              fontWeight: 400,
              letterSpacing: '-0.01em',
              color: 'var(--ink)',
              marginBottom: 4,
            }}
          >
            Graphene Lab
          </div>
          <div
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 12,
              color: 'var(--muted)',
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
            }}
          >
            Project Management
          </div>
        </div>

        {/* Card */}
        <div
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--line)',
            borderRadius: 10,
            padding: '28px 28px 24px',
            boxShadow: '0 2px 8px rgba(20,18,14,0.06)',
          }}
        >
          <div
            style={{
              fontFamily: 'var(--sans)',
              fontSize: 15,
              fontWeight: 600,
              color: 'var(--ink)',
              marginBottom: 20,
            }}
          >
            Sign in
          </div>

          <form onSubmit={(e) => void handleSubmit(e)}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <span
                  style={{
                    fontFamily: 'var(--mono)',
                    fontSize: 11,
                    color: 'var(--muted-2)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                  }}
                >
                  Email
                </span>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="dev@graphene-lab.org"
                  required
                  autoComplete="email"
                  style={{
                    border: '1px solid var(--line-2)',
                    borderRadius: 6,
                    padding: '8px 10px',
                    font: '14px/1.5 var(--sans)',
                    color: 'var(--ink)',
                    background: 'var(--paper)',
                    outline: 'none',
                    width: '100%',
                  }}
                />
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <span
                  style={{
                    fontFamily: 'var(--mono)',
                    fontSize: 11,
                    color: 'var(--muted-2)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                  }}
                >
                  Password
                </span>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="devpassword"
                  required
                  autoComplete="current-password"
                  style={{
                    border: '1px solid var(--line-2)',
                    borderRadius: 6,
                    padding: '8px 10px',
                    font: '14px/1.5 var(--sans)',
                    color: 'var(--ink)',
                    background: 'var(--paper)',
                    outline: 'none',
                    width: '100%',
                  }}
                />
              </label>

              {error && (
                <div
                  style={{
                    background: 'var(--pill-blocked-bg)',
                    border: '1px solid var(--pill-blocked-bd)',
                    borderRadius: 6,
                    padding: '8px 12px',
                    fontFamily: 'var(--mono)',
                    fontSize: 12,
                    color: 'var(--pill-blocked-fg)',
                  }}
                >
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                style={{
                  background: 'var(--ink)',
                  color: 'var(--paper)',
                  border: 0,
                  borderRadius: 6,
                  padding: '10px 16px',
                  font: '13.5px/1 var(--sans)',
                  fontWeight: 600,
                  cursor: loading ? 'wait' : 'default',
                  opacity: loading ? 0.7 : 1,
                  letterSpacing: '-0.005em',
                  marginTop: 4,
                }}
              >
                {loading ? 'Signing in…' : 'Sign in'}
              </button>
            </div>
          </form>
        </div>

        <div
          style={{
            textAlign: 'center',
            marginTop: 20,
            fontFamily: 'var(--mono)',
            fontSize: 11,
            color: 'var(--muted-2)',
          }}
        >
          Don't have an account?{' '}
          <Link
            to="/register"
            style={{ color: 'var(--ember)', textDecoration: 'none' }}
          >
            Create one
          </Link>
        </div>
      </div>
    </div>
  );
}
