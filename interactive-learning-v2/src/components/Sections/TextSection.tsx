import React from 'react';
import type { TextSection as TextSectionType } from '../../types/schema';
import { renderMarkdown } from '../../utils/renderContent';

interface TextSectionProps {
  section: TextSectionType;
}

export default function TextSection({ section }: TextSectionProps) {
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
      <div
        style={{
          color: 'var(--text-secondary)',
          lineHeight: 1.7,
        }}
        dangerouslySetInnerHTML={{ __html: renderMarkdown(section.content) }}
      />
    </div>
  );
}
