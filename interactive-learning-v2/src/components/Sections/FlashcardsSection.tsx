import React, { useState, useCallback } from 'react';
import type { FlashcardsSection as FlashcardsSectionType, FlashcardProgress } from '../../types/schema';
import { useAppContext } from '../../context/AppContext';
import { renderMarkdown } from '../../utils/renderContent';

interface FlashcardsSectionProps {
  section: FlashcardsSectionType;
  sectionIndex: number;
}

type Difficulty = 'easy' | 'medium' | 'hard' | null;

export default function FlashcardsSection({ section, sectionIndex }: FlashcardsSectionProps) {
  const { state } = useAppContext();
  const [currentCard, setCurrentCard] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [difficulty, setDifficulty] = useState<Record<number, Difficulty>>({});
  const [reviewHardMode, setReviewHardMode] = useState(false);

  const pageMeta = state.pages[state.currentPageIndex]?._meta;
  const flashcardProgress = pageMeta?.flashcardProgress?.[sectionIndex] || {};
  const masteredCards = Object.entries(flashcardProgress)
    .filter(([, v]) => v.known)
    .map(([k]) => Number(k));

  const cards = reviewHardMode
    ? section.cards.filter((_, i) => difficulty[i] === 'hard' || (!difficulty[i] && !masteredCards.includes(i)))
    : section.cards;

  const totalCards = cards.length;
  const masteredCount = masteredCards.length;
  const allMastered = masteredCount === section.cards.length;

  const handlePrev = useCallback(() => {
    setFlipped(false);
    setCurrentCard((p) => (p - 1 + totalCards) % totalCards);
  }, [totalCards]);

  const handleNext = useCallback(() => {
    setFlipped(false);
    setCurrentCard((p) => (p + 1) % totalCards);
  }, [totalCards]);

  const handleFlip = () => setFlipped((p) => !p);

  const handleDifficulty = (d: Difficulty) => {
    const realIndex = cards[currentCard]
      ? section.cards.indexOf(cards[currentCard])
      : -1;
    if (realIndex === -1) return;
    setDifficulty((prev) => ({ ...prev, [realIndex]: d }));
  };

  const speak = (text: string) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.9;
      window.speechSynthesis.speak(utterance);
    }
  };

  if (allMastered && !reviewHardMode) {
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
        {masteredCount > 0 && (
          <button
            onClick={() => { setReviewHardMode(false); setCurrentCard(0); setFlipped(false); }}
            className="btn-base"
            style={{
              marginTop: '0.75rem',
              padding: '0.5rem 1.25rem',
              border: '1px solid var(--border-color)',
              borderRadius: '6px',
              backgroundColor: 'var(--bg-secondary)',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              fontWeight: 500,
              fontSize: '0.875rem',
              transition: 'var(--transition-fast)',
            }}
          >
            Back to all cards
          </button>
        )}
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
            minHeight: '180px',
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
          }}>
            <div dangerouslySetInnerHTML={{ __html: renderMarkdown(currentCardData.front) }} />
          </div>
          <div style={{
            position: 'absolute',
            inset: 0,
            backfaceVisibility: 'hidden',
            transform: 'rotateY(180deg)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '2rem',
            backgroundColor: 'var(--accent-light)',
            borderRadius: '12px',
            border: '2px solid var(--accent)',
            boxShadow: 'var(--shadow-md)',
            color: 'var(--text-primary)',
            fontSize: '1.1rem',
            lineHeight: 1.6,
            textAlign: 'center',
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
          disabled={totalCards <= 1}
          className="btn-base"
          style={{
            padding: '0.5rem 1rem',
            border: '1px solid var(--border-color)',
            borderRadius: '6px',
            backgroundColor: 'var(--bg-secondary)',
            color: totalCards <= 1 ? 'var(--text-muted)' : 'var(--text-secondary)',
            cursor: totalCards <= 1 ? 'not-allowed' : 'pointer',
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
          disabled={totalCards <= 1}
          className="btn-base"
          style={{
            padding: '0.5rem 1rem',
            border: '1px solid var(--border-color)',
            borderRadius: '6px',
            backgroundColor: 'var(--bg-secondary)',
            color: totalCards <= 1 ? 'var(--text-muted)' : 'var(--text-secondary)',
            cursor: totalCards <= 1 ? 'not-allowed' : 'pointer',
            fontWeight: 500,
            fontSize: '0.875rem',
            transition: 'var(--transition-fast)',
          }}
        >
          Next ▶
        </button>
      </div>

      {/* Difficulty Buttons */}
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        gap: '0.5rem',
        marginBottom: '0.75rem',
      }}>
        <button
          onClick={() => handleDifficulty('easy')}
          title="Easy"
          className="btn-base"
          style={{
            padding: '0.4rem 0.8rem',
            border: '1px solid var(--success)',
            borderRadius: '6px',
            backgroundColor: 'transparent',
            color: 'var(--success)',
            cursor: 'pointer',
            fontWeight: 500,
            fontSize: '0.8rem',
            transition: 'var(--transition-fast)',
          }}
        >
          ✓ Easy
        </button>
        <button
          onClick={() => handleDifficulty('medium')}
          title="Medium"
          className="btn-base"
          style={{
            padding: '0.4rem 0.8rem',
            border: '1px solid var(--warning)',
            borderRadius: '6px',
            backgroundColor: 'transparent',
            color: 'var(--warning)',
            cursor: 'pointer',
            fontWeight: 500,
            fontSize: '0.8rem',
            transition: 'var(--transition-fast)',
          }}
        >
          ~ Medium
        </button>
        <button
          onClick={() => handleDifficulty('hard')}
          title="Hard"
          className="btn-base"
          style={{
            padding: '0.4rem 0.8rem',
            border: '1px solid var(--error)',
            borderRadius: '6px',
            backgroundColor: 'transparent',
            color: 'var(--error)',
            cursor: 'pointer',
            fontWeight: 500,
            fontSize: '0.8rem',
            transition: 'var(--transition-fast)',
          }}
        >
          ✗ Hard
        </button>
      </div>

      {/* TTS Button */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
        <button
          onClick={() => speak(currentCardData.front + '. ' + currentCardData.back)}
          className="btn-base"
          style={{
            padding: '0.5rem 1.25rem',
            border: '1px solid var(--border-color)',
            borderRadius: '6px',
            backgroundColor: 'var(--bg-secondary)',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            fontWeight: 500,
            fontSize: '0.875rem',
            transition: 'var(--transition-fast)',
          }}
        >
          🔊 Read Aloud
        </button>

        {/* Review Hard Cards Toggle */}
        <button
          onClick={() => { setReviewHardMode(!reviewHardMode); setCurrentCard(0); setFlipped(false); }}
          className="btn-base"
          style={{
            padding: '0.5rem 1.25rem',
            border: '1px solid var(--border-color)',
            borderRadius: '6px',
            backgroundColor: 'var(--bg-secondary)',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            fontWeight: 500,
            fontSize: '0.875rem',
            transition: 'var(--transition-fast)',
          }}
        >
          {reviewHardMode ? 'Show All Cards' : 'Review Hard Cards'}
        </button>
      </div>
    </div>
  );
}
