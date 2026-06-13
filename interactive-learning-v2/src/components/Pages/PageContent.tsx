import React from 'react';
import { useAppContext } from '../../context/AppContext';
import SectionRenderer from '../Sections/SectionRenderer';

export default function PageContent() {
  const { state } = useAppContext();
  const page = state.currentPageIndex >= 0 && state.currentPageIndex < state.pages.length
    ? state.pages[state.currentPageIndex]
    : null;

  if (!page) return null;

  const meta = page.page || {};
  const title = meta.title || 'Untitled';
  const description = meta.description || '';
  const tags = meta.tags || [];
  const sections = page.sections || [];

  return (
    <div style={{ padding: '1.5rem 2rem', maxWidth: 900, margin: '0 auto' }}>
      {/* Title */}
      <h1 style={{
        fontSize: '1.75rem',
        fontWeight: 700,
        color: 'var(--text-primary)',
        marginBottom: 4,
      }}>
        {title}
      </h1>

      {/* Description */}
      {description && (
        <p style={{
          color: 'var(--text-secondary)',
          marginBottom: 16,
          fontSize: '0.9375rem',
          lineHeight: 1.6,
        }}>
          {description}
        </p>
      )}

      {/* Tags */}
      {tags.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 24 }}>
          {tags.map((tag) => (
            <span key={tag} style={{
              padding: '2px 10px',
              borderRadius: 999,
              fontSize: 12,
              fontWeight: 500,
              background: 'var(--accent-light)',
              color: 'var(--accent)',
              border: '1px solid var(--accent-mid)',
            }}>
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Sections rendered via dedicated SectionRenderer */}
      {sections.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {sections.map((section, idx) => (
            <SectionRenderer key={`${state.currentPageIndex}-${idx}`} section={section} sectionIndex={idx} />
          ))}
        </div>
      ) : (
        <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 32 }}>
          This page has no sections.
        </p>
      )}
    </div>
  );
}
