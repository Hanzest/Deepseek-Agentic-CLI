import type { LearningPage, Toast, ThemeMode } from './schema';

/* ==========================================================================
   AppState — the complete application state
   ========================================================================== */

export interface AppState {
  // Pages
  pages: LearningPage[];
  currentPageIndex: number;

  // UI State
  darkMode: boolean;
  isLoading: boolean;
  error: string | null;
  showShortcuts: boolean;
  showDashboard: boolean;
  sidebarOpen: boolean;
  searchQuery: string;
  renamingIndex: number | null;
  contextMenu: { index: number; x: number; y: number } | null;
  pageHashes: Record<string, boolean>;

  // Progress
  viewedPages: number[];
  quizScores: Record<string, { correct: number; total: number }>;

  // Toast notifications
  toasts: Toast[];
  nextToastId: number;

  // Pomodoro
  pomodoroMode: 'focus' | 'break';
  pomodoroFocusMinutes: number;
  pomodoroBreakMinutes: number;
  pomodoroSeconds: number;
  pomodoroIsRunning: boolean;
}

/* ==========================================================================
   Actions — discriminated union for the reducer
   ========================================================================== */

export type AppAction =
  | { type: 'ADD_PAGE'; payload: { page: LearningPage; hash?: string } }
  | { type: 'REMOVE_PAGE'; payload: { index: number } }
  | { type: 'REMOVE_ALL_PAGES' }
  | { type: 'RENAME_PAGE'; payload: { index: number; title: string } }
  | { type: 'TOGGLE_PAGE_COMPLETE'; payload: { index: number } }
  | { type: 'MOVE_PAGE'; payload: { fromIndex: number; toIndex: number } }
  | { type: 'GO_TO_PAGE'; payload: { index: number; closeSidebar?: boolean } }
  | { type: 'NEXT_PAGE' }
  | { type: 'PREV_PAGE' }
  | { type: 'GO_TO_RANDOM_PAGE' }
  | { type: 'SET_SEARCH_QUERY'; payload: string }
  | { type: 'TOGGLE_DARK_MODE' }
  | { type: 'SET_DARK_MODE'; payload: boolean }
  | { type: 'TOGGLE_SHORTCUTS' }
  | { type: 'TOGGLE_DASHBOARD' }
  | { type: 'TOGGLE_SIDEBAR' }
  | { type: 'SET_SIDEBAR'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_RENAMING_INDEX'; payload: number | null }
  | { type: 'SET_CONTEXT_MENU'; payload: { index: number; x: number; y: number } | null }
  | { type: 'SAVE_NOTE'; payload: { pageIndex: number; sectionIndex: number; text: string } }
  | { type: 'RECORD_QUIZ_SCORE'; payload: { pageIndex: number; sectionIndex: number; correct: number; total: number } }
  | { type: 'SAVE_CHECKLIST'; payload: { pageIndex: number; sectionIndex: number; checked: Record<number, boolean> } }
  | { type: 'ADD_TOAST'; payload: { message: string; type: 'success' | 'error' | 'warning' | 'info'; duration?: number; undo?: (() => void) | null } }
  | { type: 'DISMISS_TOAST'; payload: { id: number } }
  | { type: 'UNDO_TOAST'; payload: { id: number } }
  | { type: 'RESTORE_SESSION'; payload: { pages: LearningPage[]; hashes: Record<string, boolean>; currentPageIndex: number; viewedPages: number[]; quizScores: Record<string, { correct: number; total: number }>; completedPages: number[] } }
  | { type: 'POMODORO_TICK' }
  | { type: 'POMODORO_START' }
  | { type: 'POMODORO_PAUSE' }
  | { type: 'POMODORO_RESET' }
  | { type: 'POMODORO_SWITCH_MODE' }
  | { type: 'POMODORO_RESTORE'; payload: { mode: 'focus' | 'break'; focusMinutes: number; breakMinutes: number; seconds: number } };

/* ==========================================================================
   Derived / Computed State (not stored, computed from state)
   ========================================================================== */

export interface AppDerivedState {
  visibleIndices: number[];
  visibleCount: number;
  currentPage: LearningPage | null;
  completedCount: number;
  completedPercent: number;
  isCurrentPageVisible: boolean;
}
