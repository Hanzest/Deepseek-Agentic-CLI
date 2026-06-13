import React, { useEffect, useRef } from 'react';
import { useAppContext } from '../../context/AppContext';

export default function ContextMenu() {
  const {
    state,
    setContextMenu,
    togglePageComplete,
    removePage,
    setRenamingIndex,
  } = useAppContext();
  const menuRef = useRef<HTMLDivElement>(null);

  const menu = state.contextMenu;
  const page = menu ? state.pages[menu.index] : null;
  const isCompleted = page?._meta?.completed ?? false;

  // Close on outside click
  useEffect(() => {
    if (!menu) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setContextMenu(null);
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [menu, setContextMenu]);

  // Listen for custom page-context-menu events from PageListItem
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail) {
        setContextMenu({ index: detail.index, x: detail.x, y: detail.y });
      }
    };
    window.addEventListener('page-context-menu', handler);
    return () => window.removeEventListener('page-context-menu', handler);
  }, [setContextMenu]);

  if (!menu) return null;

  const handleAction = (action: () => void) => {
    action();
    setContextMenu(null);
  };

  return (
    <div
      ref={menuRef}
      style={{
        position: 'fixed',
        zIndex: 60,
        minWidth: 160,
        padding: 4,
        background: 'var(--bg-primary)',
        border: '1px solid var(--border-color)',
        borderRadius: 8,
        boxShadow: 'var(--shadow-lg)',
        left: menu.x,
        top: menu.y,
      }}
    >
      <button
        style={{
          display: 'block',
          width: '100%',
          padding: '8px 12px',
          border: 'none',
          borderRadius: 4,
          background: 'transparent',
          color: 'var(--text-primary)',
          fontSize: 13,
          textAlign: 'left',
          cursor: 'pointer',
          transition: 'background 0.1s',
        }}
        onClick={() => handleAction(() => state.pages[menu.index] && setRenamingIndex(menu.index))}
        type="button"
      >
        Rename
      </button>
      <button
        style={{
          display: 'block',
          width: '100%',
          padding: '8px 12px',
          border: 'none',
          borderRadius: 4,
          background: 'transparent',
          color: 'var(--text-primary)',
          fontSize: 13,
          textAlign: 'left',
          cursor: 'pointer',
          transition: 'background 0.1s',
        }}
        onClick={() => handleAction(() => togglePageComplete(menu.index))}
        type="button"
      >
        {isCompleted ? 'Mark Incomplete' : 'Mark Complete'}
      </button>
      <div style={{ height: 1, margin: '4px 8px', background: 'var(--border-color)' }} />
      <button
        style={{
          display: 'block',
          width: '100%',
          padding: '8px 12px',
          border: 'none',
          borderRadius: 4,
          background: 'transparent',
          color: 'var(--error)',
          fontSize: 13,
          textAlign: 'left',
          cursor: 'pointer',
          transition: 'background 0.1s',
        }}
        onClick={() => handleAction(() => removePage(menu.index))}
        type="button"
      >
        Delete
      </button>
    </div>
  );
}
