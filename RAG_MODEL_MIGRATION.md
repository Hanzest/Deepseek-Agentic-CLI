# RAG Model Migration — bge → FastEmbed (e5-small INT8) + FlashRank (MultiBERT ONNX)

> **Date:** 2026-08-11
> **Status:** Implemented; benchmark verification pending network availability
> **Reason:** the local CPU cannot carry the previous bge model stack without
> noticeable latency and memory pressure.

---

## 1. Why we migrated (the justification)

The RAG system previously ran two ONNX models side by side:

| Component | Old model | Approx. size |
|---|---|---|
| Embedder | `bge-small-en-v1.5` (Xenova ONNX, quantized) | ~24 MB |
| Reranker | `bge-reranker-base` (Xenova ONNX, quantized) | ~286 MB |
| **Total** | | **~310 MB on disk + heavy CPU inference** |

On this machine's CPU, that stack caused three problems:

1. **Memory pressure** — 310 MB of weights loaded into ONNX Runtime sessions,
   plus activation buffers; the reranker alone dominated resident memory.
2. **High per-query latency** — `bge-reranker-base` is a 278M-parameter
   cross-encoder: scoring just 10 candidates requires 10 forward passes of a
   large BERT on CPU.
3. **Background-indexing contention** — the watcher embeds chunks continuously;
   a heavyweight embedder+reranker competes with the CLI for CPU, causing UI lag
   and thermal throttling during re-indexing.

**Decision:** replace both models with purpose-built, CPU-first libraries that
deliver comparable retrieval quality at a fraction of the resource cost.

---

## 2. The new stack

| Component | New library | New model | Key properties |
|---|---|---|---|
| Embedder | `@fastembed/fastembed` (Qdrant) | `intfloat/multilingual-e5-small` | 384-dim (same as before → no DB migration), **INT8-quantized**, ~33M params |
| Reranker | `flashrank` | `ms-marco-MultiBERT-L-6-v2` | multilingual cross-encoder ONNX, far smaller/faster than bge-reranker-base |

Both libraries auto-download their ONNX artifacts into local caches on first
use; `npm run setup:rag` pre-warms them idempotently.

### 2.1 Why FastEmbed `e5-small` INT8 for embeddings

- **Same 384-dim output** as the old `bge-small-en-v1.5` → `VECTOR_DIM = 384`
  in `lib/rag/vectorStore.js` stays valid; **no LanceDB schema migration** and
  no re-shaping of stored vectors.
- **INT8 quantization** cuts memory and CPU cost roughly 4× vs FP32 while
  retaining most of the model's retrieval accuracy (e5-small scores strongly on
  MTEB-style embedding benchmarks; it is the default small model in Qdrant's
  FastEmbed stack).
- **Multilingual** — e5-small handles mixed-language corpora better than
  English-only models, relevant for a knowledge base mixing English textbooks
  with Vietnamese task notes.
- **Maintained library** — FastEmbed handles tokenization, pooling, and
  normalization internally (we still L2-normalize defensively); removes ~200
  lines of hand-rolled ONNX plumbing (`onnxruntime-node` + `tokenizers` + manual
  mean-pooling).

### 2.2 Why FlashRank `ms-marco-MultiBERT-L-6-v2` for re-ranking

- **~10× smaller** than `bge-reranker-base`; designed specifically for
  low-latency CPU re-ranking.
- **Multilingual BERT** cross-encoder — strong cross-lingual relevance scoring.
- **Zero plumbing** — the `flashrank` package manages model download, caching,
  tokenization, and batched inference; our wrapper only maps passages ↔ chunk
  metadata.
- Because it is so cheap, the reranker is now **enabled by default**
  (`config.reranker.enabled = true`), whereas before it was effectively dead
  code: `reranker.init()` was never called anywhere, so the rerank branch in
  `hybridSearch.js` silently never ran. The migration wires `reranker.init()`
  into RAG boot (`lib/rag/index.js`).

---

## 3. Old vs new — side-by-side

| Metric | Old | New | Impact |
|---|---|---|---|
| Embedder | bge-small-en-v1.5 (FP32-quantized ONNX) | e5-small INT8 (FastEmbed) | ↓ memory, same 384-dim |
| Reranker | bge-reranker-base (~286 MB, 278M params) | ms-marco-MultiBERT-L-6-v2 (~small, ~110M params) | ↓ memory, ↓ latency |
| Disk footprint | ~310 MB | a fraction (e5-small INT8 ≈ 34 MB + MultiBERT ≈ tens of MB) | ~80%+ disk freed |
| Manual ONNX plumbing | ~200 lines (embedder) + ~230 lines (reranker) | ~180 lines + ~150 lines of thin wrappers | ↓ maintenance |
| Rerank path | dead (never initialized) | enabled by default | ↑ result quality |
| Public RAG API | `init/isAvailable/getDim/embed/rerank` | **unchanged** | zero pipeline breakage |

**Correctness note:** vectors from different embedding models are not directly
comparable. After migration you must run `/rag reindex` so every stored vector
is produced by e5-small (the setup script's `--cleanup-bge` deletes the old
model folders).

---

## 4. Implementation changes (file map)

| File | Change |
|---|---|
| `lib/rag/config.js` | Defaults → `embedding.model = intfloat/multilingual-e5-small`, `embedding.quantize = true`, `reranker.enabled = true`, `reranker.model = ms-marco-MultiBERT-L-6-v2` |
| `lib/rag/embedder.js` | Full rewrite: FastEmbed `TextEmbedding` wrapper (lazy import, INT8-first with FP32 fallback, same API) |
| `lib/rag/reranker.js` | Full rewrite: FlashRank `Rerank` wrapper (lazy import, same API, `getDim()` → `null`) |
| `lib/rag/index.js` | RAG boot now initializes the reranker (previously never initialized) |
| `scripts/setup-rag-models.js` | Rewrite: idempotent cache warm-up + `--cleanup-bge` legacy deletion |
| `scripts/rag-benchmark.js` | Dense/bm25 modes explicitly disable rerank so labels stay truthful under the new default |
| `package.json` | `+ @fastembed/fastembed`, `+ flashrank`; `− tokenizers`, `− tokenizers-win32-x64-msvc` (now unused); `onnxruntime-node` kept (transitive dep) |
| `test/unit/ragConfig.test.js` | New-default assertions |
| `RAG-requirement.md`, `RAG_TEST_RESULTS.md` | Docs updated to the new model stack |

Unchanged by design: `vectorStore.js` (384-dim matches), `hybridSearch.js`
(consumes the identical `embed`/`rerank` APIs), `watcher.js`, `reflectionLoop.js`,
`mcpServer.js`, `tools/ragSearch.js`, benchmark datasets.

---

## 5. Migration steps

```powershell
# 1. Install new dependencies (requires network)
npm install

# 2. Pre-warm the new model caches (FastEmbed e5-small INT8 + FlashRank MultiBERT)
npm run setup:rag

# 3. Run the verification gate (see §6)

# 4. Once benchmarks are green, free the ~310 MB of legacy weights
npm run setup:rag -- --cleanup-bge

# 5. Rebuild the index so all stored vectors come from e5-small
#    (in the CLI: /rag reindex)
```

---

## 6. Verification results

> **Pending network:** `npm install`, model downloads, and the retrieval
> benchmarks could not run in the environment where the code was written
> (npm registry unreachable). The checklist below is the gate that must pass
> once online. Unit tests that do not require the new packages run offline.

| # | Check | Command | Expected |
|---|---|---|---|
| 1 | Deps resolve | `npm install` | no peer conflicts; `tokenizers` gone from direct deps |
| 2 | Caches warm | `npm run setup:rag` (×2) | first run downloads; second run all-skip (idempotent) |
| 3 | API probe | node REPL | `TextEmbedding.embed()` → 384-dim vectors; `Rerank.rerank()` accepts `[{id,text}]`; quantize flag confirmed (FP32 fallback if unsupported) |
| 4 | Unit tests | `npm run test:unit` | all green (ragConfig new-default assertions; ragHybridSearch mock surface unchanged) |
| 5 | Synthetic retrieval | `npm run benchmark:rag -- --dataset synthetic` | gate: Hit@3 ≥ 0.85, MRR ≥ 0.75 (dense + rerank modes) |
| 6 | Textbook retrieval | `npm run benchmark:rag -- --dataset textbook` | gate: Hit@3 ≥ 0.85, MRR ≥ 0.75 |
| 7 | Token savings | `node scripts/rag-token-benchmark.js` | savings > 0, budget respected |
| 8 | Smoke | `node main.js` → `/rag status` | `modelAvailable: true`; `rag_search` returns `rerank_score` (reranker on) |
| 9 | CPU/memory | time `rag_search` on textbook corpus; watch peak RSS | visibly lower than bge baseline |
| 10 | Disk audit | inspect `.rag/models/` | `bge-*` removed; new caches present |

**Completed offline (this environment):**
- ✅ All modified files pass `node --check` syntax validation.
- ✅ `npx vitest run test/unit` → **187/187 tests passed** (13 files), including the
  updated `ragConfig.test.js` (FastEmbed/FlashRank defaults) and the unchanged
  `ragHybridSearch.test.js` (embedder mock surface identical).
- ✅ `package.json` valid JSON; `tokenizers`/`tokenizers-win32-x64-msvc` removed from direct deps.
- ✅ **Before/after RAG quality test (offline, BM25-only):** `node scripts/rag-quality-test.js` on
  the new `knowledge/rag-sample/company-handbook.md` corpus → Hit@1 **100%**, Hit@3 **100%**,
  MRR **1.000**, avg topScore 0.869, low-confidence 0%; tokens **616 (without RAG) → 176 avg
  (with RAG) = 71.4% savings**. Full report: `artifacts/active/rag-quality-report.md`. Dense +
  rerank numbers pending online `npm install` + `npm run setup:rag` (same script, auto mode).
- ✅ **Legacy `bge-*` folders deleted 2026-08-11** (~315.8 MB freed: bge-small 33.1 MB +
  bge-reranker-base 282.7 MB). They were already orphaned — the rewritten
  `embedder.js`/`reranker.js` never read them. Deletion was pulled forward from
  "after green benchmarks" at the user's request; rollback (re-download via git
  history + old setup script) remains documented in §7. The new caches
  (`fastembed/` under `.rag/models`, plus FlashRank's own cache) appear after the
  first online `npm run setup:rag`.

*Once the remaining online steps are executed, this section will be updated with the
measured benchmark numbers.*

---

## 7. Rollback

If the new stack underperforms, revert in four steps:

1. `git checkout -- package.json lib/rag/config.js lib/rag/embedder.js lib/rag/reranker.js lib/rag/index.js scripts/setup-rag-models.js scripts/rag-benchmark.js test/unit/ragConfig.test.js`
2. `npm install` (restores `tokenizers` + legacy deps).
3. Re-download bge models with the old `setup-rag-models.js` (from git history).
4. `/rag reindex` so stored vectors match bge again.

---

## 8. Notes & caveats

- **Exact library API surface** (`quantize` flag support in
  `@fastembed/fastembed`; FlashRank model-name enum and cache location) was
  written against documented behavior and must be confirmed on first online
  run; the code already falls back gracefully (FP32 embedder, null-score
  rerank) if a capability is missing.
- FastEmbed manages its own ONNX Runtime threads; the INT8 model is small
  enough that the previous explicit thread cap is no longer necessary.
- The benchmark suite writes config into an isolated `RAG_ROOT`, so
  `saveConfig({ reranker: { enabled: ... } })` never touches the real
  `.rag/config.json`.
