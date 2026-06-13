import React, { createContext, useContext, useReducer, useEffect, useCallback, useMemo } from 'react';
import type { AppState, AppAction } from '../types/state';
import { initialState, appReducer, getVisibleIndices } from './appReducer';
import type { LearningPage, Toast } from '../types/schema';
import { storage } from '../utils/storage';
import { computeContentHash } from '../utils/contentHash';

interface SavedSession {
  pages: LearningPage[];
  hashes: Record<string, boolean>;
  currentPageIndex: number;
  viewedPages: number[];
  quizScores: Record<string, { correct: number; total: number }>;
  completedPages: number[];
}

interface SavedPomodoro {
  mode: 'focus' | 'break';
  focusMinutes: number;
  breakMinutes: number;
  seconds: number;
}

/* ==========================================================================
   Context type — exposes state, dispatch, plus derived helpers
   ========================================================================== */

interface AppContextValue {
  state: AppState;
  dispatch: React.Dispatch<AppAction>;

  // Derived
  visibleIndices: number[];
  visibleCount: number;
  currentPage: LearningPage | null;
  completedCount: number;
  completedPercent: number;
  isCurrentPageVisible: boolean;

  // Convenience action dispatchers
  addPage: (page: LearningPage, fileName?: string) => boolean;
  removePage: (index: number) => void;
  removeAllPages: () => void;
  renamePage: (index: number, title: string) => void;
  togglePageComplete: (index: number) => void;
  movePage: (fromIndex: number, toIndex: number) => void;
  goToPage: (index: number) => void;
  nextPage: () => void;
  prevPage: () => void;
  goToRandomPage: () => void;
  setSearchQuery: (q: string) => void;
  toggleDarkMode: () => void;
  toggleShortcuts: () => void;
  toggleDashboard: () => void;
  toggleSidebar: () => void;
  setError: (err: string | null) => void;
  setRenamingIndex: (idx: number | null) => void;
  setContextMenu: (menu: { index: number; x: number; y: number } | null) => void;
  saveNote: (pageIndex: number, sectionIndex: number, text: string) => void;
  getNote: (pageIndex: number, sectionIndex: number) => string | null;
  recordQuizScore: (pageIndex: number, sectionIndex: number, correct: number, total: number) => void;
  saveChecklist: (pageIndex: number, sectionIndex: number, checked: Record<number, boolean>) => void;
  addToast: (message: string, type: 'success' | 'error' | 'warning' | 'info', duration?: number, undo?: (() => void) | null) => void;
  dismissToast: (id: number) => void;
  isPageViewed: (index: number) => boolean;
  isPageCompleted: (index: number) => boolean;
  isQuizCompleted: (index: number) => boolean;
  saveSession: () => void;
  getQuizAttemptHistory: (pageIndex: number, sectionIndex: number) => { attempts: number; bestCorrect: number; bestTotal: number };
}

const AppContext = createContext<AppContextValue | null>(null);

export function useAppContext(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useAppContext must be used within AppProvider');
  return ctx;
}

/* ==========================================================================
   Provider component
   ========================================================================== */

interface AppProviderProps {
  children: React.ReactNode;
}

export function AppProvider({ children }: AppProviderProps) {
  const [state, dispatch] = useReducer(appReducer, initialState);

  // Load saved theme on mount
  useEffect(() => {
    const savedTheme = storage.load<string>('theme', 'light');
    if (savedTheme === 'dark') {
      dispatch({ type: 'SET_DARK_MODE', payload: true });
    }
  }, []);

  // Sync dark mode to <html> class
  useEffect(() => {
    const root = document.documentElement;
    if (state.darkMode) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [state.darkMode]);

  // Load saved session on mount
  useEffect(() => {
    const session = storage.load<SavedSession | null>('learningSession', null);
    if (session && session.pages && session.pages.length > 0) {
      dispatch({
        type: 'RESTORE_SESSION',
        payload: {
          pages: session.pages,
          hashes: session.hashes || {},
          currentPageIndex: session.currentPageIndex || 0,
          viewedPages: session.viewedPages || [],
          quizScores: session.quizScores || {},
          completedPages: session.completedPages || [],
        },
      });
    }
  }, []);

  // Load pomodoro state
  useEffect(() => {
    const pomState = storage.load<SavedPomodoro | null>('pomodoroState', null);
    if (pomState) {
      dispatch({
        type: 'POMODORO_RESTORE',
        payload: {
          mode: pomState.mode || 'focus',
          focusMinutes: pomState.focusMinutes || 25,
          breakMinutes: pomState.breakMinutes || 5,
          seconds: pomState.seconds || 0,
        },
      });
    }
  }, []);

  // Save session on relevant state changes
  useEffect(() => {
    if (state.pages.length === 0) return;
    saveSessionToStorage(state);
  }, [state.pages, state.pageHashes, state.currentPageIndex, state.viewedPages, state.quizScores]);

  // Derived values
  const visibleIndices = useMemo(() => getVisibleIndices(state), [state.pages, state.searchQuery]);
  const visibleCount = visibleIndices.length;
  const currentPage = state.currentPageIndex >= 0 && state.currentPageIndex < state.pages.length
    ? state.pages[state.currentPageIndex]
    : null;
  const completedCount = state.pages.filter((_, i) => !!(state.pages[i]?._meta?.completed)).length;
  const completedPercent = state.pages.length > 0 ? Math.round((completedCount / state.pages.length) * 100) : 0;
  const isCurrentPageVisible = visibleIndices.indexOf(state.currentPageIndex) !== -1;

  // Convenience dispatchers
  const addPage = useCallback((page: LearningPage, fileName?: string): boolean => {
    const hash = computeContentHash(page);
    if (hash && state.pageHashes[hash]) {
      const title = (page.page && page.page.title) || 'Untitled';
      const msg = `Duplicate page: "${title}"${fileName ? ` (${fileName})` : ''}`;
      addToastFn(msg, 'warning', 3000, null);
      return false;
    }
    dispatch({ type: 'ADD_PAGE', payload: { page, hash: hash || undefined } });
    return true;
  }, [state.pageHashes]);

  const removePage = useCallback((index: number) => {
    if (index < 0 || index >= state.pages.length) return;
    const pageTitle = (state.pages[index].page && state.pages[index].page.title) || 'Untitled';
    const removedPage = state.pages[index];
    const removedHash = computeContentHash(removedPage);
    const removedIndex = index;
    dispatch({ type: 'REMOVE_PAGE', payload: { index } });
    addToastFn(`Deleted "${pageTitle}"`, 'warning', 5000, () => {
      dispatch({
        type: 'ADD_PAGE',
        payload: { page: removedPage, hash: removedHash || undefined },
      });
      // After undo add, fix currentPageIndex
    });
  }, [state.pages]);

  const removeAllPages = useCallback(() => {
    if (state.pages.length === 0) return;
    dispatch({ type: 'REMOVE_ALL_PAGES' });
    addToastFn('All pages deleted', 'warning', 2000, null);
  }, [state.pages.length]);

  const renamePage = useCallback((index: number, title: string) => {
    if (!title.trim()) return;
    dispatch({ type: 'RENAME_PAGE', payload: { index, title } });
    addToastFn(`Page renamed to "${title.trim()}"`, 'success', 2000, null);
  }, []);

  const togglePageComplete = useCallback((index: number) => {
    dispatch({ type: 'TOGGLE_PAGE_COMPLETE', payload: { index } });
    const page = state.pages[index];
    const title = (page?.page?.title) || 'Untitled';
    const completed = page?._meta?.completed;
    addToastFn(
      completed ? `"${title}" marked as incomplete` : `"${title}" marked as complete!`,
      completed ? 'info' : 'success',
      2000,
      null
    );
  }, [state.pages]);

  const movePage = useCallback((fromIndex: number, toIndex: number) => {
    dispatch({ type: 'MOVE_PAGE', payload: { fromIndex, toIndex } });
  }, []);

  const goToPage = useCallback((index: number) => {
    const closeSidebar = window.innerWidth < 768;
    dispatch({ type: 'GO_TO_PAGE', payload: { index, closeSidebar } });
  }, []);

  const nextPage = useCallback(() => dispatch({ type: 'NEXT_PAGE' }), []);
  const prevPage = useCallback(() => dispatch({ type: 'PREV_PAGE' }), []);
  const goToRandomPage = useCallback(() => dispatch({ type: 'GO_TO_RANDOM_PAGE' }), []);
  const setSearchQuery = useCallback((q: string) => dispatch({ type: 'SET_SEARCH_QUERY', payload: q }), []);
  const toggleDarkMode = useCallback(() => dispatch({ type: 'TOGGLE_DARK_MODE' }), []);
  const toggleShortcuts = useCallback(() => dispatch({ type: 'TOGGLE_SHORTCUTS' }), []);
  const toggleDashboard = useCallback(() => dispatch({ type: 'TOGGLE_DASHBOARD' }), []);
  const toggleSidebar = useCallback(() => dispatch({ type: 'TOGGLE_SIDEBAR' }), []);
  const setError = useCallback((err: string | null) => dispatch({ type: 'SET_ERROR', payload: err }), []);
  const setRenamingIndex = useCallback((idx: number | null) => dispatch({ type: 'SET_RENAMING_INDEX', payload: idx }), []);
  const setContextMenu = useCallback((menu: { index: number; x: number; y: number } | null) => dispatch({ type: 'SET_CONTEXT_MENU', payload: menu }), []);

  const saveNote = useCallback((pageIndex: number, sectionIndex: number, text: string) => {
    dispatch({ type: 'SAVE_NOTE', payload: { pageIndex, sectionIndex, text } });
  }, []);

  const getNote = useCallback((pageIndex: number, sectionIndex: number): string | null => {
    const page = state.pages[pageIndex];
    if (!page?._meta?.notes) return null;
    return page._meta.notes[sectionIndex] || null;
  }, [state.pages]);

  const recordQuizScore = useCallback((pageIndex: number, sectionIndex: number, correct: number, total: number) => {
    dispatch({ type: 'RECORD_QUIZ_SCORE', payload: { pageIndex, sectionIndex, correct, total } });
  }, []);

  const saveChecklist = useCallback((pageIndex: number, sectionIndex: number, checked: Record<number, boolean>) => {
    dispatch({ type: 'SAVE_CHECKLIST', payload: { pageIndex, sectionIndex, checked } });
  }, []);

  const addToastFn = useCallback((
    message: string,
    type: 'success' | 'error' | 'warning' | 'info',
    duration?: number,
    undo?: (() => void) | null
  ) => {
    dispatch({ type: 'ADD_TOAST', payload: { message, type, duration, undo } });
  }, []);

  const dismissToast = useCallback((id: number) => {
    dispatch({ type: 'DISMISS_TOAST', payload: { id } });
  }, []);

  const isPageViewed = useCallback((index: number) => state.viewedPages.includes(index), [state.viewedPages]);
  const isPageCompleted = useCallback((index: number) => {
    return !!(state.pages[index]?._meta?.completed);
  }, [state.pages]);
  const isQuizCompleted = useCallback((index: number) => {
    const scores = state.quizScores || {};
    for (const key in scores) {
      if (key.startsWith(`${index}-`)) return true;
    }
    return false;
  }, [state.quizScores]);

  const saveSession = useCallback(() => {
    saveSessionToStorage(state);
  }, [state]);

  const getQuizAttemptHistory = useCallback((pageIndex: number, sectionIndex: number) => {
    const page = state.pages[pageIndex];
    if (!page?._meta?.quizAttempts?.[sectionIndex]) {
      return { attempts: 0, bestCorrect: 0, bestTotal: 0 };
    }
    const attempts = page._meta.quizAttempts[sectionIndex];
    let bestCorrect = 0;
    let bestTotal = 0;
    for (const a of attempts) {
      if (a.correct > bestCorrect) {
        bestCorrect = a.correct;
        bestTotal = a.total;
      }
    }
    return { attempts: attempts.length, bestCorrect, bestTotal };
  }, [state.pages]);

  const value: AppContextValue = useMemo(() => ({
    state,
    dispatch,
    visibleIndices,
    visibleCount,
    currentPage,
    completedCount,
    completedPercent,
    isCurrentPageVisible,
    addPage,
    removePage,
    removeAllPages,
    renamePage,
    togglePageComplete,
    movePage,
    goToPage,
    nextPage,
    prevPage,
    goToRandomPage,
    setSearchQuery,
    toggleDarkMode,
    toggleShortcuts,
    toggleDashboard,
    toggleSidebar,
    setError,
    setRenamingIndex,
    setContextMenu,
    saveNote,
    getNote,
    recordQuizScore,
    saveChecklist,
    addToast: addToastFn,
    dismissToast,
    isPageViewed,
    isPageCompleted,
    isQuizCompleted,
    saveSession,
    getQuizAttemptHistory,
  }), [
    state, visibleIndices, visibleCount, currentPage, completedCount, completedPercent,
    isCurrentPageVisible, addPage, removePage, removeAllPages, renamePage,
    togglePageComplete, movePage, goToPage, nextPage, prevPage, goToRandomPage,
    setSearchQuery, toggleDarkMode, toggleShortcuts, toggleDashboard, toggleSidebar,
    setError, setRenamingIndex, setContextMenu, saveNote, getNote, recordQuizScore,
    saveChecklist, addToastFn, dismissToast, isPageViewed, isPageCompleted,
    isQuizCompleted, saveSession, getQuizAttemptHistory,
  ]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

/* ---- Helpers ---- */

function isPageCompleted(state: AppState, index: number): boolean {
  return !!(state.pages[index]?._meta?.completed);
}

function saveSessionToStorage(state: AppState) {
  try {
    const session = {
      pages: state.pages,
      hashes: state.pageHashes,
      currentPageIndex: state.currentPageIndex,
      viewedPages: state.viewedPages,
      quizScores: state.quizScores,
      completedPages: state.pages
        .map((p, i) => p._meta?.completed ? i : -1)
        .filter((i) => i !== -1),
    };
    storage.save('learningSession', session);
  } catch (e) {
    console.warn('[session] Failed to save session:', e);
  }
}
