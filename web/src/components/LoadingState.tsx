interface LoadingStateProps {
  message?: string;
}

export function LoadingState({ message = 'Loading…' }: LoadingStateProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '60px 32px',
        color: 'var(--muted)',
        fontFamily: 'var(--mono)',
        fontSize: 13,
        gap: 10,
      }}
    >
      <span
        style={{
          width: 14,
          height: 14,
          borderRadius: '50%',
          border: '2px solid var(--line)',
          borderTopColor: 'var(--ember)',
          animation: 'spin 0.8s linear infinite',
          display: 'inline-block',
        }}
      />
      {message}
    </div>
  );
}

interface ErrorStateProps {
  message?: string;
}

export function ErrorState({ message = 'Something went wrong.' }: ErrorStateProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '60px 32px',
        color: 'var(--bad)',
        fontFamily: 'var(--mono)',
        fontSize: 13,
      }}
    >
      {message}
    </div>
  );
}

export function EmptyState({ message }: { message: string }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '48px 32px',
        color: 'var(--muted-2)',
        fontFamily: 'var(--mono)',
        fontSize: 13,
        flexDirection: 'column',
        gap: 6,
      }}
    >
      <span style={{ fontSize: 22, opacity: 0.4 }}>∅</span>
      {message}
    </div>
  );
}
