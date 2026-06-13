import React, { useState, useCallback } from 'react';
import type { ChecklistSection as ChecklistSectionType } from '../../types/schema';
import { useAppContext } from '../../context/AppContext';

interface ChecklistSectionProps {
  section: ChecklistSectionType;
  sectionIndex: number;
}

export default function ChecklistSection({ section, sectionIndex }: ChecklistSectionProps) {
  const { state, saveChecklist } = useAppContext();
  const pageMeta = state.pages[state.currentPageIndex]?._meta;
  const savedChecklist = pageMeta?.checklist?.[sectionIndex] || {};
  const [checked, setChecked] = useState<Record<number, boolean>>(savedChecklist);

  const toggleCheck = useCallback(
    (index: number) => {
      setChecked((prev) => {
        const next = { ...prev, [index]: !prev[index] };
        saveChecklist(state.currentPageIndex, sectionIndex, next);
        return next;
      });
    },
    [state.currentPageIndex, sectionIndex, saveChecklist]
  );

  const clearAll = useCallback(() => {
    setChecked({});
    saveChecklist(state.currentPageIndex, sectionIndex, {});
  }, [state.currentPageIndex, sectionIndex, saveChecklist]);

  const checkedCount = Object.values(checked).filter(Boolean).length;
  const totalItems = section.items.length;
  const progressPercent = totalItems > 0 ? (checkedCount / totalItems) * 100 : 0;

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

      {/* Progress bar */}
      <div style={{
        width: '100%',
        height: '8px',
        backgroundColor: 'var(--bg-tertiary)',
        borderRadius: '4px',
        overflow: 'hidden',
        marginBottom: '0.375rem',
      }}>
        <div style={{
          width: `${progressPercent}%`,
          height: '100%',
          background: 'linear-gradient(90deg, var(--accent), var(--accent-hover))',
          borderRadius: '4px',
          transition: 'var(--transition-normal)',
        }} />
      </div>
      <div style={{
        fontSize: '0.875rem',
        color: 'var(--text-muted)',
        marginBottom: '1rem',
      }}>
        {checkedCount} / {totalItems} completed
      </div>

      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.5rem',
      }}>
        {section.items.map((item, i) => {
          const isOptional = item.optional;
          const isChecked = !!checked[i];

          return (
            <label
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.625rem 0.75rem',
                borderRadius: '6px',
                backgroundColor: isChecked ? 'var(--bg-secondary)' : 'transparent',
                border: isOptional ? '1px dashed var(--border-color)' : '1px solid transparent',
                cursor: 'pointer',
                transition: 'var(--transition-fast)',
                opacity: isChecked ? 0.75 : 1,
                textDecoration: isChecked ? 'line-through' : 'none',
                color: isChecked ? 'var(--text-muted)' : 'var(--text-primary)',
              }}
            >
              <input
                type="checkbox"
                checked={isChecked}
                onChange={() => toggleCheck(i)}
                style={{
                  accentColor: 'var(--accent)',
                  cursor: 'pointer',
                }}
              />
              <span style={{ flex: 1 }}>{item.text}</span>
              {isOptional && (
                <span style={{
                  fontSize: '0.75rem',
                  padding: '0.125rem 0.375rem',
                  borderRadius: '4px',
                  backgroundColor: 'var(--bg-tertiary)',
                  color: 'var(--text-muted)',
                }}>optional</span>
              )}
            </label>
          );
        })}
      </div>

      {checkedCount > 0 && (
        <button
          onClick={clearAll}
          className="btn-base"
          style={{
            marginTop: '1rem',
            padding: '0.375rem 0.75rem',
            backgroundColor: 'var(--bg-tertiary)',
            border: '1px solid var(--border-color)',
            borderRadius: '4px',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            fontSize: '0.875rem',
            transition: 'var(--transition-fast)',
          }}
        >
          Clear All
        </button>
      )}
    </div>
  );
}
