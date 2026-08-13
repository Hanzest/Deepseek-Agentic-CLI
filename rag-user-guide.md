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

## 2. Where to put your files

| Folder | Purpose | When updates appear |
|---|---|---|
| `knowledge/` | Permanent reference — skills, handbooks, docs you always want available | Instantly (~1 second) |
| `workspace/` | Active working files — notes, drafts, scratch material | On next app start (or run `/rag reindex`) |

**Supported file types:** `.md .txt .pdf .docx .py .js .ts .go .cpp .json .yaml .yml .log`

> 💡 **Tip:** long-lived reference → `knowledge/`. Things you're actively editing → `workspace/`.

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

**Workspace file changed:**
```powershell
/rag reindex       # pick up workspace/ changes immediately
```

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
- **Sensitive files?** Create a `.ragignore` file inside `knowledge/` (or `workspace/`) listing patterns to skip, e.g. `secrets/`. Files like `.env`, `node_modules`, `.git`, `chat_history/`, and `artifacts/` are already excluded automatically.
- **Sandbox mode** — set the environment variable `RAG_ROOT` to an absolute path to make RAG use that folder instead of the repo (useful for experiments that must not touch your real index).
- **No side effects** — the internal index lives in `.rag/` and never pollutes your `knowledge/` folder.
- **Optional config** — most people never need it, but settings live in `.rag/config.json` (watched folders, model, thresholds, watcher timing). See `RAG_MODEL_MIGRATION.md` and `RAG-requirement.md` in the repo root for deeper reference.
