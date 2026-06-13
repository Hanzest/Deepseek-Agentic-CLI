import React from 'react';
import { useAppContext } from '../../context/AppContext';

export default function DarkModeToggle() {
  const { state, toggleDarkMode } = useAppContext();

  return (
    <button
      onClick={toggleDarkMode}
      aria-label={state.darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
      title={state.darkMode ? 'Light mode' : 'Dark mode'}
      type="button"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 36,
        height: 36,
        padding: 0,
        border: '1px solid var(--border-color)',
        borderRadius: 8,
        background: 'var(--bg-secondary)',
        color: 'var(--text-secondary)',
        cursor: 'pointer',
        transition: 'background 0.15s, color 0.15s',
      }}
    >
      {state.darkMode ? (
        /* Sun icon */
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={20} height={20}>
          <circle cx="12" cy="12" r="5" />
          <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
        </svg>
      ) : (
        /* Moon icon */
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={20} height={20}>
          <path d="M21 12.79A9 9 0 1111.21 3a7 7 0 009.79 9.79z" />
        </svg>
      )}
    </button>
  );
}
