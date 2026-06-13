import React, { useState, useRef, useCallback } from 'react';
import type { SortingSection as SortingSectionType } from '../../types/schema';

interface SortingSectionProps {
  section: SortingSectionType;
}

// Drag-to-reorder list with smooth FLIP animation
export default function SortingSection({ section }: SortingSectionProps) {
  const [items, setItems] = useState(() =>
    [...section.items].sort(() => Math.random() - 0.5)
  );
  const [submitted, setSubmitted] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const dragItemRef = useRef<number | null>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const animFrameRef = useRef<number>(0);

  // FLIP animation: record positions before reorder, animate delta after reorder
  const flipAnimate = useCallback(() => {
    const refs = itemRefs.current;
    const positions = refs.map((el) => el?.getBoundingClientRect());
    return () => {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = requestAnimationFrame(() => {
        refs.forEach((el, i) => {
          if (!el || !positions[i]) return;
          const newPos = el.getBoundingClientRect();
          const dx = positions[i]!.left - newPos.left;
          const dy = positions[i]!.top - newPos.top;
          if (dx === 0 && dy === 0) return;
          el.style.transition = 'none';
          el.style.transform = `translate(${dx}px, ${dy}px)`;
          // Force style recalc, then animate back
          void el.offsetHeight;
          el.style.transition = 'transform 250ms ease';
          el.style.transform = '';
        });
      });
    };
  }, []);

  const handleDragStart = (index: number) => {
    dragItemRef.current = index;
    setDragIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    setDragOverIndex(index);
  };

  const handleDrop = (index: number) => {
    const from = dragItemRef.current;
    if (from === null || from === index) {
      setDragIndex(null);
      setDragOverIndex(null);
      return;
    }
    const cleanup = flipAnimate();
    setItems((prev) => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(index, 0, moved);
      return next;
    });
    // Run FLIP after state update
    requestAnimationFrame(() => requestAnimationFrame(cleanup));
    setDragIndex(null);
    setDragOverIndex(null);
    dragItemRef.current = null;
  };

  const handleDragEnd = () => {
    setDragIndex(null);
    setDragOverIndex(null);
    dragItemRef.current = null;
  };

  const handleSubmit = () => {
    setSubmitted(true);
  };

  const handleReset = () => {
    setItems([...section.items].sort(() => Math.random() - 0.5));
    setSubmitted(false);
  };

  const getItemStatus = (item: typeof section.items[0], index: number) => {
    if (!submitted) return '';
    if (item.correctOrder === index + 1) return 'correct';
    return 'wrong';
  };

  const correctCount = submitted
    ? items.filter((item, i) => item.correctOrder === i + 1).length
    : 0;

  const itemBg = (status: string, isDragging: boolean, isDragOver: boolean): string => {
    if (isDragging) return 'var(--accent-light)';
    if (isDragOver) return 'var(--bg-tertiary)';
    if (status === 'correct') return 'rgba(16, 185, 129, 0.1)';
    if (status === 'wrong') return 'rgba(239, 68, 68, 0.1)';
    return 'var(--bg-secondary)';
  };

  const itemBorder = (status: string, isDragging: boolean, isDragOver: boolean): string => {
    if (isDragging) return '2px solid var(--accent)';
    if (isDragOver) return '2px dashed var(--accent)';
    if (status === 'correct') return '2px solid var(--success)';
    if (status === 'wrong') return '2px solid var(--error)';
    return '1px solid var(--border-color)';
  };

  return (
    <div style={{
      padding: '1.5rem',
      backgroundColor: 'var(--bg-primary)',
      borderRadius: '8px',
      border: '1px solid var(--border-color)',
      boxShadow: 'var(--shadow-card)',
      marginBottom: '1.5rem',
    }}>
      {section.title && <h2 style={{
        fontSize: '1.25rem',
        fontWeight: 600,
        color: 'var(--text-primary)',
        marginBottom: '0.75rem',
      }}>{section.title}</h2>}

      {submitted && (
        <div style={{
          padding: '0.625rem 1rem',
          backgroundColor: 'var(--accent-light)',
          borderRadius: '6px',
          marginBottom: '1rem',
          fontWeight: 600,
          color: 'var(--accent)',
          fontSize: '0.9rem',
        }}>
          {correctCount} / {section.items.length} correctly positioned
        </div>
      )}

      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.5rem',
      }}>
        {items.map((item, i) => {
          const status = submitted ? getItemStatus(item, i) : '';
          const isDragging = dragIndex === i;
          const isDragOver = dragOverIndex === i;
          const correctPos = submitted ? item.correctOrder : null;

          return (
            <div
              key={`${item.text}-${i}`}
              ref={(el) => { itemRefs.current[i] = el; }}
              draggable={!submitted}
              onDragStart={() => handleDragStart(i)}
              onDragOver={(e) => handleDragOver(e, i)}
              onDrop={() => handleDrop(i)}
              onDragEnd={handleDragEnd}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                padding: '0.75rem',
                backgroundColor: itemBg(status, isDragging, isDragOver),
                border: itemBorder(status, isDragging, isDragOver),
                borderRadius: '6px',
                cursor: submitted ? 'default' : 'grab',
                transition: 'background-color 150ms ease, border-color 150ms ease, opacity 150ms ease',
                opacity: isDragging ? 0.6 : 1,
              }}
            >
              <span style={{
                cursor: submitted ? 'default' : 'grab',
                color: 'var(--text-muted)',
                fontSize: '1.2rem',
                userSelect: 'none',
              }} title="Drag to reorder">
                ⠿
              </span>
              <span style={{
                flex: 1,
                color: 'var(--text-primary)',
              }}>
                {item.text}
              </span>
              {submitted && correctPos !== i + 1 && (
                <span style={{
                  fontSize: '0.8rem',
                  color: 'var(--text-muted)',
                  fontStyle: 'italic',
                }}>
                  → position {correctPos}
                </span>
              )}
            </div>
          );
        })}
      </div>

      <div style={{
        display: 'flex',
        gap: '0.5rem',
        marginTop: '1rem',
      }}>
        {!submitted ? (
          <button
            onClick={handleSubmit}
            className="btn-base"
            style={{
              padding: '0.5rem 1.25rem',
              border: 'none',
              borderRadius: '6px',
              backgroundColor: 'var(--accent)',
              color: '#fff',
              cursor: 'pointer',
              fontWeight: 500,
              fontSize: '0.875rem',
              transition: 'var(--transition-fast)',
            }}
          >
            Check Order
          </button>
        ) : (
          <button
            onClick={handleReset}
            className="btn-base"
            style={{
              padding: '0.5rem 1.25rem',
              border: '1px solid var(--border-color)',
              borderRadius: '6px',
              backgroundColor: 'var(--bg-secondary)',
              color: 'var(--text-primary)',
              cursor: 'pointer',
              fontWeight: 500,
              fontSize: '0.875rem',
              transition: 'var(--transition-fast)',
            }}
          >
            Reset & Reshuffle
          </button>
        )}
      </div>
    </div>
  );
}
