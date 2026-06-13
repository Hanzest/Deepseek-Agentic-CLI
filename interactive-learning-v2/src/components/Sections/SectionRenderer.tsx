import React from 'react';
import type { Section } from '../../types/schema';
import { useAppContext } from '../../context/AppContext';
import TextSection from './TextSection';
import TabsSection from './TabsSection';
import AccordionSection from './AccordionSection';
import TimelineSection from './TimelineSection';
import FlashcardsSection from './FlashcardsSection';
import QuizSection from './QuizSection';
import FillBlankSection from './FillBlankSection';
import MatchingSection from './MatchingSection';
import SortingSection from './SortingSection';
import ChecklistSection from './ChecklistSection';
import ClozeSection from './ClozeSection';

interface SectionRendererProps {
  section: Section;
  sectionIndex: number;
}

export default function SectionRenderer({ section, sectionIndex }: SectionRendererProps) {
  const { saveNote, getNote, state } = useAppContext();
  const [showNoteEditor, setShowNoteEditor] = React.useState(false);
  const [noteText, setNoteText] = React.useState('');

  const currentPageIndex = state.currentPageIndex;
  const savedNote = getNote(currentPageIndex, sectionIndex);

  React.useEffect(() => {
    setNoteText(savedNote || '');
  }, [savedNote]);

  const handleSaveNote = () => {
    saveNote(currentPageIndex, sectionIndex, noteText);
    setShowNoteEditor(false);
  };

  const renderSection = () => {
    switch (section.type) {
      case 'text':
        return <TextSection section={section} />;
      case 'tabs':
        return <TabsSection section={section} />;
      case 'accordion':
        return <AccordionSection section={section} />;
      case 'timeline':
        return <TimelineSection section={section} />;
      case 'flashcards':
        return <FlashcardsSection section={section} sectionIndex={sectionIndex} />;
      case 'quiz':
        return <QuizSection section={section} sectionIndex={sectionIndex} />;
      case 'fill-blank':
        return <FillBlankSection section={section} />;
      case 'matching':
        return <MatchingSection section={section} />;
      case 'sorting':
        return <SortingSection section={section} />;
      case 'checklist':
        return <ChecklistSection section={section} sectionIndex={sectionIndex} />;
      case 'cloze':
        return <ClozeSection section={section} />;
      default:
        return <div style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>Unknown section type</div>;
    }
  };

  return (
    <div style={{
      position: 'relative',
      marginBottom: '1.5rem',
    }}>
      {renderSection()}

      {/* Sticky Note Button & Editor */}
      <div style={{
        position: 'absolute',
        top: '0.5rem',
        right: '0.5rem',
        zIndex: 10,
      }}>
        <button
          onClick={() => setShowNoteEditor(!showNoteEditor)}
          title={savedNote ? 'Edit note' : 'Add note'}
          style={{
            padding: '0.375rem 0.5rem',
            border: '1px solid var(--border-color)',
            borderRadius: '6px',
            backgroundColor: 'var(--bg-secondary)',
            cursor: 'pointer',
            fontSize: '1rem',
            position: 'relative',
            lineHeight: 1,
            transition: 'var(--transition-fast)',
          }}
        >
          {savedNote ? '📝' : '📌'}
          {savedNote && (
            <span style={{
              position: 'absolute',
              top: '-2px',
              right: '-2px',
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: 'var(--accent)',
            }} />
          )}
        </button>

        {showNoteEditor && (
          <div style={{
            position: 'absolute',
            top: '100%',
            right: 0,
            marginTop: '0.5rem',
            width: '280px',
            backgroundColor: 'var(--bg-primary)',
            border: '1px solid var(--border-color)',
            borderRadius: '8px',
            boxShadow: 'var(--shadow-lg)',
            padding: '1rem',
            zIndex: 20,
          }}>
            <textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="Write your note here..."
              rows={4}
              style={{
                width: '100%',
                padding: '0.5rem',
                border: '1px solid var(--border-color)',
                borderRadius: '4px',
                backgroundColor: 'var(--bg-secondary)',
                color: 'var(--text-primary)',
                fontSize: '0.875rem',
                resize: 'vertical',
                fontFamily: 'inherit',
                marginBottom: '0.5rem',
              }}
            />
            <div style={{
              display: 'flex',
              gap: '0.5rem',
              justifyContent: 'flex-end',
            }}>
              <button
                onClick={handleSaveNote}
                style={{
                  padding: '0.375rem 0.75rem',
                  border: 'none',
                  borderRadius: '4px',
                  backgroundColor: 'var(--accent)',
                  color: '#fff',
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontSize: '0.8rem',
                }}
              >
                Save
              </button>
              <button
                onClick={() => {
                  setShowNoteEditor(false);
                  setNoteText(savedNote || '');
                }}
                style={{
                  padding: '0.375rem 0.75rem',
                  border: '1px solid var(--border-color)',
                  borderRadius: '4px',
                  backgroundColor: 'var(--bg-secondary)',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                  fontWeight: 500,
                  fontSize: '0.8rem',
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
