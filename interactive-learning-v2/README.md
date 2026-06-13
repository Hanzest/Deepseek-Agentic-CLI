# 📚 Interactive Learning v2 — React Edition

A fully client-side, single-page learning application that renders educational content from uploaded JSON files. Built with **React 18** + **TypeScript** + **Vite** — component-based, statically built, no server required.

## Quick Start

```bash
cd interactive-learning-v2
npm install
npm run dev       # Development server (HMR)
npm run build     # Production build → dist/
npm run preview   # Preview the production build
```

Open `dist/index.html` in any browser, or run `npm run dev` and navigate to the provided URL.

## Features

### 11 Interactive Section Types

| Component | Type | Description |
|---|---|---|
| 📝 Text | `text` | Rich content with **bold**, *italic*, `code`, and links |
| 📑 Tabs | `tabs` | Clickable tab navigation for comparing concepts |
| 🪗 Accordion | `accordion` | Expand/collapse progressive disclosure |
| 📅 Timeline | `timeline` | Vertical/horizontal chronological display |
| 🃏 Flashcards | `flashcards` | 3D flip animation with difficulty tracking |
| 📊 Quiz | `quiz` | Multiple choice with instant feedback + score tracking |
| ✍️ Fill-in-Blank | `fill-blank` | Typed input with auto-check and hints |
| 🔗 Matching | `matching` | Click-to-link pairs with SVG connection lines |
| 🔄 Sorting | `sorting` | Drag-to-reorder items into correct sequence |
| ✅ Checklist | `checklist` | Interactive checklist with progress |
| 📝 Cloze | `cloze` | Fill-in-text passage with dropdown/text inputs |

### UX Features

- 🔍 **Real-time search** — filter pages by title, description, and tags
- 🌓 **Dark mode** — toggle with button, persisted in localStorage
- ⌨️ **Keyboard shortcuts** — `← →` navigate, `?` show shortcuts, `/` focus search
- 📊 **Progress dashboard** — stats grid + Chart.js doughnut chart
- 🍅 **Pomodoro timer** — focus/break timer with audio notification
- 🗂️ **Drag-reorder sidebar** — reorder pages by dragging
- 🖱️ **Right-click context menu** — quick actions on pages
- 📱 **Responsive** — works at 320px–1920px, touch-friendly
- ♿ **Accessible** — keyboard navigation, ARIA labels, `prefers-reduced-motion`
- 💾 **Session persistence** — all progress saved to localStorage
- ↩️ **Toast notifications** — undo support for destructive actions

## Project Structure

```
src/
├── main.tsx                    # Entry point
├── App.tsx                     # Root component
├── types/
│   ├── schema.ts               # JSON schema TypeScript interfaces
│   └── state.ts                # App state + action types
├── context/
│   ├── AppContext.tsx           # React Context provider + hook
│   └── appReducer.ts           # Reducer with all action handlers
├── hooks/
│   ├── useLocalStorage.ts      # localStorage persistence hook
│   ├── useKeyboardShortcuts.ts # Global keyboard handler
│   ├── useSwipeNavigation.ts   # Touch swipe gesture detection
│   ├── useContentHash.ts       # Content fingerprinting
│   └── useTimer.ts             # Pomodoro timer logic
├── utils/
│   ├── renderContent.ts        # Markdown → HTML + helpers
│   ├── storage.ts              # localStorage wrapper
│   ├── contentHash.ts          # Fingerprinting utility
│   ├── schemaValidator.ts      # JSON validation
│   └── shuffle.ts              # Fisher-Yates shuffle
├── styles/
│   ├── global.css              # Base styles, animations
│   └── variables.css           # Design tokens (light/dark)
└── components/
    ├── Layout/     → Header, Sidebar, Footer
    ├── Sections/   → 11 section components + SectionRenderer
    ├── Overlays/   → Dashboard, Keyboard shortcuts
    ├── UI/         → Search, Toast, Timer, etc.
    └── Pages/      → Welcome, Page content
```

## Tech Stack

- **React 18** — UI library
- **TypeScript** — Type safety
- **Vite 6** — Build tool & dev server
- **CSS Modules** — Scoped component styles
- **Chart.js** — Dashboard doughnut chart
- **SortableJS** — Drag-and-drop reordering
- **Context + useReducer** — State management

## JSON Schema

Compatible with the v1 JSON schema. See `../SCHEMA.md` for full documentation.

Minimal example:

```json
{
  "page": { "title": "My Page" },
  "sections": [
    { "type": "text", "title": "Intro", "content": "Hello **world**!" }
  ]
}
```
