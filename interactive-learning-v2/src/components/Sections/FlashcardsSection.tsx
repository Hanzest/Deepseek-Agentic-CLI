import React, { useState, useCallback, useRef, useEffect } from 'react';
import type { FlashcardsSection as FlashcardsSectionType, FlashcardProgress } from '../../types/schema';
import { useAppContext } from '../../context/AppContext';
import { renderMarkdown } from '../../utils/renderContent';

interface FlashcardsSectionProps {
  section: FlashcardsSectionType;
  sectionIndex: number;
}

export default function FlashcardsSection({ section, sectionIndex }: FlashcardsSectionProps) {
  const { state } = useAppContext();
  const [currentCard, setCurrentCard] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const animTimeoutRef = useRef<number | null>(null);

  // Cleanup animation timeout on unmount
  useEffect(() => () => {
    if (animTimeoutRef.current !== null) clearTimeout(animTimeoutRef.current);
  }, []);

  const pageMeta = state.pages[state.currentPageIndex]?._meta;
  const flashcardProgress = pageMeta?.flashcardProgress?.[sectionIndex] || {};
  const masteredCards = Object.entries(flashcardProgress)
    .filter(([, v]) => v.known)
    .map(([k]) => Number(k));

  const cards = section.cards;

  const totalCards = cards.length;
  const masteredCount = masteredCards.length;
  const allMastered = masteredCount === section.cards.length;

  const advanceCard = useCallback((dir: 1 | -1) => {
    setCurrentCard((p) => {
      const next = p + dir;
      if (next < 0 || next >= totalCards) return p; // clamp at boundaries
      return next;
    });
  }, [totalCards]);

  const handlePrev = useCallback(() => {
    if (isAnimating || currentCard <= 0) return;
    if (flipped) {
      setIsAnimating(true);
      setFlipped(false);
      animTimeoutRef.current = window.setTimeout(() => {
        advanceCard(-1);
        setIsAnimating(false);
      }, 600);
    } else {
      advanceCard(-1);
    }
  }, [flipped, isAnimating, advanceCard, currentCard]);

  const handleNext = useCallback(() => {
    if (isAnimating || currentCard >= totalCards - 1) return;
    if (flipped) {
      setIsAnimating(true);
      setFlipped(false);
      animTimeoutRef.current = window.setTimeout(() => {
        advanceCard(1);
        setIsAnimating(false);
      }, 600);
    } else {
      advanceCard(1);
    }
  }, [flipped, isAnimating, advanceCard, currentCard, totalCards]);

  const handleFlip = () => setFlipped((p) => !p);

  if (allMastered) {
    return (
      <div style={{
        padding: '1.5rem',
        backgroundColor: 'var(--bg-primary)',
        borderRadius: '8px',
        border: '1px solid var(--border-color)',
        boxShadow: 'var(--shadow-card)',
        marginBottom: '1.5rem',
        textAlign: 'center',
      }}>
        {section.title && <h2 style={{
          fontSize: '1.25rem',
          fontWeight: 600,
          color: 'var(--text-primary)',
          marginBottom: '0.75rem',
        }}>{section.title}</h2>}
        <div>
          <span style={{ fontSize: '3rem', display: 'block', marginBottom: '0.5rem' }}>🎉</span>
          <p style={{ color: 'var(--text-secondary)', fontSize: '1.1rem' }}>All cards mastered!</p>
        </div>
      </div>
    );
  }

  if (totalCards === 0) {
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
        <p style={{ color: 'var(--text-muted)' }}>No cards to review.</p>
      </div>
    );
  }

  const currentCardData = cards[currentCard];

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
        <div
          style={{
            width: `${(masteredCount / section.cards.length) * 100}%`,
            height: '100%',
            background: 'linear-gradient(90deg, var(--accent), var(--accent-hover))',
            borderRadius: '4px',
            transition: 'var(--transition-normal)',
          }}
        />
      </div>
      <div style={{
        fontSize: '0.875rem',
        color: 'var(--text-muted)',
        marginBottom: '1rem',
      }}>
        {masteredCount} / {section.cards.length} mastered
      </div>

      {/* Card */}
      <div style={{
        perspective: '1000px',
        marginBottom: '1rem',
      }}>
        <div
          onClick={handleFlip}
          style={{
            position: 'relative',
            width: '100%',
            minHeight: '270px',
            cursor: 'pointer',
            transformStyle: 'preserve-3d',
            transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
            transition: 'transform 0.6s ease',
          }}
        >
          <div style={{
            position: 'absolute',
            inset: 0,
            backfaceVisibility: 'hidden',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '2rem',
            backgroundColor: 'var(--bg-secondary)',
            borderRadius: '12px',
            border: '2px solid var(--border-color)',
            boxShadow: 'var(--shadow-md)',
            color: 'var(--text-primary)',
            fontSize: '1.1rem',
            lineHeight: 1.6,
            textAlign: 'center',
            overflowY: 'auto',
          }}>
            <div dangerouslySetInnerHTML={{ __html: renderMarkdown(currentCardData.front) }} />
          </div>
          <div style={{
            position: 'absolute',
            inset: 0,
            backfaceVisibility: 'hidden',
            transform: 'rotateY(180deg)',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'flex-start',
            padding: '2rem',
            backgroundColor: 'var(--accent-light)',
            borderRadius: '12px',
            border: '2px solid var(--accent)',
            boxShadow: 'var(--shadow-md)',
            color: 'var(--text-primary)',
            fontSize: '1.1rem',
            lineHeight: 1.6,
            textAlign: 'left',
            overflowY: 'auto',
          }}>
            <div dangerouslySetInnerHTML={{ __html: renderMarkdown(currentCardData.back) }} />
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        gap: '1rem',
        marginBottom: '0.75rem',
      }}>
        <button
          onClick={handlePrev}
          disabled={currentCard <= 0 || isAnimating}
          data-nav-prev="flashcards"
          className="btn-base"
          style={{
            padding: '0.5rem 1rem',
            border: '1px solid var(--border-color)',
            borderRadius: '6px',
            backgroundColor: 'var(--bg-secondary)',
            color: currentCard <= 0 || isAnimating ? 'var(--text-muted)' : 'var(--text-secondary)',
            cursor: currentCard <= 0 || isAnimating ? 'not-allowed' : 'pointer',
            fontWeight: 500,
            fontSize: '0.875rem',
            transition: 'var(--transition-fast)',
          }}
        >
          ◀ Prev
        </button>
        <span style={{
          fontSize: '0.875rem',
          color: 'var(--text-muted)',
          fontWeight: 500,
        }}>
          {currentCard + 1} / {totalCards}
        </span>
        <button
          onClick={handleNext}
          disabled={currentCard >= totalCards - 1 || isAnimating}
          data-nav-next="flashcards"
          className="btn-base"
          style={{
            padding: '0.5rem 1rem',
            border: '1px solid var(--border-color)',
            borderRadius: '6px',
            backgroundColor: 'var(--bg-secondary)',
            color: currentCard >= totalCards - 1 || isAnimating ? 'var(--text-muted)' : 'var(--text-secondary)',
            cursor: currentCard >= totalCards - 1 || isAnimating ? 'not-allowed' : 'pointer',
            fontWeight: 500,
            fontSize: '0.875rem',
            transition: 'var(--transition-fast)',
          }}
        >
          Next ▶
        </button>
      </div>




    </div>
  );
}
