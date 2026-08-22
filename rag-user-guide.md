# RAG System — How to Set Up & Use

A simple guide to the RAG (Retrieval-Augmented Generation) feature: it gives the assistant a **searchable memory of your files**. Drop documents into a folder, and the assistant automatically pulls the most relevant parts into conversation when you ask questions.

---

## 1. Setup

```powershell
# 1. Install dependencies
npm install

# 2. (Recommended) Pre-download the AI models so the first search is fast
npm run setup:rag

# 3. Start the CLI
node main.js
```

- RAG starts automatically in the background — you can chat while the first index builds.
- On first run the index is built from scratch. Later startups load a saved cache instantly.
- Check that everything is ready with `/rag status` (wait until "Ready: yes").

---

## 2. What gets indexed

| Source | Purpose | When updates appear |
|---|---|---|
| `knowledge/` | Permanent reference — handbooks, docs you always want available | Instantly (~1 second) |
| **Your project** — the folder you launch the CLI from | Active working files, source code, notes | Instantly (~1 second) |

**Skills are NOT indexed by RAG** — they are matched by exact name from a built-in list
(`docs/skills/`), so the assistant picks the right `SKILL.md` instantly without a fuzzy search.

There is no separate `workspace/` folder to maintain: the CLI indexes your **live project**
(the working directory at launch), honoring `.gitignore` + `.ragignore`. Edit a file and it is
re-indexed automatically — no manual `/rag reindex` for normal edits.

**Supported file types:** `.md .txt .pdf .docx .epub .rtf .html .htm .xhtml .py .js .ts .go .cpp .json .yaml .yml .log`

> Lockfiles (`package-lock.json`, `yarn.lock`, ...), `node_modules`, `.env`, build output,
> `chat_history/` and `artifacts/` are excluded automatically.

> 💡 **Tip:** long-lived reference → `knowledge/`. Everything else → just work in your project normally.

---

## 3. Using it in conversation — the 3 RAG modes

There are 3 modes, switched with `/rag mode auto|manual|off`:

### 🟢 `auto` (default)
The assistant **decides when to search** your files — you just ask normally.
> Example: *"What's our deployment checklist?"* → answered from `knowledge/`.

### 🟡 `manual`
The assistant **does not search on its own** — only when you tag your message:
- `@rag <question>` → forced search
- `@rag:keyword <question>` → faster exact-word search (no AI model)

### ⚪ `off`
RAG is **fully disabled**; even `@rag` tags are ignored (you'll see a notice).

### Mode × tag reference

| Mode | No tag | With `@rag` tag |
|---|---|---|
| `auto` (default) | Assistant may search (its choice) | Forced search |
| `manual` | No search | Forced search |
| `off` | No search | Ignored + notice |

### Mode facts
- **Default:** `auto` — applied to every new session.
- **Applies immediately:** the change takes effect on your very next message (no restart needed).
- **Per-session:** modes are not saved to disk; a new session always starts in `auto`.
- **Invalid value** (e.g. `/rag mode hybrid`) → error: *"Invalid RAG mode. Use one of: auto | manual | off"*.

---

## 4. Commands

| Command | What it does |
|---|---|
| `/rag status` | Show index health: ready?, chunk count, last index time, current mode |
| `/rag search <question>` | Search your files directly and print results |
| `/rag search --mode=keyword <question>` | Faster, exact-word search (no AI model needed) |
| `/rag reindex` | Rebuild the whole index from scratch |
| `/rag clean` | Remove stale entries for deleted files |
| `/rag mode auto` / `manual` / `off` | Change how RAG is used in chat |

Short prefixes auto-expand (e.g. `/rag stat` → `/rag status`).

---

## 5. Everyday workflows

**First-time setup:**
```powershell
npm install
npm run setup:rag
node main.js
/rag status        # wait for "Ready: yes"
```

**New document, searchable now:**
1. Drop `policy.pdf` into `knowledge/`
2. Wait ~1 second, then ask about it.

**Editing files in your project:** changes are picked up automatically (~1 second). If something
seems stale, run `/rag reindex` to force a full rebuild.

**Nothing found?**
```powershell
/rag status        # index ready? chunk count > 0?
/rag search "your topic"
/rag reindex       # rebuild if something seems stale
/rag clean         # purge entries for deleted files
```

---

## 6. Tips

- **Keep it organized** — clearly named, folder-structured files give better results.
- **Sensitive files?** Create a `.ragignore` file inside `knowledge/` (or the project root) listing
  patterns to skip, e.g. `secrets/`. Files like `.env`, `node_modules`, `.git`, `chat_history/`,
  `artifacts/`, and lockfiles are already excluded automatically.
- **Sandbox mode** — set the environment variable `RAG_ROOT` to an absolute path to make RAG use that folder instead of the repo (useful for experiments that must not touch your real index).
- **No side effects** — the internal index lives in `.rag/` and never pollutes your `knowledge/` folder.
- **Optional config** — most people never need it, but settings live in `.rag/config.json` (watched folders, model, thresholds, watcher timing). See `RAG_MODEL_MIGRATION.md` and `RAG-requirement.md` in the repo root for deeper reference.

---

## 7. Document extraction & security

The RAG indexer extracts text from documents through a shared extraction layer
(`lib/rag/extractors/`, ported from the [book-to-skill](https://github.com/virgiliojr94/book-to-skill)
project and used by both the background watcher and the `extract_content` tool).

**Format handling:**

| Format | How it is parsed |
|---|---|
| `.md .txt` (+ code/config) | Read directly as UTF-8 (BOM-aware; UTF-16/32 detected) |
| `.pdf` | `pdfjs` text layer + layout reconstruction, then boilerplate cleanup — repeated running headers/footers and edge page numbers are stripped, and words split across a line by a hyphen are joined |
| `.docx` | `mammoth` first, falling back to a built-in XML parser; both paths run an XXE guard that refuses archives containing `DOCTYPE`/`ENTITY` declarations |
| `.epub` | Built-in ZIP reader → OPF package → chapters extracted in **spine (reading) order** |
| `.rtf` | Built-in parser: metadata tables (`\fonttbl`, `\info`, `\pict`, …) dropped, `\uN` escapes decoded |
| `.html/.htm/.xhtml` | `script`/`style`/`head` skipped; block elements become line breaks, table cells are tab-joined |

**Prompt-injection defense:** every indexed file is sanitized **before chunking**.
Invisible Unicode code points that can hide malicious instructions — zero-width
spacers, bidirectional formatting controls (the "Trojan Source" class,
CVE-2021-42574), invisible letters, and the Unicode tag block (U+E0000–U+E007F) —
are stripped so what the model retrieves matches what a human sees.

> 💡 To index a book: drop the `.epub`/`.pdf`/`.docx`/`.rtf`/`.html` file into
> `knowledge/` and ask about it. The `extract_content` tool supports the same
> formats for one-off reads.
