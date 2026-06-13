import React, { useRef } from 'react';
import { useAppContext } from '../../context/AppContext';

export default function SearchBar() {
  const { state, setSearchQuery } = useAppContext();
  const inputRef = useRef<HTMLInputElement>(null);

  const handleClear = () => {
    setSearchQuery('');
    inputRef.current?.focus();
  };

  return (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center', width: '100%' }}>
      <svg
        style={{ position: 'absolute', left: 12, color: 'var(--text-secondary)', pointerEvents: 'none' }}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        width={18}
        height={18}
        aria-hidden="true"
      >
        <circle cx="11" cy="11" r="8" />
        <path d="M21 21l-4.35-4.35" />
      </svg>
      <input
        ref={inputRef}
        type="text"
        style={{
          width: '100%',
          padding: '8px 36px 8px 36px',
          border: '1px solid var(--border-color)',
          borderRadius: 8,
          background: 'var(--bg-primary)',
          color: 'var(--text-primary)',
          fontSize: 14,
          outline: 'none',
          transition: 'border-color 0.15s, box-shadow 0.15s',
        }}
        placeholder="Search pages..."
        value={state.searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        aria-label="Search pages"
      />
      {state.searchQuery && (
        <button
          style={{
            position: 'absolute',
            right: 8,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 24,
            height: 24,
            padding: 0,
            border: 'none',
            borderRadius: '50%',
            background: 'transparent',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            transition: 'background 0.15s',
          }}
          onClick={handleClear}
          aria-label="Clear search"
          type="button"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={16} height={16}>
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );
}
