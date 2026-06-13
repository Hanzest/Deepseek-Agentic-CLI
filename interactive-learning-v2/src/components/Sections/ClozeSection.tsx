import React, { useState, useCallback } from 'react';
import type { ClozeSection as ClozeSectionType } from '../../types/schema';
import { renderMarkdown } from '../../utils/renderContent';

interface ClozeSectionProps {
  section: ClozeSectionType;
}

export default function ClozeSection({ section }: ClozeSectionProps) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [hints, setHints] = useState<Record<string, boolean>>({});
  const [submitted, setSubmitted] = useState(false);

  const handleAnswerChange = useCallback(
    (blankId: string, value: string) => {
      if (submitted) return;
      setAnswers((prev) => ({ ...prev, [blankId]: value }));
    },
    [submitted]
  );

  const handleSubmit = useCallback(() => {
    setSubmitted(true);
  }, []);

  const handleReset = useCallback(() => {
    setAnswers({});
    setSubmitted(false);
    setHints({});
  }, []);

  const toggleHint = useCallback((blankId: string) => {
    setHints((prev) => ({ ...prev, [blankId]: !prev[blankId] }));
  }, []);

  const speak = (text: string) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.9;
      window.speechSynthesis.speak(utterance);
    }
  };

  const checkBlank = (blank: typeof section.blanks[0]) => {
    if (!submitted) return null;
    const userAnswer = answers[blank.id]?.trim().toLowerCase() || '';
    if (blank.correctIndex !== undefined && blank.options) {
      const selectedOptionIndex = blank.options.indexOf(answers[blank.id] || '');
      return selectedOptionIndex === blank.correctIndex;
    }
    if (blank.correctAnswer) {
      return userAnswer === blank.correctAnswer.trim().toLowerCase();
    }
    return null;
  };

  const correctCount = submitted
    ? section.blanks.filter((b) => {
        const result = checkBlank(b);
        return result === true;
      }).length
    : 0;

  // Render passage with blank placeholders replaced by inputs
  const renderPassage = () => {
    let parts = section.text.split(/(\{\{[a-zA-Z0-9_-]+\}\})/g);
    return parts.map((part, i) => {
      const match = part.match(/^\{\{([a-zA-Z0-9_-]+)\}\}$/);
      if (!match) {
        return <span key={i}>{part}</span>;
      }
      const blankId = match[1];
      const blank = section.blanks.find((b) => b.id === blankId);
      if (!blank) {
        return <span key={i}>{part}</span>;
      }

      const isCorrect = checkBlank(blank);
      const isWrong = submitted && isCorrect === false;

      const inputBaseStyle: React.CSSProperties = {
        padding: '0.25rem 0.5rem',
        border: '2px solid var(--border-color)',
        borderRadius: '4px',
        backgroundColor: 'var(--bg-primary)',
        color: 'var(--text-primary)',
        fontSize: '0.875rem',
        outline: 'none',
      };

      let inputStyle: React.CSSProperties = { ...inputBaseStyle };
      if (isCorrect) {
        inputStyle = { ...inputStyle, borderColor: 'var(--success)', backgroundColor: 'var(--bg-secondary)' };
      }
      if (isWrong) {
        inputStyle = { ...inputStyle, borderColor: 'var(--error)', backgroundColor: 'var(--bg-secondary)' };
      }

      return (
        <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', margin: '0 0.125rem' }}>
          {blank.options ? (
            <select
              style={inputStyle}
              value={answers[blankId] || ''}
              onChange={(e) => handleAnswerChange(blankId, e.target.value)}
              disabled={submitted}
            >
              <option value="">...</option>
              {blank.options.map((opt, oi) => (
                <option key={oi} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              style={inputStyle}
              value={answers[blankId] || ''}
              onChange={(e) => handleAnswerChange(blankId, e.target.value)}
              disabled={submitted}
              placeholder="..."
              size={12}
            />
          )}
          <button
            onClick={() => toggleHint(blankId)}
            title="Show hint"
            aria-label="Show hint"
            style={{
              padding: '0.125rem 0.375rem',
              border: '1px solid var(--warning-border)',
              borderRadius: '4px',
              backgroundColor: 'var(--warning-bg)',
              color: 'var(--warning-text)',
              cursor: 'pointer',
              fontSize: '0.7rem',
              fontWeight: 700,
              lineHeight: 1.2,
              transition: 'var(--transition-fast)',
            }}
          >
            ?
          </button>
          {hints[blankId] && blank.hint && (
            <span style={{
              fontSize: '0.8rem',
              color: 'var(--warning-text)',
              backgroundColor: 'var(--warning-bg)',
              border: '1px solid var(--warning-border)',
              borderRadius: '4px',
              padding: '0.125rem 0.375rem',
              fontStyle: 'italic',
              maxWidth: '200px',
              lineHeight: 1.4,
            }}>{blank.hint}</span>
          )}
        </span>
      );
    });
  };

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

      {submitted && (
        <div style={{
          padding: '0.625rem 1rem',
          backgroundColor: 'var(--accent-light)',
          borderRadius: '6px',
          marginBottom: '1rem',
          fontWeight: 600,
          color: 'var(--accent)',
          fontSize: '0.9rem',
        }}>
          Score: {correctCount} / {section.blanks.length}
        </div>
      )}

      <div style={{
        padding: '1rem',
        backgroundColor: 'var(--bg-secondary)',
        borderRadius: '6px',
        lineHeight: 2,
        color: 'var(--text-primary)',
        marginBottom: '1rem',
      }}>
        {renderPassage()}
      </div>

      <div style={{
        display: 'flex',
        gap: '0.5rem',
        flexWrap: 'wrap',
      }}>
        <button
          onClick={handleSubmit}
          disabled={submitted}
          className="btn-base"
          style={{
            padding: '0.5rem 1.25rem',
            border: 'none',
            borderRadius: '6px',
            backgroundColor: submitted ? 'var(--bg-tertiary)' : 'var(--accent)',
            color: submitted ? 'var(--text-muted)' : '#fff',
            cursor: submitted ? 'not-allowed' : 'pointer',
            fontWeight: 600,
            fontSize: '0.875rem',
            transition: 'var(--transition-fast)',
          }}
        >
          Submit
        </button>
        <button
          onClick={handleReset}
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
          Reset
        </button>
        <button
          onClick={() => speak(section.text)}
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
      </div>
    </div>
  );
}
