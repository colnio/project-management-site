/**
 * ProfileSetupPage — /profile/setup
 *
 * First-login gate: users with profile_completed=false are redirected here.
 * Non-skippable — no nav chrome, no way out until the form is submitted.
 * On success: re-fetches /v1/me (refreshUser) then navigates to '/'.
 */
import { useState, type FormEvent } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useAuth } from '@/hooks/useAuth';
import { api, ApiError } from '@/api/client';
import type { User } from '@/api/types';

const TITLE_OPTIONS = [
  { value: '', label: 'Select your role…' },
  { value: 'PhD student', label: 'PhD Student' },
  { value: 'Postdoc', label: 'Postdoc' },
  { value: 'PI', label: 'PI (Principal Investigator)' },
  { value: 'Staff', label: 'Research Staff' },
  { value: 'Other', label: 'Other' },
];

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <div
      style={{
        fontFamily: 'var(--mono)',
        fontSize: 11,
        color: 'var(--muted-2)',
        textTransform: 'uppercase',
        letterSpacing: '0.07em',
        marginBottom: 6,
      }}
    >
      {children}
      {required && <span style={{ color: 'var(--bad)', marginLeft: 3 }}>*</span>}
    </div>
  );
}

export function ProfileSetupPage() {
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();

  const [firstName, setFirstName] = useState(user?.first_name ?? '');
  const [lastName, setLastName] = useState(user?.last_name ?? '');
  const [title, setTitle] = useState(user?.title ?? '');
  const [description, setDescription] = useState(user?.description ?? '');
  const [displayName, setDisplayName] = useState(user?.display_name ?? '');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim() || !title) {
      setError('First name, last name, and role are required.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await api.patch<User>('/v1/me/profile', {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        title,
        description: description.trim(),
        display_name: displayName.trim() || undefined,
      });
      await refreshUser();
      await navigate({ to: '/' });
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message || 'Failed to save profile');
      } else {
        setError('Network error — please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const inputStyle = {
    display: 'block',
    width: '100%',
    border: '1px solid var(--line-2)',
    borderRadius: 6,
    padding: '8px 10px',
    font: '14px/1.5 var(--sans)',
    color: 'var(--ink)',
    background: 'var(--paper)',
    outline: 'none',
    boxSizing: 'border-box' as const,
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
      <div style={{ width: '100%', maxWidth: 480 }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
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
              fontFamily: 'var(--sans)',
              fontSize: 18,
              fontWeight: 600,
              color: 'var(--ink)',
              marginBottom: 6,
            }}
          >
            Complete your profile
          </div>
          <div
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 12,
              color: 'var(--muted)',
              lineHeight: 1.5,
            }}
          >
            Before you get started, tell us a bit about yourself.
            This information helps your labmates identify you.
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
          <form onSubmit={(e) => void handleSubmit(e)}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              {/* Row: first + last name */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <FieldLabel required>First name</FieldLabel>
                  <input
                    className="field-input"
                    style={inputStyle}
                    value={firstName}
                    onChange={e => setFirstName(e.target.value)}
                    placeholder="Ada"
                    required
                    autoFocus
                  />
                </div>
                <div>
                  <FieldLabel required>Last name</FieldLabel>
                  <input
                    className="field-input"
                    style={inputStyle}
                    value={lastName}
                    onChange={e => setLastName(e.target.value)}
                    placeholder="Lovelace"
                    required
                  />
                </div>
              </div>

              {/* Role / title */}
              <div>
                <FieldLabel required>Role</FieldLabel>
                <select
                  className="field-input"
                  style={{ ...inputStyle, cursor: 'pointer' }}
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  required
                >
                  {TITLE_OPTIONS.map(o => (
                    <option key={o.value} value={o.value} disabled={o.value === ''}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Description / bio */}
              <div>
                <FieldLabel>Short bio</FieldLabel>
                <textarea
                  className="field-input"
                  style={{
                    ...inputStyle,
                    resize: 'vertical',
                    minHeight: 72,
                    fontFamily: 'var(--sans)',
                  }}
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="e.g. PhD student studying MIM resistive switching devices…"
                  rows={3}
                />
              </div>

              {/* Display name (optional) */}
              <div>
                <FieldLabel>Display name (optional)</FieldLabel>
                <input
                  className="field-input"
                  style={inputStyle}
                  value={displayName}
                  onChange={e => setDisplayName(e.target.value)}
                  placeholder={firstName && lastName ? `${firstName} ${lastName}` : 'Auto-generated from name'}
                />
                <div
                  style={{
                    fontFamily: 'var(--mono)',
                    fontSize: 10.5,
                    color: 'var(--muted-2)',
                    marginTop: 5,
                  }}
                >
                  Shown to teammates. Defaults to your first + last name if left blank.
                </div>
              </div>

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
                {loading ? 'Saving…' : 'Save and continue'}
              </button>
            </div>
          </form>
        </div>

        <div
          style={{
            textAlign: 'center',
            marginTop: 16,
            fontFamily: 'var(--mono)',
            fontSize: 10.5,
            color: 'var(--muted-2)',
          }}
        >
          Signed in as {user?.email}
        </div>
      </div>
    </div>
  );
}
