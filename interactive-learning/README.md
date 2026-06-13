# 📚 Interactive Learning SPA

A fully client-side, single-page learning application that renders educational content from uploaded JSON files. Built with **Alpine.js** + **Tailwind CSS** — zero build step, no server required.

## Quick Start

1. Open `index.html` in any modern browser
2. Drag & drop a JSON learning page file onto the sidebar (or click to browse)
3. Interact with your content — flip flashcards, take quizzes, fill in blanks!

## Features

### 7 Interactive Components`

| Component | Type | What it does |
|---|---|---|
| 📝 Text | `text` | Rich content with **bold**, *italic*, `code`, and links |
| 📑 Tabs | `tabs` | Clickable tab navigation for comparing concepts |
| 🪗 Accordion | `accordion` | Expand/collapse progressive disclosure |
| 📅 Timeline | `timeline` | Vertical chronological display with dates |```
| 🃏 Flashcards | `flashcards` | 3D flip animation with Know/Review tracking |
| 📊 Quiz | `quiz` | Multiple choice with instant feedback + score |
| ✍️ Fill-in-Blank | `fill-blank` | Typed input with auto-check and hints |

### UX Features

- 🔍 **Real-time search** — filter pages by title, description, and tags with clear button
- 🌓 **Dark mode** — toggle with button, respects `prefers-color-scheme`, persisted in localStorage
- ⌨️ **Keyboard shortcuts** — `← →` navigate, `?` show shortcuts, `/` focus search, `R` rename, `Esc` close
- 📊 **Progress tracking** — viewed pages, quiz scores, flashcard progress, completion marks (session-based)
- 🧪 **Schema validation** — field-level error messages on invalid JSON uploads (now working in browser)
- 🏷️ **File name as default title** — page titles auto-fill from uploaded JSON filename
- ↩️ **Undo delete** — toast with 5-second undo window replaces blocking confirmation dialog
- ✏️ **Inline rename** — press `R` or click the edit icon to rename any page
- 🔄 **Drag-reorder sidebar** — reorder pages by dragging the grip handle
- 🖱️ **Right-click context menu** — quick actions: open, rename, mark complete, delete
- 🔐 **Content deduplication** — prevents uploading the same page twice via content fingerprint
- 📱 **Responsive** — works at 320px–1920px, touch-friendly ≥44px targets, sidebar auto-closes on mobile
- ♿ **Accessible** — keyboard navigation, `prefers-reduced-motion`, focus indicators

## JSON Schema

Each JSON file = one learning page. See [`SCHEMA.md`](./SCHEMA.md) for full schema documentation.

Minimal example:

```json
{
  "page": { "title": "My Page" },
  "sections": [
    { "type": "text", "title": "Intro", "content": "Hello **world**!" }
  ]
}
```

## File Structure

```
interactive-learning/
├── index.html                    # Main SPA entry point
├── SCHEMA.md                     # JSON schema documentation
├── README.md                     # This file
├── css/
│   └── style.css                 # Custom styles, animations, dark mode
├── js/
│   ├── schema-validator.cjs      # JSON Schema validator (pure JS, also Node.js)
│   ├── storage.js                # localStorage wrapper
│   ├── alpine-init.js            # Alpine.js stores (app state, file upload, navigation)
│   └── component-renderer.js     # Alpine data components for all 7 section types
└── test/
    ├── schema-validator.test.cjs # 16 tests for schema validation
    └── fixtures/
        ├── valid-full.json       # Full valid page (all section types)
        ├── valid-minimal.json    # Minimal valid page
        ├── invalid-missing-title.json
        ├── invalid-bad-section-type.json
        └── invalid-missing-section-content.json
```

## Running Tests

```bash
cd interactive-learning/test
node schema-validator.test.cjs
```

All 16 tests should pass:
- 2 valid fixtures → **valid: true, 0 errors**
- 3 invalid fixtures → **valid: false, descriptive field-path errors**
- 8 edge cases → **null, empty arrays, missing fields, bad types**
- 3 optionExplanations tests → **array validation, length mismatch, type checking**

## Tech Stack

- **Alpine.js 3** (via CDN) — declarative reactivity
- **@alpinejs/collapse** (via CDN) — accordion animations
- **Tailwind CSS** (via Play CDN) — utility-first styling
- **Vanilla JavaScript** — schema validation, localStorage, custom components
- **No build step** — open `index.html` directly in any browser

## Browser Support

Modern browsers (Chrome, Firefox, Safari, Edge). Requires ES2015+ support.
