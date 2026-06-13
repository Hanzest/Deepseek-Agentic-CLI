import { useEffect, useRef, useMemo, useState } from 'react';
import { useAppContext } from '../../context/AppContext';
import Chart from 'chart.js/auto';

const s = {
  overlay: {
    position: 'fixed' as const,
    inset: 0,
    zIndex: 50,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    backdropFilter: 'blur(4px)',
    animation: 'fadeIn 200ms ease',
  } as React.CSSProperties,
  card: {
    background: 'var(--bg-primary)',
    color: 'var(--text-primary)',
    borderRadius: 16,
    boxShadow: 'var(--shadow-lg)',
    width: '90%',
    maxWidth: 520,
    maxHeight: '85vh',
    display: 'flex',
    flexDirection: 'column' as const,
    overflow: 'hidden',
    animation: 'slideUp 250ms ease',
  } as React.CSSProperties,
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '1.25rem 1.5rem',
    borderBottom: '1px solid var(--border-color)',
  } as React.CSSProperties,
  title: {
    fontSize: '1.25rem',
    fontWeight: 700,
    margin: 0,
  } as React.CSSProperties,
  closeBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--text-secondary)',
    fontSize: '1.25rem',
    cursor: 'pointer',
    width: 32,
    height: 32,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    transition: 'background var(--transition-fast), color var(--transition-fast)',
  } as React.CSSProperties,
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '0.75rem',
    padding: '1.25rem 1.5rem',
  } as React.CSSProperties,
  statCard: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: '0.25rem',
    padding: '0.75rem 0.5rem',
    background: 'var(--bg-secondary)',
    borderRadius: 10,
    border: '1px solid var(--border-color)',
  } as React.CSSProperties,
  statValue: {
    fontSize: '1.5rem',
    fontWeight: 700,
    color: 'var(--accent)',
    lineHeight: 1,
  } as React.CSSProperties,
  statLabel: {
    fontSize: '0.7rem',
    fontWeight: 500,
    color: 'var(--text-muted)',
    textAlign: 'center' as const,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.03em',
  } as React.CSSProperties,
  chartRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '1.5rem',
    padding: '0 1.5rem 1rem',
  } as React.CSSProperties,
  chartContainer: {
    width: 120,
    height: 120,
    flexShrink: 0,
  } as React.CSSProperties,
  chartLegend: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '0.5rem',
  } as React.CSSProperties,
  legendItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    fontSize: '0.875rem',
    color: 'var(--text-secondary)',
  } as React.CSSProperties,
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: '50%',
    flexShrink: 0,
  } as React.CSSProperties,
  pageList: {
    padding: '0 1.5rem 1.25rem',
    display: 'flex',
    flexDirection: 'column' as const,
    flex: 1,
    minHeight: 0,
  } as React.CSSProperties,
  pageListTitle: {
    fontSize: '0.875rem',
    fontWeight: 600,
    color: 'var(--text-muted)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    marginBottom: '0.5rem',
  } as React.CSSProperties,
  pageListScroll: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 2,
    overflowY: 'auto' as const,
    maxHeight: 220,
    scrollbarWidth: 'thin' as const,
  } as React.CSSProperties,
  pageRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0.5rem 0.75rem',
    borderRadius: 8,
    cursor: 'pointer',
    background: 'none',
    border: 'none',
    color: 'var(--text-primary)',
    fontSize: '0.875rem',
    textAlign: 'left' as const,
    width: '100%',
    transition: 'background var(--transition-fast)',
  } as React.CSSProperties,
  pageName: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
    flex: 1,
    minWidth: 0,
  } as React.CSSProperties,
  statusBadge: {
    fontSize: '0.7rem',
    fontWeight: 600,
    padding: '2px 8px',
    borderRadius: 9999,
    flexShrink: 0,
    marginLeft: '0.75rem',
  } as React.CSSProperties,
  statusDone: {
    background: 'var(--success-bg)',
    color: 'var(--success-text)',
    border: '1px solid var(--success-border)',
    fontSize: '0.7rem',
    fontWeight: 600,
    padding: '2px 8px',
    borderRadius: 9999,
    flexShrink: 0,
    marginLeft: '0.75rem',
  } as React.CSSProperties,
  statusViewed: {
    background: 'var(--info-bg)',
    color: 'var(--info-text)',
    border: '1px solid var(--info-border)',
    fontSize: '0.7rem',
    fontWeight: 600,
    padding: '2px 8px',
    borderRadius: 9999,
    flexShrink: 0,
    marginLeft: '0.75rem',
  } as React.CSSProperties,
  statusNew: {
    background: 'var(--bg-tertiary)',
    color: 'var(--text-muted)',
    border: '1px solid var(--border-color)',
    fontSize: '0.7rem',
    fontWeight: 600,
    padding: '2px 8px',
    borderRadius: 9999,
    flexShrink: 0,
    marginLeft: '0.75rem',
  } as React.CSSProperties,
  emptyMessage: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '2rem 1.5rem',
    fontSize: '0.875rem',
    color: 'var(--text-muted)',
    textAlign: 'center' as const,
  } as React.CSSProperties,
};

export default function DashboardOverlay() {
  const {
    state,
    toggleDashboard,
    goToPage,
    completedCount,
    completedPercent,
    isPageViewed,
    isPageCompleted,
  } = useAppContext();

  const chartRef = useRef<HTMLCanvasElement>(null);
  const chartInstance = useRef<Chart<'doughnut'> | null>(null);
  const [closeHovered, setCloseHovered] = useState(false);
  const [hoveredPage, setHoveredPage] = useState<number | null>(null);

  const { pages, viewedPages } = state;
  const totalPages = pages.length;
  const viewedCount = viewedPages.length;

  // Average quiz %
  const avgQuizPercent = useMemo(() => {
    const scores = state.quizScores || {};
    const entries = Object.values(scores);
    if (entries.length === 0) return 0;
    const total = entries.reduce((sum, s) => sum + (s.total > 0 ? s.correct / s.total : 0), 0);
    return Math.round((total / entries.length) * 100);
  }, [state.quizScores]);

  // Doughnut chart
  useEffect(() => {
    if (!chartRef.current) return;
    if (chartInstance.current) chartInstance.current.destroy();

    const remaining = totalPages - completedCount;
    chartInstance.current = new Chart(chartRef.current, {
      type: 'doughnut',
      data: {
        labels: ['Completed', 'Remaining'],
        datasets: [
          {
            data: [completedCount, remaining],
            backgroundColor: ['#10b981', '#e2e8f0'],
            borderWidth: 0,
            hoverOffset: 4,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        cutout: '65%',
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => `${ctx.label}: ${ctx.parsed} page${ctx.parsed !== 1 ? 's' : ''}`,
            },
          },
        },
      },
    });

    return () => {
      if (chartInstance.current) chartInstance.current.destroy();
    };
  }, [totalPages, completedCount]);

  const getStatusLabel = (index: number): { label: string; style: React.CSSProperties } => {
    if (isPageCompleted(index)) return { label: '✓ Done', style: s.statusDone };
    if (isPageViewed(index)) return { label: 'Viewed', style: s.statusViewed };
    return { label: 'New', style: s.statusNew };
  };

  const handlePageClick = (index: number) => {
    goToPage(index);
    toggleDashboard();
  };

  if (!state.showDashboard) return null;

  // Show helpful message when dashboard is open but there are no pages
  if (!totalPages) {
    return (
      <div style={s.overlay} onClick={toggleDashboard}>
        <div style={s.card} onClick={(e) => e.stopPropagation()}>
          <div style={s.header}>
            <h2 style={s.title}>📊 Progress Dashboard</h2>
            <button
              style={{ ...s.closeBtn, ...(closeHovered ? { background: 'var(--bg-tertiary)', color: 'var(--text-primary)' } : {}) }}
              onClick={toggleDashboard}
              aria-label="Close dashboard"
              onMouseEnter={() => setCloseHovered(true)}
              onMouseLeave={() => setCloseHovered(false)}
            >
              ✕
            </button>
          </div>
          <div style={s.emptyMessage}>
            Upload a JSON file to get started!
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={s.overlay} onClick={toggleDashboard}>
      <div style={s.card} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={s.header}>
          <h2 style={s.title}>📊 Progress Dashboard</h2>
          <button style={s.closeBtn} onClick={toggleDashboard} aria-label="Close dashboard">
            ✕
          </button>
        </div>

        {/* Stats grid */}
        <div style={s.statsGrid}>
          <div style={s.statCard}>
            <span style={s.statValue}>{totalPages}</span>
            <span style={s.statLabel}>Total Pages</span>
          </div>
          <div style={s.statCard}>
            <span style={s.statValue}>{completedPercent}%</span>
            <span style={s.statLabel}>Completed</span>
          </div>
          <div style={s.statCard}>
            <span style={s.statValue}>{viewedCount}</span>
            <span style={s.statLabel}>Viewed</span>
          </div>
          <div style={s.statCard}>
            <span style={s.statValue}>{avgQuizPercent}%</span>
            <span style={s.statLabel}>Avg Quiz %</span>
          </div>
        </div>

        {/* Chart + Legend */}
        <div style={s.chartRow}>
          <div style={s.chartContainer}>
            <canvas ref={chartRef} />
          </div>
          <div style={s.chartLegend}>
            <div style={s.legendItem}>
              <span style={{ ...s.legendDot, backgroundColor: '#10b981' }} />
              <span>Completed ({completedCount})</span>
            </div>
            <div style={s.legendItem}>
              <span style={{ ...s.legendDot, backgroundColor: '#e2e8f0' }} />
              <span>Remaining ({totalPages - completedCount})</span>
            </div>
          </div>
        </div>

        {/* Page details list */}
        <div style={s.pageList}>
          <h3 style={s.pageListTitle}>Pages</h3>
          <div style={s.pageListScroll}>
            {pages.map((page, i) => {
              const status = getStatusLabel(i);
              return (
                <button
                  key={i}
                  style={s.pageRow}
                  onClick={() => handlePageClick(i)}
                >
                  <span style={s.pageName}>
                    {page.page?.title || `Page ${i + 1}`}
                  </span>
                  <span style={status.style}>
                    {status.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
