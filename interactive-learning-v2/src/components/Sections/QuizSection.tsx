import React, { useState, useCallback } from 'react';
import type { QuizSection as QuizSectionType, QuizAttempt } from '../../types/schema';
import { useAppContext } from '../../context/AppContext';
import { renderMarkdown } from '../../utils/renderContent';

interface QuizSectionProps {
  section: QuizSectionType;
  sectionIndex: number;
}

export default function QuizSection({ section, sectionIndex }: QuizSectionProps) {
  const { state, recordQuizScore } = useAppContext();
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [submitted, setSubmitted] = useState(false);
  const [reviewMistakes, setReviewMistakes] = useState(false);
  const [attempt, setAttempt] = useState(1);

  const pageMeta = state.pages[state.currentPageIndex]?._meta;
  const quizAttempts: QuizAttempt[] = pageMeta?.quizAttempts?.[sectionIndex] || [];
  const prevAttempts = quizAttempts.length;

  const questions = reviewMistakes
    ? section.questions.filter((_, i) => {
        const ans = answers[i];
        return ans === undefined || ans !== section.questions[i].correctIndex;
      })
    : section.questions;

  const totalQuestions = questions.length;

  const handleSelect = useCallback(
    (questionIndex: number, optionIndex: number) => {
      if (submitted) return;
      const realIndex = reviewMistakes
        ? section.questions.indexOf(questions[questionIndex])
        : questionIndex;
      setAnswers((prev) => ({ ...prev, [realIndex]: optionIndex }));
    },
    [submitted, reviewMistakes, questions, section.questions]
  );

  const handleSubmit = useCallback(() => {
    const answeredAll = section.questions.every((_, i) => answers[i] !== undefined);
    if (!answeredAll) return;
    setSubmitted(true);
    let correct = 0;
    section.questions.forEach((q, i) => {
      if (answers[i] === q.correctIndex) correct++;
    });
    recordQuizScore(state.currentPageIndex, sectionIndex, correct, section.questions.length);
  }, [answers, section.questions, recordQuizScore, state.currentPageIndex, sectionIndex]);

  const handleReset = useCallback(() => {
    setAnswers({});
    setSubmitted(false);
    setReviewMistakes(false);
    setAttempt((p) => p + 1);
    setCurrentQ(0);
  }, []);

  const handleReviewMistakes = useCallback(() => {
    const mistakes = section.questions.filter((_, i) => {
      const ans = answers[i];
      return ans === undefined || ans !== section.questions[i].correctIndex;
    });
    if (mistakes.length === 0) return;
    setReviewMistakes(true);
    setSubmitted(false);
    setCurrentQ(0);
  }, [answers, section.questions]);

  const correctCount = submitted
    ? section.questions.filter((q, i) => answers[i] === q.correctIndex).length
    : 0;
  const mistakeCount = section.questions.filter((_, i) => answers[i] !== section.questions[i].correctIndex).length;
  const progressPercent = submitted
    ? 100
    : (Object.keys(answers).length / section.questions.length) * 100;

  if (questions.length === 0 && reviewMistakes) {
    return (
      <div style={{
        padding: '1.5rem',
        backgroundColor: 'var(--bg-primary)',
        borderRadius: '8px',
        border: '1px solid var(--border-color)',
        marginBottom: '1.5rem',
      }}>
        <p style={{ color: 'var(--success)', fontWeight: 600, fontSize: '1.1rem' }}>No mistakes — great job!</p>
        <button
          onClick={() => { setReviewMistakes(false); setSubmitted(false); setAnswers({}); setCurrentQ(0); }}
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
          Back to All Questions
        </button>
      </div>
    );
  }

  const current = questions[currentQ];
  if (!current) {
    return <div style={{
      padding: '1.5rem',
      backgroundColor: 'var(--bg-primary)',
      borderRadius: '8px',
      border: '1px solid var(--border-color)',
      marginBottom: '1.5rem',
      color: 'var(--text-muted)',
    }}>No questions available.</div>;
  }

  const realIndex = reviewMistakes ? section.questions.indexOf(current) : currentQ;

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

      {/* Score display after submit */}
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
          Score: {correctCount} / {section.questions.length}
          {prevAttempts > 0 && (
            <span style={{ marginLeft: '0.5rem', fontWeight: 400, color: 'var(--text-muted)' }}>
              (Attempts: {prevAttempts})
            </span>
          )}
        </div>
      )}

      {/* Progress bar */}
      <div style={{
        width: '100%',
        height: '6px',
        backgroundColor: 'var(--bg-tertiary)',
        borderRadius: '3px',
        overflow: 'hidden',
        marginBottom: '1rem',
      }}>
        <div style={{
          width: `${progressPercent}%`,
          height: '100%',
          background: 'linear-gradient(90deg, var(--accent), var(--accent-hover))',
          borderRadius: '3px',
          transition: 'var(--transition-normal)',
        }} />
      </div>

      {/* Question Navigator */}
      <div style={{
        display: 'flex',
        gap: '0.375rem',
        flexWrap: 'wrap',
        marginBottom: '1rem',
        justifyContent: 'center',
      }}>
        {section.questions.map((_, qi) => {
          const isActive = qi === realIndex;
          const isAnswered = answers[qi] !== undefined;
          let boxBg = 'var(--bg-tertiary)';
          let boxBorder = 'var(--border-color)';
          
          if (submitted) {
            const qCorrect = answers[qi] === section.questions[qi].correctIndex;
            if (qCorrect) {
              boxBg = 'var(--success)';
              boxBorder = 'var(--success)';
            } else if (isAnswered) {
              boxBg = 'var(--error)';
              boxBorder = 'var(--error)';
            }
          } else if (isAnswered) {
            boxBg = 'var(--accent-light)';
            boxBorder = 'var(--accent)';
          }
          
          return (
            <button
              key={qi}
              onClick={() => {
                if (reviewMistakes) {
                  const idx = questions.indexOf(section.questions[qi]);
                  if (idx !== -1) setCurrentQ(idx);
                } else {
                  setCurrentQ(qi);
                }
              }}
              style={{
                width: '2rem',
                height: '2rem',
                borderRadius: '6px',
                border: `2px solid ${isActive ? 'var(--accent)' : boxBorder}`,
                backgroundColor: boxBg,
                color: (submitted && isAnswered) ? '#fff' : 'var(--text-primary)',
                fontWeight: 600,
                fontSize: '0.8rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'var(--transition-fast)',
              }}
              title={`Go to question ${qi + 1}`}
            >
              {qi + 1}
            </button>
          );
        })}
      </div>

      {/* Question */}
      <div style={{
        padding: '1rem',
        backgroundColor: 'var(--bg-secondary)',
        borderRadius: '8px',
        marginBottom: '1rem',
      }}>
        <div style={{
          fontSize: '0.875rem',
          color: 'var(--text-muted)',
          fontWeight: 500,
          marginBottom: '0.5rem',
        }}>
          Question {currentQ + 1} of {totalQuestions}
        </div>
        <p style={{
          color: 'var(--text-primary)',
          fontWeight: 600,
          fontSize: '1.05rem',
          marginBottom: '1rem',
          lineHeight: 1.5,
        }}>{current.question}</p>

        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem',
        }}>
          {current.options.map((opt, oi) => {
            const isSelected = answers[realIndex] === oi;
            const isCorrectAnswer = submitted && current.correctIndex === oi;
            const isWrongSelection = submitted && isSelected && current.correctIndex !== oi;
            let borderColor = 'var(--border-color)';
            let bgColor = 'transparent';
            if (submitted) {
              if (isCorrectAnswer) { borderColor = 'var(--success)'; bgColor = 'rgba(16, 185, 129, 0.08)'; }
              else if (isWrongSelection) { borderColor = 'var(--error)'; bgColor = 'rgba(239, 68, 68, 0.08)'; }
            } else if (isSelected) {
              borderColor = 'var(--accent)'; bgColor = 'var(--accent-light)';
            }
            return (
              <label
                key={oi}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '0.5rem',
                  padding: '0.625rem 0.75rem',
                  border: `1px solid ${borderColor}`,
                  borderRadius: '6px',
                  backgroundColor: bgColor,
                  cursor: submitted ? 'default' : 'pointer',
                  transition: 'var(--transition-fast)',
                }}
              >
                <input
                  type="radio"
                  name={`quiz-${attempt}-${realIndex}`}
                  value={oi}
                  checked={isSelected}
                  onChange={() => handleSelect(realIndex, oi)}
                  disabled={submitted}
                  style={{
                    marginTop: '0.125rem',
                    accentColor: 'var(--accent)',
                    cursor: submitted ? 'default' : 'pointer',
                  }}
                />
                <span style={{
                  flex: 1,
                  color: 'var(--text-primary)',
                  lineHeight: 1.5,
                }}>{opt}</span>
                {submitted && current.optionExplanations?.[oi] && (
                  <span style={{
                    fontSize: '0.85rem',
                    color: 'var(--text-muted)',
                    fontStyle: 'italic',
                  }}>
                    — {current.optionExplanations[oi]}
                  </span>
                )}
              </label>
            );
          })}
        </div>

        {submitted && current.explanation && (
          <div style={{
            marginTop: '0.75rem',
            padding: '0.625rem',
            backgroundColor: 'var(--bg-tertiary)',
            borderRadius: '6px',
            color: 'var(--text-secondary)',
            fontSize: '0.9rem',
            lineHeight: 1.5,
            borderLeft: '3px solid var(--accent)',
          }}>{current.explanation}</div>
        )}
      </div>

      {/* Navigation + Submit */}
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        gap: '0.75rem',
        marginBottom: '0.75rem',
        alignItems: 'center',
      }}>
        <button
          onClick={() => setCurrentQ((p) => Math.max(0, p - 1))}
          disabled={currentQ === 0}
          className="btn-base"
          style={{
            padding: '0.5rem 1rem',
            border: '1px solid var(--border-color)',
            borderRadius: '6px',
            backgroundColor: 'var(--bg-secondary)',
            color: currentQ === 0 ? 'var(--text-muted)' : 'var(--text-secondary)',
            cursor: currentQ === 0 ? 'not-allowed' : 'pointer',
            fontWeight: 500,
            fontSize: '0.875rem',
            transition: 'var(--transition-fast)',
          }}
        >
          ◀ Prev
        </button>
        {!submitted && (
          <button
            onClick={handleSubmit}
            disabled={Object.keys(answers).length < section.questions.length}
            className="btn-base"
            style={{
              padding: '0.5rem 1.25rem',
              border: 'none',
              borderRadius: '6px',
              backgroundColor: (Object.keys(answers).length < section.questions.length) ? 'var(--bg-tertiary)' : 'var(--accent)',
              color: (Object.keys(answers).length < section.questions.length) ? 'var(--text-muted)' : '#fff',
              cursor: (Object.keys(answers).length < section.questions.length) ? 'not-allowed' : 'pointer',
              fontWeight: 600,
              fontSize: '0.875rem',
              transition: 'var(--transition-fast)',
            }}
          >
            Submit
          </button>
        )}
        <button
          onClick={() => setCurrentQ((p) => Math.min(totalQuestions - 1, p + 1))}
          disabled={currentQ === totalQuestions - 1}
          className="btn-base"
          style={{
            padding: '0.5rem 1rem',
            border: '1px solid var(--border-color)',
            borderRadius: '6px',
            backgroundColor: 'var(--bg-secondary)',
            color: currentQ === totalQuestions - 1 ? 'var(--text-muted)' : 'var(--text-secondary)',
            cursor: currentQ === totalQuestions - 1 ? 'not-allowed' : 'pointer',
            fontWeight: 500,
            fontSize: '0.875rem',
            transition: 'var(--transition-fast)',
          }}
        >
          Next ▶
        </button>
      </div>

      {/* Action buttons (after submit) */}
      <div style={{
        display: 'flex',
        gap: '0.5rem',
        justifyContent: 'center',
      }}>
        {submitted && (
          <>
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
            {mistakeCount > 0 && (
              <button
                onClick={handleReviewMistakes}
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
                Review Mistakes ({mistakeCount})
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
