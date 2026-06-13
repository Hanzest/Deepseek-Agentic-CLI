import { useEffect, useRef, useCallback } from 'react';
import { useAppContext } from '../context/AppContext';
import { storage } from '../utils/storage';

/**
 * Pomodoro timer hook.
 * Handles the interval tick, start/pause/reset/switch actions,
 * and persistence to localStorage.
 */
export function useTimer() {
  const { state, dispatch } = useAppContext();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const persist = useCallback(() => {
    storage.save('pomodoroState', {
      mode: state.pomodoroMode,
      focusMinutes: state.pomodoroFocusMinutes,
      breakMinutes: state.pomodoroBreakMinutes,
      seconds: state.pomodoroSeconds,
      isRunning: false,
    });
  }, [state.pomodoroMode, state.pomodoroFocusMinutes, state.pomodoroBreakMinutes, state.pomodoroSeconds]);

  // Handle interval
  useEffect(() => {
    if (state.pomodoroIsRunning) {
      intervalRef.current = setInterval(() => {
        dispatch({ type: 'POMODORO_TICK' });
      }, 1000);
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [state.pomodoroIsRunning, dispatch]);

  // Auto-switch mode when timer completes — with proper cleanup
  useEffect(() => {
    const totalSec = state.pomodoroMode === 'focus'
      ? state.pomodoroFocusMinutes * 60
      : state.pomodoroBreakMinutes * 60;
    if (state.pomodoroSeconds >= totalSec && state.pomodoroSeconds > 0) {
      // Play notification
      playNotification();
      persist();
      const timeoutId = setTimeout(() => {
        dispatch({ type: 'POMODORO_SWITCH_MODE' });
      }, 2000);
      return () => clearTimeout(timeoutId);
    }
  }, [state.pomodoroSeconds, state.pomodoroMode, state.pomodoroFocusMinutes, state.pomodoroBreakMinutes, dispatch, persist]);

  // Persist on state changes
  useEffect(() => {
    persist();
  }, [state.pomodoroSeconds, state.pomodoroMode, persist]);

  const display = getTimerDisplay(
    state.pomodoroMode,
    state.pomodoroFocusMinutes,
    state.pomodoroBreakMinutes,
    state.pomodoroSeconds
  );

  const progress = getTimerProgress(
    state.pomodoroMode,
    state.pomodoroFocusMinutes,
    state.pomodoroBreakMinutes,
    state.pomodoroSeconds
  );

  return {
    mode: state.pomodoroMode,
    display,
    progress,
    isRunning: state.pomodoroIsRunning,
    start: () => dispatch({ type: 'POMODORO_START' }),
    pause: () => dispatch({ type: 'POMODORO_PAUSE' }),
    reset: () => dispatch({ type: 'POMODORO_RESET' }),
    switchMode: () => dispatch({ type: 'POMODORO_SWITCH_MODE' }),
  };
}

/* ---- Helpers ---- */

function getTimerDisplay(
  mode: 'focus' | 'break',
  focusMinutes: number,
  breakMinutes: number,
  seconds: number
): string {
  const totalSec = mode === 'focus' ? focusMinutes * 60 : breakMinutes * 60;
  const elapsed = totalSec - seconds;
  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;
  return `${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

function getTimerProgress(
  mode: 'focus' | 'break',
  focusMinutes: number,
  breakMinutes: number,
  seconds: number
): number {
  const totalSec = mode === 'focus' ? focusMinutes * 60 : breakMinutes * 60;
  if (totalSec === 0) return 0;
  return Math.round((seconds / totalSec) * 100);
}

function playNotification() {
  try {
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.frequency.value = 880;
    oscillator.type = 'sine';
    gain.gain.setValueAtTime(0.5, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + 0.5);

    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.frequency.value = 660;
    osc2.type = 'sine';
    gain2.gain.setValueAtTime(0.5, ctx.currentTime + 0.6);
    gain2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 1.1);
    osc2.start(ctx.currentTime + 0.6);
    osc2.stop(ctx.currentTime + 1.1);
  } catch {
    // Audio not available
  }
}
