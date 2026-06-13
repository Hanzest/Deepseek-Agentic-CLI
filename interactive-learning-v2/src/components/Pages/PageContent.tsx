import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAppContext } from '../../context/AppContext';
import SectionRenderer from '../Sections/SectionRenderer';
import styles from './PageContent.module.css';

export default function PageContent() {
  const { state } = useAppContext();
  const [currentSlide, setCurrentSlide] = useState(0);
  const slideDirection = useRef(1);
  const [animClass, setAnimClass] = useState('');

  const page = state.currentPageIndex >= 0 && state.currentPageIndex < state.pages.length
    ? state.pages[state.currentPageIndex]
    : null;

  // Reset slide position when navigating between pages
  useEffect(() => {
    setCurrentSlide(0);
  }, [state.currentPageIndex]);

  if (!page) return null;

  const meta = page.page || {};
  const title = meta.title || 'Untitled';
  const description = meta.description || '';
  const tags = meta.tags || [];
  const sections = page.sections || [];

  const totalSlides = sections.length;
  const hasMultipleSlides = totalSlides > 1;

  const goPrev = useCallback(() => {
    slideDirection.current = -1;
    setAnimClass(styles.slideEnterLeft);
    setCurrentSlide((p) => Math.max(0, p - 1));
  }, []);

  const goNext = useCallback(() => {
    slideDirection.current = 1;
    setAnimClass(styles.slideEnterRight);
    setCurrentSlide((p) => Math.min(totalSlides - 1, p + 1));
  }, [totalSlides]);

  // Clear animation class after it finishes
  useEffect(() => {
    if (!animClass) return;
    const timer = setTimeout(() => setAnimClass(''), 300);
    return () => clearTimeout(timer);
  }, [animClass]);

  return (
    <div style={{ padding: '1.5rem 2rem', maxWidth: 900, margin: '0 auto' }}>
      {/* === Fixed Metadata Section === */}
      <div style={{ marginBottom: 24 }}>
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
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
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

        {/* Progress bar (dots) — only if multiple sections */}
        {hasMultipleSlides && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            paddingTop: 4,
            borderTop: '1px solid var(--border-color)',
          }}>
            {sections.map((_, i) => (
              <button
                key={i}
                onClick={() => {
                  slideDirection.current = i > currentSlide ? 1 : -1;
                  setAnimClass(i > currentSlide ? styles.slideEnterRight : styles.slideEnterLeft);
                  setCurrentSlide(i);
                }}
                aria-label={`Go to section ${i + 1}`}
                style={{
                  width: i === currentSlide ? 24 : 8,
                  height: 8,
                  borderRadius: 4,
                  border: 'none',
                  backgroundColor: i === currentSlide ? 'var(--accent)' : 'var(--bg-tertiary)',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
              />
            ))}
            <span style={{
              fontSize: '0.75rem',
              color: 'var(--text-muted)',
              marginLeft: 8,
              whiteSpace: 'nowrap',
            }}>
              {currentSlide + 1} / {totalSlides}
            </span>
          </div>
        )}
      </div>

      {/* === Slide Area === */}
      {totalSlides > 0 ? (
        <div style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'flex-start',
          gap: 12,
        }}>
          {/* Previous Arrow — outside the card */}
          {hasMultipleSlides && (
            <button
              onClick={goPrev}
              disabled={currentSlide === 0}
              aria-label="Previous section"
              style={{
                flexShrink: 0,
                width: 40,
                height: 40,
                borderRadius: '50%',
                border: '1px solid var(--border-color)',
                backgroundColor: 'var(--bg-primary)',
                color: currentSlide === 0 ? 'var(--text-muted)' : 'var(--text-secondary)',
                cursor: currentSlide === 0 ? 'not-allowed' : 'pointer',
                fontSize: '1.1rem',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'var(--transition-fast)',
                opacity: currentSlide === 0 ? 0.3 : 1,
                marginTop: 60,
              }}
            >
              ◀
            </button>
          )}

          {/* Slide content */}
          <div className={animClass || undefined} style={{ flex: 1, minWidth: 0 }}>
            <SectionRenderer
              key={`${state.currentPageIndex}-${currentSlide}`}
              section={sections[currentSlide]}
              sectionIndex={currentSlide}
            />
          </div>

          {/* Next Arrow — outside the card */}
          {hasMultipleSlides && (
            <button
              onClick={goNext}
              disabled={currentSlide === totalSlides - 1}
              aria-label="Next section"
              style={{
                flexShrink: 0,
                width: 40,
                height: 40,
                borderRadius: '50%',
                border: '1px solid var(--border-color)',
                backgroundColor: 'var(--bg-primary)',
                color: currentSlide === totalSlides - 1 ? 'var(--text-muted)' : 'var(--text-secondary)',
                cursor: currentSlide === totalSlides - 1 ? 'not-allowed' : 'pointer',
                fontSize: '1.1rem',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'var(--transition-fast)',
                opacity: currentSlide === totalSlides - 1 ? 0.3 : 1,
                marginTop: 60,
              }}
            >
              ▶
            </button>
          )}
        </div>
      ) : (
        <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 32 }}>
          This page has no sections.
        </p>
      )}
    </div>
  );
}
