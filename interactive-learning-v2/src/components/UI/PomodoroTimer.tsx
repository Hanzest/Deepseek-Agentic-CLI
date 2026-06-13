import React from 'react';
import { useTimer } from '../../hooks/useTimer';

export default function PomodoroTimer() {
  const { mode, display, progress, isRunning, start, pause, reset } = useTimer();

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '8px 12px',
      borderRadius: 8,
      background: 'var(--bg-secondary)',
      border: '1px solid var(--border-color)',
      position: 'relative',
      overflow: 'hidden',
    }}>
      <span style={{ fontSize: 18, lineHeight: 1 }}>{mode === 'focus' ? '🍅' : '☕'}</span>
      <span style={{
        fontSize: 16,
        fontWeight: 600,
        fontVariantNumeric: 'tabular-nums',
        color: 'var(--text-primary)',
        minWidth: 48,
        textAlign: 'center',
      }}>
        {display}
      </span>
      <button
        onClick={isRunning ? pause : start}
        title={isRunning ? 'Pause' : 'Start'}
        type="button"
        aria-label={isRunning ? 'Pause timer' : 'Start timer'}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 28,
          height: 28,
          padding: 0,
          border: 'none',
          borderRadius: 6,
          background: 'transparent',
          color: 'var(--text-primary)',
          fontSize: 14,
          cursor: 'pointer',
          transition: 'background 0.15s',
        }}
      >
        {isRunning ? '⏸' : '▶'}
      </button>
      <button
        onClick={reset}
        title="Reset"
        type="button"
        aria-label="Reset timer"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 28,
          height: 28,
          padding: 0,
          border: 'none',
          borderRadius: 6,
          background: 'transparent',
          color: 'var(--text-primary)',
          fontSize: 14,
          cursor: 'pointer',
          transition: 'background 0.15s',
        }}
      >
        ↺
      </button>
      <div style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: 3,
        background: 'var(--border-color)',
        borderRadius: '0 0 8px 8px',
        overflow: 'hidden',
      }}>
        <div
          style={{
            height: '100%',
            background: 'var(--accent)',
            borderRadius: '0 0 0 8px',
            transition: 'width 0.5s linear',
            width: `${progress}%`,
          }}
        />
      </div>
    </div>
  );
}
