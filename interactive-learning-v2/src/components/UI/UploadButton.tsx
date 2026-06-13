import React, { useRef } from 'react';
import { useAppContext } from '../../context/AppContext';
import type { LearningPage } from '../../types/schema';

export default function UploadButton() {
  const { addPage, addToast } = useAppContext();
  const fileRef = useRef<HTMLInputElement>(null);

  const processFile = async (file: File) => {
    try {
      const text = await file.text();
      const data: LearningPage = JSON.parse(text);
      if (!data.page && !data.sections) {
        addToast(`Invalid JSON in ${file.name}: missing page or sections`, 'error', 4000);
        return;
      }
      const ok = addPage(data, file.name);
      if (ok) {
        addToast(`Loaded "${data.page?.title || 'Untitled'}"`, 'success', 2000);
      }
    } catch {
      addToast(`Failed to parse ${file.name}`, 'error', 4000);
    }
  };

  const handleFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    for (let i = 0; i < files.length; i++) {
      await processFile(files[i]);
    }
    // Reset so the same files can be re-uploaded
    e.target.value = '';
  };

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept=".json"
        multiple
        onChange={handleFiles}
        style={{ display: 'none' }}
        aria-hidden="true"
      />
      <button
        onClick={() => fileRef.current?.click()}
        className="btn-base"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 36,
          height: 36,
          padding: 0,
          border: '1px solid var(--border-color)',
          borderRadius: 8,
          background: 'var(--bg-secondary)',
          color: 'var(--text-secondary)',
          cursor: 'pointer',
          transition: 'background 0.15s',
        }}
        title="Upload JSON page(s)"
        type="button"
        aria-label="Upload JSON page(s)"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={20} height={20}>
          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
      </button>
    </>
  );
}
