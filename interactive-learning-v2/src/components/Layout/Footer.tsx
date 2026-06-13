import React from 'react';
import { useAppContext } from '../../context/AppContext';

export default function Footer() {
  const {
    state,
    nextPage,
    prevPage,
    goToRandomPage,
    isPageViewed,
  } = useAppContext();

  const totalPages = state.pages.length;
  const currentIndex = state.currentPageIndex;
  const hasPages = totalPages > 0;

  // Current position (1-indexed)
  const position = hasPages ? currentIndex + 1 : 0;

  // Completed count
  const completedCount = state.pages.filter((_, i) => isPageViewed(i)).length;
  const completedPercent = totalPages > 0 ? Math.round((completedCount / totalPages) * 100) : 0;

  // Viewed count
  const viewedCount = state.viewedPages.length;

  const footerStyle: React.CSSProperties & { [key: string]: string | number | undefined } = {
    position: 'sticky',
    bottom: 0,
    zIndex: 10,
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.5rem 1rem',
    background: 'color-mix(in srgb, var(--bg-primary) 85%, transparent)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    borderTop: '1px solid var(--border-color)',
    minHeight: '3rem',
    transition: 'background-color var(--transition-normal)',
  };

  const navButtonStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '2rem',
    height: '2rem',
    border: '1px solid var(--border-color)',
    borderRadius: '0.375rem',
    background: 'var(--bg-secondary)',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    fontSize: '1rem',
    transition: 'background-color var(--transition-fast), color var(--transition-fast), border-color var(--transition-fast)',
    flexShrink: 0,
  };

  const navButtonDisabledStyle: React.CSSProperties = {
    ...navButtonStyle,
    opacity: 0.4,
    cursor: 'not-allowed',
  };

  const pagePositionStyle: React.CSSProperties = {
    fontSize: '0.8125rem',
    color: 'var(--text-muted)',
    whiteSpace: 'nowrap',
    minWidth: '3rem',
    textAlign: 'center',
    fontVariantNumeric: 'tabular-nums',
  };

  const spacerStyle: React.CSSProperties = {
    flex: 1,
  };

  const randomButtonStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '2rem',
    height: '2rem',
    border: 'none',
    borderRadius: '0.375rem',
    background: 'transparent',
    color: 'var(--text-muted)',
    cursor: 'pointer',
    fontSize: '1.125rem',
    transition: 'background-color var(--transition-fast), color var(--transition-fast)',
    flexShrink: 0,
  };

  const progressBarWrapperStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    minWidth: '8rem',
  };

  const progressBarStyle: React.CSSProperties = {
    flex: 1,
    height: '0.375rem',
    borderRadius: '0.25rem',
    background: 'var(--bg-tertiary)',
    overflow: 'hidden',
  };

  const progressFillStyle: React.CSSProperties = {
    height: '100%',
    borderRadius: '0.25rem',
    background: 'var(--accent)',
    transition: 'width var(--transition-normal)',
    width: `${completedPercent}%`,
  };

  const progressLabelStyle: React.CSSProperties = {
    fontSize: '0.75rem',
    color: 'var(--text-muted)',
    whiteSpace: 'nowrap',
    fontVariantNumeric: 'tabular-nums',
  };

  const viewedCountStyle: React.CSSProperties = {
    fontSize: '0.75rem',
    color: 'var(--text-muted)',
    whiteSpace: 'nowrap',
  };

  return (
    <footer style={footerStyle}>
      {/* Previous */}
      <button
        style={(!hasPages || currentIndex <= 0) ? navButtonDisabledStyle : navButtonStyle}
        onClick={prevPage}
        disabled={!hasPages || currentIndex <= 0}
        aria-label="Previous page"
        title="Previous (←)"
      >
        ◀
      </button>

      {/* Page position */}
      <span style={pagePositionStyle}>
        {hasPages ? `${position}/${totalPages}` : '—'}
      </span>

      {/* Next */}
      <button
        style={(!hasPages || currentIndex >= totalPages - 1) ? navButtonDisabledStyle : navButtonStyle}
        onClick={nextPage}
        disabled={!hasPages || currentIndex >= totalPages - 1}
        aria-label="Next page"
        title="Next (→)"
      >
        ▶
      </button>

      {/* Spacer */}
      <div style={spacerStyle} />

      {/* Random button */}
      <button
        style={randomButtonStyle}
        onClick={goToRandomPage}
        disabled={!hasPages}
        aria-label="Random page"
        title="Random page"
      >
        🎲
      </button>

      {/* Progress bar */}
      <div style={progressBarWrapperStyle}>
        <div style={progressBarStyle}>
          <div style={progressFillStyle} />
        </div>
        <span style={progressLabelStyle}>{completedPercent}%</span>
      </div>

      {/* Viewed count */}
      <span style={viewedCountStyle}>
        {viewedCount} viewed
      </span>
    </footer>
  );
}
