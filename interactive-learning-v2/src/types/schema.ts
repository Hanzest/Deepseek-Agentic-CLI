/* ==========================================================================
   TypeScript interfaces matching the Interactive Learning JSON Schema
   See: ../SCHEMA.md (v1) for the full schema documentation
   ========================================================================== */

/** Top-level learning page */
export interface LearningPage {
  page?: PageMeta;
  sections?: Section[];
  _meta?: PageMetaData;
}

/** Page metadata */
export interface PageMeta {
  title?: string;
  description?: string;
  tags?: string[];
  icon?: string;
}

/** Internal metadata (not from JSON) */
export interface PageMetaData {
  completed?: boolean;
  notes?: Record<number, string>;
  quizAttempts?: Record<number, QuizAttempt[]>;
  flashcardProgress?: Record<number, Record<number, FlashcardProgress>>;
  checklist?: Record<number, Record<number, boolean>>;
  sourceFile?: string;
}

export interface QuizAttempt {
  attempt: number;
  correct: number;
  total: number;
  answers: Record<number, number> | null;
  timestamp: number;
}

export interface FlashcardProgress {
  known: boolean;
}

/* --------------------------------------------------------------------------
   Section Types — Discriminated Union
   -------------------------------------------------------------------------- */

export type Section =
  | TextSection
  | TabsSection
  | AccordionSection
  | TimelineSection
  | FlashcardsSection
  | QuizSection
  | FillBlankSection
  | MatchingSection
  | SortingSection
  | ChecklistSection
  | ClozeSection;

export type SectionType =
  | 'text'
  | 'tabs'
  | 'accordion'
  | 'timeline'
  | 'flashcards'
  | 'quiz'
  | 'fill-blank'
  | 'matching'
  | 'sorting'
  | 'checklist'
  | 'cloze';

export interface SectionBase {
  type: SectionType;
  title: string;
  _showNote?: boolean;
}

/* 1. Text */
export interface TextSection extends SectionBase {
  type: 'text';
  content: string;
}

/* 2. Tabs */
export interface TabsSection extends SectionBase {
  type: 'tabs';
  tabs: TabItem[];
}

export interface TabItem {
  label: string;
  content: string;
}

/* 3. Accordion */
export interface AccordionSection extends SectionBase {
  type: 'accordion';
  items: AccordionItem[];
  accordionBehavior?: 'exclusive' | 'multiple';
}

export interface AccordionItem {
  heading: string;
  content: string;
}

/* 4. Timeline */
export interface TimelineSection extends SectionBase {
  type: 'timeline';
  items: TimelineItem[];
  layout?: 'vertical' | 'horizontal';
}

export interface TimelineItem {
  date: string;
  title: string;
  description: string;
}

/* 5. Flashcards */
export interface FlashcardsSection extends SectionBase {
  type: 'flashcards';
  cards: Flashcard[];
}

export interface Flashcard {
  front: string;
  back: string;
}

/* 6. Quiz */
export interface QuizSection extends SectionBase {
  type: 'quiz';
  questions: QuizQuestion[];
}

export interface QuizQuestion {
  question: string;
  options: string[];
  correctIndex?: number;
  explanation?: string;
  optionExplanations?: string[];
}

/* 7. Fill-in-the-Blank */
export interface FillBlankSection extends SectionBase {
  type: 'fill-blank';
  sentences: FillBlankSentence[];
  instantFeedback?: boolean;
}

export interface FillBlankSentence {
  text: string;
  answer: string;
}

/* 8. Matching */
export interface MatchingSection extends SectionBase {
  type: 'matching';
  pairs: MatchPair[];
}

export interface MatchPair {
  left: string;
  right: string;
}

/* 9. Sorting */
export interface SortingSection extends SectionBase {
  type: 'sorting';
  items: SortItem[];
}

export interface SortItem {
  text: string;
  correctOrder: number;
}

/* 10. Checklist */
export interface ChecklistSection extends SectionBase {
  type: 'checklist';
  items: ChecklistItem[];
}

export interface ChecklistItem {
  text: string;
  optional?: boolean;
}

/* 11. Cloze */
export interface ClozeSection extends SectionBase {
  type: 'cloze';
  text: string;
  blanks: ClozeBlank[];
}

export interface ClozeBlank {
  id: string;
  options?: string[];
  correctIndex?: number;
  correctAnswer?: string;
  hint?: string;
}

/* --------------------------------------------------------------------------
   Utility types
   -------------------------------------------------------------------------- */

export type ThemeMode = 'light' | 'dark';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id: number;
  message: string;
  type: ToastType;
  duration: number;
  undo?: (() => void) | null;
}
