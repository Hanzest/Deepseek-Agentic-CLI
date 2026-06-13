import React, { useState, useRef, useEffect } from 'react';
import { useAppContext } from '../../context/AppContext';
import type { LearningPage } from '../../types/schema';

interface Props {
  page: LearningPage;
  index: number;
  isActive: boolean;
  isCompleted: boolean;
  isViewed: boolean;
  isQuizDone: boolean;
}

export default function PageListItem({ page, index, isActive, isCompleted, isViewed, isQuizDone }: Props) {
  const {
    goToPage,
    togglePageComplete,
    renamePage,
    removePage,
    setRenamingIndex,
    setContextMenu,
    state,
  } = useAppContext();

  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [hovered, setHovered] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const title = page.page?.title || `Page ${index + 1}`;
  const icon = page.page?.icon || '📄';

  // Sync with global renaming index
  useEffect(() => {
    if (state.renamingIndex === index && !renaming) {
      setRenaming(true);
      setRenameValue(title);
    }
    if (state.renamingIndex !== index && renaming) {
      setRenaming(false);
    }
  }, [state.renamingIndex, index]);

  useEffect(() => {
    if (renaming && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [renaming]);

  const handleRenameSubmit = () => {
    if (renameValue.trim()) {
      renamePage(index, renameValue.trim());
    }
    setRenaming(false);
    setRenamingIndex(null);
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    if (state.contextMenu?.index === index) {
      setContextMenu(null);
    } else {
      setContextMenu({ index, x: e.clientX, y: e.clientY });
    }
  };

  const statusIndicator = () => {
    if (isCompleted) {
      return (
        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 20, height: 20, borderRadius: '50%', background: 'var(--success)', color: '#fff', fontSize: 10, fontWeight: 700, flexShrink: 0 }} title="Completed">
          ✓
        </span>
      );
    }
    if (isQuizDone) {
      return (
        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 20, height: 20, borderRadius: '50%', background: 'var(--accent)', color: '#fff', fontSize: 9, fontWeight: 700, flexShrink: 0 }} title="Quiz completed">
          Q
        </span>
      );
    }
    return (
      <span style={{
        width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
        background: isViewed ? 'var(--accent)' : 'var(--text-muted)',
      }} />
    );
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 12px',
        cursor: 'pointer',
        background: isActive ? 'var(--accent-light)' : 'transparent',
        borderLeft: isActive ? '3px solid var(--accent)' : '3px solid transparent',
        transition: 'background 0.15s',
        userSelect: 'none',
        position: 'relative',
      }}
      onClick={() => goToPage(index)}
      onContextMenu={handleContextMenu}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={title}
    >
      {/* Drag handle */}
      <span style={{ color: 'var(--text-muted)', fontSize: 16, cursor: 'grab', flexShrink: 0 }}>
        ⠿
      </span>

      {/* Status indicator */}
      {statusIndicator()}

      {/* Icon */}
      <span style={{ fontSize: 16, flexShrink: 0 }}>{icon}</span>

      {/* Title / Rename input */}
      {renaming ? (
        <input
          ref={inputRef}
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onBlur={handleRenameSubmit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleRenameSubmit();
            if (e.key === 'Escape') {
              setRenaming(false);
              setRenamingIndex(null);
            }
          }}
          onClick={(e) => e.stopPropagation()}
          style={{
            flex: 1,
            padding: '2px 4px',
            border: '1px solid var(--accent)',
            borderRadius: 4,
            fontSize: 13,
            outline: 'none',
            background: 'var(--bg-primary)',
            color: 'var(--text-primary)',
          }}
        />
      ) : (
        <span
          style={{
            flex: 1,
            fontSize: 13,
            color: 'var(--text-primary)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {title}
        </span>
      )}

      {/* Hover action buttons */}
      {hovered && !renaming && (
        <div
          style={{
            display: 'flex',
            gap: 2,
            position: 'absolute',
            right: 8,
            top: '50%',
            transform: 'translateY(-50%)',
            background: 'var(--bg-primary)',
            padding: '2px 4px',
            borderRadius: 6,
            border: '1px solid var(--border-color)',
            boxShadow: 'var(--shadow-sm)',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            title={isCompleted ? 'Mark incomplete' : 'Mark complete'}
            onClick={() => togglePageComplete(index)}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 2,
              fontSize: 13,
              color: isCompleted ? 'var(--success)' : 'var(--text-muted)',
              borderRadius: 4,
              lineHeight: 1,
            }}
            type="button"
          >
            {isCompleted ? '↩' : '✓'}
          </button>
          <button
            title="Rename"
            onClick={() => { setRenaming(true); setRenameValue(title); setRenamingIndex(index); }}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 2,
              fontSize: 13,
              color: 'var(--text-muted)',
              borderRadius: 4,
              lineHeight: 1,
            }}
            type="button"
          >
            ✎
          </button>
          <button
            title="Delete"
            onClick={() => removePage(index)}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 2,
              fontSize: 13,
              color: 'var(--text-muted)',
              borderRadius: 4,
              lineHeight: 1,
            }}
            type="button"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
