/**
 * Compact light/dark toggle for the app shell sidebar.
 */
import { useTheme } from '@/hooks/useTweaks';

export function ThemeToggle() {
  const [theme, setTheme] = useTheme();

  const next = theme === 'light' ? 'dark' : 'light';
  const label = theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode';

  return (
    <button
      type="button"
      className="icon-btn"
      onClick={() => setTheme(next)}
      title={label}
      aria-label={label}
    >
      {theme === 'light' ? (
        <svg width={13} height={13} viewBox="0 0 16 16" fill="none" aria-hidden>
          <path
            d="M11.2 2.4a5.5 5.5 0 1 0 2.4 9.6 4.5 4.5 0 1 1-2.4-9.6Z"
            fill="currentColor"
          />
        </svg>
      ) : (
        <svg width={13} height={13} viewBox="0 0 16 16" fill="none" aria-hidden>
          <circle cx="8" cy="8" r="3.5" fill="currentColor" />
          <path
            d="M8 1.2V2.8M8 13.2V14.8M1.2 8H2.8M13.2 8H14.8M3.1 3.1L4.2 4.2M11.8 11.8L12.9 12.9M3.1 12.9L4.2 11.8M11.8 4.2L12.9 3.1"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </svg>
      )}
    </button>
  );
}
