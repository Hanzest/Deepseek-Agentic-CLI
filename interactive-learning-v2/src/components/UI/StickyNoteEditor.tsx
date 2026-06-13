import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAppContext } from '../../context/AppContext';

interface Props {
  pageIndex: number;
  sectionIndex: number;
}

export default function StickyNoteEditor({ pageIndex, sectionIndex }: Props) {
  const { getNote, saveNote } = useAppContext();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Load existing note
  useEffect(() => {
    const note = getNote(pageIndex, sectionIndex);
    if (note) {
      setText(note);
      setOpen(true);
    } else {
      setText('');
    }
  }, [pageIndex, sectionIndex, getNote]);

  // Debounced save
  const debouncedSave = useCallback(
    (val: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        saveNote(pageIndex, sectionIndex, val);
      }, 600);
    },
    [pageIndex, sectionIndex, saveNote]
  );

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setText(val);
    debouncedSave(val);
  };

  // Cleanup
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return (
    <div style={{ marginTop: 12 }}>
      <button
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          padding: '4px 8px',
          border: '1px solid var(--border-color)',
          borderRadius: 6,
          background: 'var(--bg-primary)',
          color: 'var(--text-secondary)',
          fontSize: 12,
          cursor: 'pointer',
          transition: 'background 0.15s, color 0.15s',
        }}
        onClick={() => setOpen((o) => !o)}
        type="button"
        aria-label={open ? 'Close notes' : 'Open notes'}
        title={open ? 'Close notes' : 'Add notes'}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={16} height={16}>
          <path d="M12 20h9M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
        </svg>
        <span style={{ fontSize: 12 }}>Notes</span>
      </button>
      {open && (
        <textarea
          style={{
            display: 'block',
            width: '100%',
            marginTop: 8,
            padding: 8,
            border: '1px solid var(--border-color)',
            borderRadius: 6,
            background: 'var(--bg-primary)',
            color: 'var(--text-primary)',
            fontSize: 13,
            fontFamily: 'inherit',
            lineHeight: 1.5,
            resize: 'vertical',
            outline: 'none',
            transition: 'border-color 0.15s',
          }}
          value={text}
          onChange={handleChange}
          placeholder="Write your notes here..."
          rows={3}
        />
      )}
    </div>
  );
}
