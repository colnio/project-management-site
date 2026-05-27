import { useState, type FormEvent } from 'react';
import { Link } from '@tanstack/react-router';
import { useAuth } from '@/hooks/useAuth';
import { ApiError } from '@/api/client';

export function RegisterPage() {
  const { register } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== passwordConfirm) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);
    try {
      await register(email, password, passwordConfirm);
      setSuccess(true);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message || 'Registration failed');
      } else {
        setError('Network error — is the API running?');
      }
    } finally {
      setLoading(false);
    }
  };

  const inputStyle = {
    border: '1px solid var(--line-2)',
    borderRadius: 6,
    padding: '8px 10px',
    font: '14px/1.5 var(--sans)',
    color: 'var(--ink)',
    background: 'var(--paper)',
    outline: 'none',
    width: '100%',
  } as const;

  const labelStyle = {
    fontFamily: 'var(--mono)',
    fontSize: 11,
    color: 'var(--muted-2)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.06em',
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
          {success ? (
            /* ─── Success panel ─── */
            <div style={{ textAlign: 'center' }}>
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: '50%',
                  background: 'var(--paper-2)',
                  border: '1px solid var(--line)',
                  display: 'grid',
                  placeItems: 'center',
                  margin: '0 auto 16px',
                  fontSize: 22,
                }}
              >
                ✓
              </div>
              <div
                style={{
                  fontFamily: 'var(--sans)',
                  fontSize: 15,
                  fontWeight: 600,
                  color: 'var(--ink)',
                  marginBottom: 10,
                }}
              >
                Account request submitted
              </div>
              <div
                style={{
                  fontFamily: 'var(--mono)',
                  fontSize: 12,
                  color: 'var(--muted)',
                  lineHeight: 1.6,
                  marginBottom: 20,
                }}
              >
                Your account is awaiting admin or PI approval. Check back later — you'll be able to sign in once approved.
              </div>
              <Link
                to="/login"
                style={{
                  fontFamily: 'var(--mono)',
                  fontSize: 12,
                  color: 'var(--ember)',
                  textDecoration: 'none',
                }}
              >
                Back to sign in
              </Link>
            </div>
          ) : (
            /* ─── Registration form ─── */
            <>
              <div
                style={{
                  fontFamily: 'var(--sans)',
                  fontSize: 15,
                  fontWeight: 600,
                  color: 'var(--ink)',
                  marginBottom: 6,
                }}
              >
                Create an account
              </div>
              <div
                style={{
                  fontFamily: 'var(--mono)',
                  fontSize: 11,
                  color: 'var(--muted)',
                  marginBottom: 20,
                  lineHeight: 1.5,
                }}
              >
                NUS domain required (e.g. @u.nus.edu, @nus.edu.sg). Your account will require admin or PI approval before you can sign in.
              </div>

              <form onSubmit={(e) => void handleSubmit(e)}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    <span style={labelStyle}>Email</span>
                    <input
                      type="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="e1234567@u.nus.edu"
                      required
                      autoComplete="email"
                      style={inputStyle}
                    />
                  </label>

                  <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    <span style={labelStyle}>Password</span>
                    <input
                      type="password"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="At least 8 characters"
                      required
                      autoComplete="new-password"
                      style={inputStyle}
                    />
                  </label>

                  <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    <span style={labelStyle}>Confirm password</span>
                    <input
                      type="password"
                      value={passwordConfirm}
                      onChange={e => setPasswordConfirm(e.target.value)}
                      placeholder="Repeat your password"
                      required
                      autoComplete="new-password"
                      style={inputStyle}
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
                      cursor: loading ? 'wait' : 'pointer',
                      opacity: loading ? 0.7 : 1,
                      letterSpacing: '-0.005em',
                      marginTop: 4,
                    }}
                  >
                    {loading ? 'Submitting…' : 'Request access'}
                  </button>
                </div>
              </form>
            </>
          )}
        </div>

        {!success && (
          <div
            style={{
              textAlign: 'center',
              marginTop: 20,
              fontFamily: 'var(--mono)',
              fontSize: 11,
              color: 'var(--muted-2)',
            }}
          >
            Already have an account?{' '}
            <Link
              to="/login"
              style={{ color: 'var(--ember)', textDecoration: 'none' }}
            >
              Sign in
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
