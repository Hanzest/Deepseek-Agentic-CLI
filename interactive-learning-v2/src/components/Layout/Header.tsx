import React from 'react';
import { useAppContext } from '../../context/AppContext';
import SearchBar from '../UI/SearchBar';
import PomodoroTimer from '../UI/PomodoroTimer';
import DarkModeToggle from '../UI/DarkModeToggle';
import UploadButton from '../UI/UploadButton';

export default function Header() {
  const {
    state,
    toggleSidebar,
    toggleDashboard,
    toggleShortcuts,
  } = useAppContext();

  const iconBtnBase: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 32,
    height: 32,
    border: 'none',
    borderRadius: 6,
    background: 'transparent',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    fontSize: 18,
    transition: 'background-color 0.15s, color 0.15s',
    flexShrink: 0,
  };

  return (
    <header style={{
      position: 'sticky',
      top: 0,
      zIndex: 20,
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: '8px 16px',
      background: 'color-mix(in srgb, var(--bg-primary) 85%, transparent)',
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
      borderBottom: '1px solid var(--border-color)',
      minHeight: 56,
      transition: 'background-color 0.3s',
    }}>
      {/* Sidebar toggle */}
      <button
        onClick={toggleSidebar}
        aria-label="Toggle sidebar"
        title="Toggle sidebar (Ctrl+B)"
        type="button"
        className="btn-base"
        style={{
          ...iconBtnBase,
          fontSize: 20,
        }}
      >
        {state.sidebarOpen ? '✕' : '☰'}
      </button>

      {/* Title */}
      <h1 style={{
        fontSize: 18,
        fontWeight: 700,
        color: 'var(--text-primary)',
        whiteSpace: 'nowrap',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
      }}>
        📚 Learn
      </h1>

      {/* Search */}
      <SearchBar />

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Action group */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
      }}>
        <PomodoroTimer />

        {/* Dashboard button */}
        <button
          style={{
            ...iconBtnBase,
            ...(state.showDashboard ? {
              background: 'var(--accent-light)',
              color: 'var(--accent)',
            } : {}),
          }}
          onClick={toggleDashboard}
          aria-label="Dashboard"
          title="Dashboard (Ctrl+D)"
          type="button"
          className="btn-base"
        >
          📊
        </button>

        <DarkModeToggle />

        {/* Keyboard shortcuts */}
        <button
          style={{
            ...iconBtnBase,
            ...(state.showShortcuts ? {
              background: 'var(--accent-light)',
              color: 'var(--accent)',
            } : {}),
          }}
          onClick={toggleShortcuts}
          aria-label="Keyboard shortcuts"
          title="Keyboard shortcuts (?)"
          type="button"
          className="btn-base"
        >
          <kbd style={{
            padding: '2px 6px',
            background: 'var(--bg-tertiary)',
            borderRadius: 4,
            fontSize: 11,
            fontWeight: 700,
            fontFamily: 'monospace',
            color: 'var(--text-secondary)',
          }}>?</kbd>
        </button>

        {/* Upload */}
        <UploadButton />
      </div>
    </header>
  );
}
