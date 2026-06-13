import { useEffect, useRef } from 'react';
import { useAppContext } from '../context/AppContext';
import { isInputFocused } from '../utils/renderContent';

/**
 * Global keyboard shortcut handler.
 * Must be used inside <AppProvider>.
 *
 * Uses a ref to store the latest context to avoid re-attaching
 * the global keydown listener on every state change.
 */
export function useKeyboardShortcuts(): void {
  const ctx = useAppContext();
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;

  useEffect(() => {
    function handleKeydown(e: KeyboardEvent) {
      const c = ctxRef.current;

      // '?' — Toggle shortcuts
      if (e.key === '?' && !e.ctrlKey && !e.metaKey) {
        if (!isInputFocused()) {
          e.preventDefault();
          c.toggleShortcuts();
        }
        return;
      }

      // Arrow navigation
      if (e.key === 'ArrowLeft' && !isInputFocused()) {
        c.prevPage();
        return;
      }
      if (e.key === 'ArrowRight' && !isInputFocused()) {
        c.nextPage();
        return;
      }

      // Escape — Close overlays / cancel rename
      if (e.key === 'Escape') {
        if (c.state.showShortcuts) c.toggleShortcuts();
        if (c.state.showDashboard) c.toggleDashboard();
        c.setContextMenu(null);
        c.setRenamingIndex(null);
        return;
      }

      // Ctrl/Cmd + B — Toggle sidebar
      if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
        e.preventDefault();
        c.toggleSidebar();
        return;
      }

      // '/' — Focus search
      if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
        if (!isInputFocused()) {
          e.preventDefault();
          const searchInput = document.querySelector<HTMLInputElement>('input[type=text][placeholder*=Search]');
          searchInput?.focus();
        }
        return;
      }

      // 'r' — Rename current page
      if (e.key === 'r' && !e.ctrlKey && !e.metaKey && !e.shiftKey && c.currentPage) {
        if (!isInputFocused()) {
          c.setRenamingIndex(c.state.currentPageIndex);
          setTimeout(() => {
            const inp = document.querySelector<HTMLInputElement>('.page-list input[type=text]');
            inp?.focus();
          }, 50);
        }
        return;
      }

      // 'R' — Go to random page (Shift + r)
      if (e.key === 'R' && !e.ctrlKey && !e.metaKey && !isInputFocused()) {
        c.goToRandomPage();
        return;
      }

      // Delete — Delete current page
      if ((e.key === 'Delete' || e.key === 'Del') && c.currentPage && !e.ctrlKey && !e.metaKey) {
        if (!isInputFocused()) {
          c.removePage(c.state.currentPageIndex);
        }
        return;
      }
    }

    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, []); // Empty deps — never re-attaches the global listener
}
