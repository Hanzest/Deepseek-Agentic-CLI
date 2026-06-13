import React, { useState, useCallback } from 'react';
import type { AccordionSection as AccordionSectionType } from '../../types/schema';
import { renderMarkdown } from '../../utils/renderContent';

interface AccordionSectionProps {
  section: AccordionSectionType;
}

export default function AccordionSection({ section }: AccordionSectionProps) {
  const [openItems, setOpenItems] = useState<Set<number>>(new Set());
  const behavior = section.accordionBehavior || 'multiple';

  const toggleItem = useCallback(
    (index: number) => {
      setOpenItems((prev) => {
        const next = new Set(prev);
        if (next.has(index)) {
          next.delete(index);
        } else {
          if (behavior === 'exclusive') {
            return new Set([index]);
          }
          next.add(index);
        }
        return next;
      });
    },
    [behavior]
  );

  const toggleAll = useCallback(() => {
    setOpenItems((prev) => {
      if (prev.size === section.items.length) return new Set();
      return new Set(section.items.map((_, i) => i));
    });
  }, [section.items.length]);

  const allOpen = openItems.size === section.items.length;

  return (
    <div style={{
      padding: '1.5rem',
      backgroundColor: 'var(--bg-primary)',
      borderRadius: '8px',
      border: '1px solid var(--border-color)',
      marginBottom: '1.5rem',
    }}>
      {section.title && <h2 style={{
        fontSize: '1.25rem',
        fontWeight: 600,
        color: 'var(--text-primary)',
        marginBottom: '0.75rem',
      }}>{section.title}</h2>}

      <button
        onClick={toggleAll}
        className="btn-base"
        style={{
          padding: '0.375rem 0.75rem',
          backgroundColor: 'var(--bg-tertiary)',
          border: '1px solid var(--border-color)',
          borderRadius: '4px',
          color: 'var(--text-secondary)',
          cursor: 'pointer',
          fontSize: '0.875rem',
          marginBottom: '1rem',
          transition: 'var(--transition-fast)',
        }}
      >
        {allOpen ? 'Collapse All' : 'Expand All'}
      </button>

      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.5rem',
      }}>
        {section.items.map((item, i) => (
          <div
            key={i}
            style={{
              border: '1px solid var(--border-color)',
              borderRadius: '6px',
              overflow: 'hidden',
              backgroundColor: openItems.has(i) ? 'var(--bg-secondary)' : 'var(--bg-primary)',
              transition: 'var(--transition-fast)',
            }}
          >
            <button
              onClick={() => toggleItem(i)}
              aria-expanded={openItems.has(i)}
              className="btn-base"
              style={{
                width: '100%',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '0.75rem 1rem',
                border: 'none',
                backgroundColor: 'transparent',
                color: 'var(--text-primary)',
                cursor: 'pointer',
                fontSize: '1rem',
                fontWeight: 500,
                textAlign: 'left',
              }}
            >
              <span>{item.heading}</span>
              <span style={{
                transition: 'var(--transition-fast)',
                transform: openItems.has(i) ? 'rotate(180deg)' : 'rotate(0deg)',
                fontSize: '0.75rem',
                color: 'var(--text-muted)',
              }}>
                ▼
              </span>
            </button>
            <div
              style={{
                maxHeight: openItems.has(i) ? '1000px' : '0',
                overflow: 'hidden',
                transition: 'max-height 0.15s ease, opacity 0.1s ease',
              }}
            >
              <div
                style={{
                  padding: '0 1rem 1rem',
                  color: 'var(--text-secondary)',
                  lineHeight: 1.7,
                }}
                dangerouslySetInnerHTML={{ __html: renderMarkdown(item.content) }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
