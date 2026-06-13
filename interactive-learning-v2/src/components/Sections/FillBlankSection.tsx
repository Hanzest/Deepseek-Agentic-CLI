import React, { useState, useCallback } from 'react';
import type { FillBlankSection as FillBlankSectionType } from '../../types/schema';
import { renderMarkdown } from '../../utils/renderContent';

interface FillBlankSectionProps {
  section: FillBlankSectionType;
}

export default function FillBlankSection({ section }: FillBlankSectionProps) {
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [hints, setHints] = useState<Record<number, boolean>>({});

  const instantFeedback = section.instantFeedback ?? false;

  const handleChange = useCallback(
    (index: number, value: string) => {
      if (submitted && !instantFeedback) return;
      setAnswers((prev) => ({ ...prev, [index]: value }));
      if (instantFeedback) {
        setSubmitted(false);
      }
    },
    [submitted, instantFeedback]
  );

  const handleCheck = useCallback(() => {
    setSubmitted(true);
  }, []);

  const handleReset = useCallback(() => {
    setAnswers({});
    setSubmitted(false);
    setHints({});
  }, []);

  const toggleHint = useCallback((index: number) => {
    setHints((prev) => ({ ...prev, [index]: !prev[index] }));
  }, []);

  const correctCount = submitted
    ? section.sentences.filter((s, i) => answers[i]?.trim().toLowerCase() === s.answer.trim().toLowerCase()).length
    : 0;

  const renderSentence = (text: string, index: number) => {
    const isCorrect =
      submitted &&
      answers[index]?.trim().toLowerCase() === section.sentences[index].answer.trim().toLowerCase();
    const isWrong = submitted && answers[index] !== undefined && !isCorrect;

    const parts = text.split('___');
    return (
      <span key={index}>
        {parts.map((part, pi) => (
          <React.Fragment key={pi}>
            {part}
            {pi < parts.length - 1 && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', margin: '0 0.125rem' }}>
                <input
                  type="text"
                  style={{
                    padding: '0.25rem 0.5rem',
                    border: `2px solid ${isCorrect ? 'var(--success)' : isWrong ? 'var(--error)' : 'var(--border-color)'}`,
                    borderRadius: '4px',
                    backgroundColor: 'var(--bg-primary)',
                    color: 'var(--text-primary)',
                    fontSize: '0.875rem',
                    outline: 'none',
                  }}
                  value={answers[index] || ''}
                  onChange={(e) => handleChange(index, e.target.value)}
                  disabled={submitted && !instantFeedback}
                  placeholder="..."
                />
                <button
                  onClick={() => toggleHint(index)}
                  title="Hint"
                  style={{
                    padding: '0.125rem 0.25rem',
                    border: 'none',
                    backgroundColor: 'transparent',
                    cursor: 'pointer',
                    fontSize: '1rem',
                  }}
                >
                  💡
                </button>
                {hints[index] && (
                  <span style={{
                    fontSize: '0.8rem',
                    color: 'var(--text-muted)',
                    fontStyle: 'italic',
                  }}>
                    Hint: starts with "{section.sentences[index].answer[0]}"
                  </span>
                )}
              </span>
            )}
          </React.Fragment>
        ))}
      </span>
    );
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
          Score: {correctCount} / {section.sentences.length}
        </div>
      )}

      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem',
      }}>
        {section.sentences.map((sentence, i) => (
          <div key={i} style={{
            padding: '0.75rem',
            backgroundColor: 'var(--bg-secondary)',
            borderRadius: '6px',
            lineHeight: 2,
            color: 'var(--text-primary)',
          }}>
            {renderSentence(sentence.text, i)}
          </div>
        ))}
      </div>

      <div style={{
        display: 'flex',
        gap: '0.5rem',
        marginTop: '1rem',
      }}>
        <button
          onClick={handleCheck}
          disabled={
            submitted ||
            Object.keys(answers).length < section.sentences.length
          }
          className="btn-base"
          style={{
            padding: '0.5rem 1.25rem',
            border: 'none',
            borderRadius: '6px',
            backgroundColor: (submitted || Object.keys(answers).length < section.sentences.length) ? 'var(--bg-tertiary)' : 'var(--accent)',
            color: (submitted || Object.keys(answers).length < section.sentences.length) ? 'var(--text-muted)' : '#fff',
            cursor: (submitted || Object.keys(answers).length < section.sentences.length) ? 'not-allowed' : 'pointer',
            fontWeight: 600,
            fontSize: '0.875rem',
            transition: 'var(--transition-fast)',
          }}
        >
          Check Answers
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
      </div>
    </div>
  );
}
