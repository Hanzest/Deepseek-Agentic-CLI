import React from 'react';
import FileUploadDropZone from '../UI/FileUploadDropZone';

export default function WelcomePage() {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '3rem 2rem',
      textAlign: 'center',
      minHeight: '60vh',
    }}>
      <div style={{ fontSize: 64, marginBottom: 16 }}>📖</div>
      <h2 style={{
        fontSize: '1.5rem',
        fontWeight: 700,
        color: 'var(--text-primary)',
        marginBottom: 8,
      }}>
        Welcome to Interactive Learning
      </h2>
      <p style={{
        color: 'var(--text-secondary)',
        maxWidth: 480,
        marginBottom: 24,
        lineHeight: 1.6,
      }}>
        Upload a JSON learning page file to get started. Drag & drop a file onto the sidebar or click the upload button below.
      </p>

      {/* Inline upload zone for convenience */}
      <div style={{ maxWidth: 400, width: '100%', marginBottom: 32 }}>
        <FileUploadDropZone />
      </div>

      <div style={{
        color: 'var(--text-muted)',
        fontSize: 13,
        lineHeight: 2,
      }}>
        <p>
          Press{' '}
          <kbd style={{
            padding: '1px 6px',
            background: 'var(--bg-tertiary)',
            border: '1px solid var(--border-color)',
            borderRadius: 4,
            fontSize: 12,
            fontWeight: 600,
            fontFamily: 'monospace',
            color: 'var(--text-primary)',
          }}>?</kbd>
          {' '}for keyboard shortcuts
        </p>
        <p>
          Use{' '}
          <kbd style={{
            padding: '1px 6px',
            background: 'var(--bg-tertiary)',
            border: '1px solid var(--border-color)',
            borderRadius: 4,
            fontSize: 12,
            fontWeight: 600,
            fontFamily: 'monospace',
            color: 'var(--text-primary)',
          }}>←</kbd>
          {' '}
          <kbd style={{
            padding: '1px 6px',
            background: 'var(--bg-tertiary)',
            border: '1px solid var(--border-color)',
            borderRadius: 4,
            fontSize: 12,
            fontWeight: 600,
            fontFamily: 'monospace',
            color: 'var(--text-primary)',
          }}>→</kbd>
          {' '}to navigate between pages
        </p>
      </div>
    </div>
  );
}
