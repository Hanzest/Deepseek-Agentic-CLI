import React, { useRef, useEffect } from 'react';
import { AppProvider, useAppContext } from './context/AppContext';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useSwipeNavigation } from './hooks/useSwipeNavigation';
import Header from './components/Layout/Header';
import Sidebar from './components/Layout/Sidebar';
import Footer from './components/Layout/Footer';
import ContentArea from './components/Layout/ContentArea';
import DashboardOverlay from './components/Overlays/DashboardOverlay';
import KeyboardShortcutsOverlay from './components/Overlays/KeyboardShortcutsOverlay';
import ContextMenu from './components/UI/ContextMenu';
import ToastContainer from './components/UI/ToastContainer';

/* ==========================================================================
   AppShell — inner component that uses hooks requiring AppContext
   ========================================================================== */

function AppShell() {
  const { state, nextPage, prevPage } = useAppContext();
  useKeyboardShortcuts();
  const scrollPositions = useRef<Record<number, number>>({});
  const mainRef = useRef<HTMLDivElement | null>(null);

  // Set up the swipe ref AND capture the underlying element into mainRef
  const swipeRef = useSwipeNavigation({
    threshold: 30,
    onSwipeLeft: nextPage,
    onSwipeRight: prevPage,
  });

  // Combine refs: sync swipeRef.current into mainRef
  const setMainRef = (el: HTMLDivElement | null) => {
    mainRef.current = el;
    (swipeRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
  };

  // Save/restore scroll position when navigating between pages
  useEffect(() => {
    const main = mainRef.current;
    if (!main) return;

    // Save current scroll position keyed by page index
    const prevIndex = state.currentPageIndex;
    // Restore saved scroll position for the new page (or scroll to top)
    const savedPos = scrollPositions.current[prevIndex];
    main.scrollTop = savedPos ?? 0;
  }, [state.currentPageIndex]);

  // Save scroll position on scroll events
  useEffect(() => {
    const main = mainRef.current;
    if (!main) return;

    const handleScroll = () => {
      scrollPositions.current[state.currentPageIndex] = main.scrollTop;
    };

    main.addEventListener('scroll', handleScroll, { passive: true });
    return () => main.removeEventListener('scroll', handleScroll);
  }, [state.currentPageIndex]);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      overflow: 'hidden',
    }}>
      <Header />

      <div style={{
        display: 'flex',
        flex: 1,
        overflow: 'hidden',
      }}>
        <Sidebar />

        <main
          ref={setMainRef}
          style={{
            flex: 1,
            overflowY: 'auto',
            overflowX: 'hidden',
            position: 'relative',
          }}
        >
          <ContentArea />
        </main>
      </div>

      <Footer />

      {/* Overlays */}
      <DashboardOverlay />
      <KeyboardShortcutsOverlay />

      {/* Right-click Context Menu for sidebar items */}
      <ContextMenu />

      {/* Toast notifications */}
      <ToastContainer />
    </div>
  );
}

/* ==========================================================================
   App — root component wrapping everything in AppProvider
   ========================================================================== */

export default function App() {
  return (
    <AppProvider>
      <AppShell />
    </AppProvider>
  );
}
