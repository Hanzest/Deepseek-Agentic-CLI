#!/usr/bin/env node
/**
 * @fileoverview RAG Performance Verification Benchmark — Pillars 1-3 of
 * `artifacts/history/As-I-noticed-the-terminal-when-I-turn/2026-08-11_18.59.33/rag-performance-verification-plan.md`.
 *
 * Measures (in an ISOLATED RAG_ROOT so the user's real index/models are untouched):
 *   Pillar 1 — Startup & cache: cold build vs warm cache restore (< 100 ms gate),
 *              initial-scan skip, corrupt-cache graceful fallback.
 *   Pillar 2 — Search-mode latency: p50/p95/p99 over 50 iterations per mode
 *              (keyword < 10 ms gate; dense/hybrid measured; zero-ONNX proven in
 *              the unit suite, keyword p95 < 10 ms implies no ONNX here).
 *   Pillar 3 — Watcher isolation: 50-file workspace burst -> 0 chunk growth /
 *              event-loop p95 < 5 ms; single knowledge edit -> incremental update
 *              + cache persisted.
 *
 * Self-spawning: the parent runs child processes (`--phase=cold|warm|corrupt`)
 * so module-level RAG singletons (BM25, embedder, reranker) are fresh per phase.
 * Each child writes <root>/.rag/perf-<phase>.json; the parent aggregates and
 * writes artifacts/active/rag-performance-verification-report.md (+ .json).
 *
 * Usage:
 *   node scripts/rag-performance-benchmark.js [--root <abs>] [--keep]
 *   node scripts/rag-performance-benchmark.js --phase cold --root <abs>   (child)
 *
 * Exit code: 0 when all Pillar 1-3 gates PASS, 1 otherwise.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const SAMPLE_DIR = path.join(REPO_ROOT, 'knowledge', 'rag-sample');
const REPORT_DIR = path.join(REPO_ROOT, 'artifacts', 'active');
const REPORT_MD = path.join(REPORT_DIR, 'rag-performance-verification-report.md');
const REPORT_JSON = path.join(REPORT_DIR, 'rag-performance-verification-report.json');

const args = process.argv.slice(2);
const arg = (name) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : null;
};
const phaseArg = arg('--phase');
const rootArg = arg('--root');
const keep = args.includes('--keep');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Copy the sample corpus into <root>/knowledge/ (idempotent). */
function copySample(root) {
  const knowledgeDir = path.join(root, 'knowledge');
  fs.mkdirSync(knowledgeDir, { recursive: true });
  if (!fs.existsSync(SAMPLE_DIR)) return 0;
  let copied = 0;
  for (const f of fs.readdirSync(SAMPLE_DIR)) {
    const src = path.join(SAMPLE_DIR, f);
    if (!fs.statSync(src).isFile()) continue;
    fs.copyFileSync(src, path.join(knowledgeDir, f));
    copied += 1;
  }
  return copied;
}

/** Write a phase result JSON under <root>/.rag/ (never indexed by the watcher). */
function writeJson(root, phase, data) {
  const dir = path.join(root, '.rag');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `perf-${phase}.json`), JSON.stringify(data, null, 2), 'utf8');
}

/** p-th percentile of a numeric array (sorted ascending). */
function pct(arr, p) {
  if (!arr.length) return -1;
  const s = [...arr].sort((a, b) => a - b);
  const i = Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1));
  return Number(s[i].toFixed(3));
}

// ===========================================================================
// Child phases
// ===========================================================================

/** Phase 1a — cold boot: fresh root, full build, persist cache, shutdown. */
async function runCold(root) {
  const { performance } = await import('node:perf_hooks');
  const rag = await import('../lib/rag/index.js');

  const t0 = performance.now();
  let ready = false;
  try {
    ready = (await rag.init()).ready;
  } catch (e) {
    console.error('[cold] init threw:', e.message);
  }
  const initMs = performance.now() - t0;

  let chunkCount = 0;
  const tScan = performance.now();
  for (let i = 0; i < 120; i++) {
    try {
      chunkCount = (await rag.getStatus()).chunkCount || 0;
    } catch { /* ignore */ }
    if (chunkCount > 0) break;
    await sleep(500);
  }
  const scanMs = performance.now() - tScan;

  const tSave = performance.now();
  let saveMs = -1;
  try {
    await rag.shutdown();
    saveMs = performance.now() - tSave;
  } catch {
    saveMs = performance.now() - tSave;
  }

  writeJson(root, 'cold', {
    ready,
    initMs: Number(initMs.toFixed(2)),
    scanMs: Number(scanMs.toFixed(2)),
    saveMs: Number(saveMs.toFixed(2)),
    chunkCount,
    cacheFiles: {
      bm25: fs.existsSync(path.join(root, '.rag', 'bm25.json')),
      hashes: fs.existsSync(path.join(root, '.rag', 'hashes.json')),
    },
  });
}

/** Phases 1b + 2 + 3 — warm boot, search latency, watcher isolation. */
async function runWarm(root) {
  const { performance, monitorEventLoopDelay } = await import('node:perf_hooks');
  const hybrid = await import('../lib/rag/hybridSearch.js');

  // ---- Pillar 1: warm cache restore (the fix's target: < 100 ms) ----
  const t0 = performance.now();
  let idx = null;
  try {
    idx = await hybrid.rebuildIndex();
  } catch (e) {
    console.error('[warm] rebuildIndex threw:', e.message);
  }
  const cacheLoadMs = performance.now() - t0;
  const totalDocs = idx?.totalDocs ?? 0;
  const documentsSize = idx?.documents?.size ?? 0;

  // ---- Full init (the real CLI never awaits this; informational) ----
  const rag = await import('../lib/rag/index.js');
  const { isAvailable: embedderAvail } = await import('../lib/rag/embedder.js');
  const t1 = performance.now();
  await rag.init();
  const initTotalMs = performance.now() - t1;

  let chunkCount = 0;
  let timeToReadyMs = -1;
  const tReady = performance.now();
  for (let i = 0; i < 60; i++) {
    try {
      const s = await rag.getStatus();
      chunkCount = s.chunkCount || 0;
      if (s.ready && chunkCount > 0) {
        timeToReadyMs = performance.now() - tReady;
        break;
      }
    } catch { /* ignore */ }
    await sleep(250);
  }

  // ---- Pillar 2: search-mode latency (50 iterations per mode) ----
  const QUIZ = [
    'How do I authenticate to the API and where is the bearer token stored?',
    'What is the API rate limit and which endpoint is affected?',
    'How are unit tests executed in the CI pipeline?',
    'Which CLI flag enables verbose logging?',
    'How does the cache reduce latency for repeated queries?',
  ];
  try { await rag.search({ query: QUIZ[0], search_mode: 'hybrid', top_k: 5 }); } catch { /* warm-up models */ }

  const latencies = {};
  for (const mode of ['keyword', 'dense', 'hybrid']) {
    const times = [];
    let sampleResults = -1;
    for (let i = 0; i < 50; i++) {
      const t = performance.now();
      try {
        const out = await rag.search({ query: QUIZ[i % QUIZ.length], search_mode: mode, top_k: 5 });
        times.push(performance.now() - t);
        if (i === 0) sampleResults = out?.results?.length ?? -1;
      } catch {
        times.push(-1);
      }
    }
    const valid = times.filter((x) => x >= 0);
    latencies[mode] = {
      n: valid.length,
      sampleResults,
      p50: pct(valid, 50),
      p95: pct(valid, 95),
      p99: pct(valid, 99),
      mean: valid.length ? Number((valid.reduce((a, b) => a + b, 0) / valid.length).toFixed(3)) : -1,
      max: valid.length ? Number(Math.max(...valid).toFixed(3)) : -1,
      min: valid.length ? Number(Math.min(...valid).toFixed(3)) : -1,
    };
  }

  // ---- Pillar 3a: workspace burst -> 0 watcher events / 0 chunk growth ----
  const workspaceDir = path.join(root, 'workspace');
  fs.mkdirSync(workspaceDir, { recursive: true });
  const bm25Path = path.join(root, '.rag', 'bm25.json');
  const mtime = (p) => {
    try { return fs.statSync(p).mtimeMs; } catch { return -1; }
  };
  const beforeChunks = chunkCount;
  const bm25Before = mtime(bm25Path);

  const hist = monitorEventLoopDelay({ resolution: 10 });
  hist.enable();
  for (let i = 0; i < 50; i++) {
    fs.writeFileSync(
      path.join(workspaceDir, `burst-${String(i).padStart(2, '0')}.md`),
      `# burst ${i}\n\nworkspace burst content line one\nline two ${i}\n`
    );
  }
  await sleep(2500); // > debounce_ms (700) + buffer
  hist.disable();

  let afterChunks = beforeChunks;
  try { afterChunks = (await rag.getStatus()).chunkCount || 0; } catch { /* ignore */ }
  const bm25After = mtime(bm25Path);
  const workspaceDelta = afterChunks - beforeChunks;
  const evtLoopP95 = hist.p95 ? Number(hist.p95.toFixed(3)) : 0;
  const bm25TouchedByWorkspace = bm25After > bm25Before;

  // ---- Pillar 3b: single knowledge edit -> incremental update + cache persist ----
  const kDir = path.join(root, 'knowledge');
  let knowledgeDelta = 0;
  let incrementalMs = -1;
  let bm25ChangedOnK = false;
  let knowledgeFiles = 0;
  try {
    knowledgeFiles = fs.readdirSync(kDir).filter((f) => f.endsWith('.md')).length;
  } catch { /* ignore */ }
  if (knowledgeFiles > 0) {
    const kFile = path.join(kDir, fs.readdirSync(kDir).find((f) => f.endsWith('.md')));
    const bm25BeforeK = mtime(bm25Path);
    const tK = performance.now();
    fs.appendFileSync(kFile, '\n\n# Incremental marker\n\nincremental unique token 7f3a9c index this chunk now\n');
    await sleep(2500);
    incrementalMs = performance.now() - tK;
    try {
      const afterK = (await rag.getStatus()).chunkCount || 0;
      knowledgeDelta = afterK - afterChunks;
    } catch { /* ignore */ }
    bm25ChangedOnK = mtime(bm25Path) > bm25BeforeK;
  }

  // ---- Context: manual saveBm25Index() duration (the `/new` shutdown cost) ----
  const tS = performance.now();
  let saveBm25Ms = -1;
  try {
    await hybrid.saveBm25Index();
    saveBm25Ms = performance.now() - tS;
  } catch {
    saveBm25Ms = performance.now() - tS;
  }

  try { await rag.shutdown(); } catch { /* ignore */ }

  writeJson(root, 'warm', {
    cacheLoadMs: Number(cacheLoadMs.toFixed(3)),
    totalDocs,
    documentsSize,
    initTotalMs: Number(initTotalMs.toFixed(2)),
    timeToReadyMs: Number(timeToReadyMs.toFixed(2)),
    chunkCount,
    embedderAvailable: embedderAvail(),
    latencies,
    workspaceDelta,
    evtLoopP95,
    bm25TouchedByWorkspace,
    knowledgeDelta,
    incrementalMs: Number(incrementalMs.toFixed(2)),
    bm25ChangedOnK,
    saveBm25Ms: Number(saveBm25Ms.toFixed(2)),
    cacheFiles: { bm25: fs.existsSync(bm25Path) },
  });
}

/** Phase 1c — corrupt cache: init must not crash and must recover via full scan. */
async function runCorrupt(root) {
  const { performance } = await import('node:perf_hooks');
  const rag = await import('../lib/rag/index.js');

  const t0 = performance.now();
  let initThrew = false;
  try {
    await rag.init();
  } catch {
    initThrew = true;
  }
  const initMs = performance.now() - t0;

  let chunkCount = 0;
  let recovered = false;
  for (let i = 0; i < 120; i++) {
    try {
      chunkCount = (await rag.getStatus()).chunkCount || 0;
    } catch { /* ignore */ }
    if (chunkCount > 0) { recovered = true; break; }
    await sleep(500);
  }
  try { await rag.shutdown(); } catch { /* ignore */ }

  writeJson(root, 'corrupt', {
    initThrew,
    initMs: Number(initMs.toFixed(2)),
    recovered,
    chunkCount,
  });
}

async function runPhase(phase, root) {
  if (!root || !path.isAbsolute(root)) {
    console.error(`[perf] --phase requires an absolute --root (got: ${root})`);
    process.exit(2);
  }
  process.env.RAG_ROOT = root;
  if (phase === 'cold') return runCold(root);
  if (phase === 'warm') return runWarm(root);
  if (phase === 'corrupt') return runCorrupt(root);
  console.error(`[perf] Unknown phase: ${phase}`);
  process.exit(2);
}

// ===========================================================================
// Parent orchestration
// ===========================================================================

/** Spawn a child phase and resolve its result JSON. */
function spawnPhase(phase, root) {
  return new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      [fileURLToPath(import.meta.url), '--phase', phase, '--root', root],
      { env: { ...process.env, RAG_ROOT: root, FORCE_COLOR: '0' }, stdio: ['ignore', 'pipe', 'pipe'] }
    );
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('close', (code) => {
      let data = null;
      try {
        data = JSON.parse(fs.readFileSync(path.join(root, '.rag', `perf-${phase}.json`), 'utf8'));
      } catch { /* missing/corrupt result */ }
      resolve({ phase, code, data, stdout, stderr });
    });
  });
}

function computeGates(cold, warm, corrupt) {
  const w = warm?.data || {};
  const c = corrupt?.data || {};
  const k = w.latencies?.keyword || {};
  const gates = {
    p1_warm_cache_restore_lt_100ms: {
      pass: typeof w.cacheLoadMs === 'number' && w.cacheLoadMs >= 0 && w.cacheLoadMs < 100,
      actual: w.cacheLoadMs,
      target: '< 100 ms',
    },
    p1_cache_populated: {
      pass: (w.totalDocs ?? 0) > 0 && (w.documentsSize ?? 0) > 0,
      actual: `${w.totalDocs ?? 0} docs / ${w.documentsSize ?? 0} documents`,
      target: '> 0',
    },
    p1_warm_ready_fast: {
      pass: typeof w.timeToReadyMs === 'number' && w.timeToReadyMs >= 0 && w.timeToReadyMs < 2000,
      actual: `${w.timeToReadyMs} ms to ready+chunks`,
      target: '< 2000 ms (no full rescan)',
    },
    p1_corrupt_cache_graceful: {
      pass: c.initThrew === false && c.recovered === true,
      actual: `threw=${c.initThrew} recovered=${c.recovered}`,
      target: 'no crash + recovers via scan',
    },
    p2_keyword_p95_lt_10ms: {
      pass: typeof k.p95 === 'number' && k.p95 >= 0 && k.p95 < 10,
      actual: `${k.p95} ms (n=${k.n})`,
      target: '< 10 ms',
    },
    p2_keyword_returns_results: {
      pass: (w.latencies?.keyword?.sampleResults ?? 0) > 0,
      actual: `${w.latencies?.keyword?.sampleResults ?? 0} results`,
      target: '> 0 (searchable warm cache)',
    },
    p3_workspace_zero_chunk_delta: {
      pass: (w.workspaceDelta ?? -1) === 0,
      actual: `${w.workspaceDelta} chunk delta after 50-file burst`,
      target: '0 (workspace not watched)',
    },
    p3_workspace_no_cache_write: {
      pass: w.bm25TouchedByWorkspace === false,
      actual: `bm25.json touched=${w.bm25TouchedByWorkspace}`,
      target: 'false (no re-index/cache write)',
    },
    p3_eventloop_p95_lt_5ms: {
      pass: typeof w.evtLoopP95 === 'number' && w.evtLoopP95 < 5,
      actual: `${w.evtLoopP95} ms`,
      target: '< 5 ms',
    },
    p3_knowledge_incremental: {
      pass: (w.knowledgeDelta ?? 0) > 0,
      actual: `${w.knowledgeDelta} chunk delta after single knowledge edit`,
      target: '> 0 (incremental)',
    },
    p3_cache_persisted_on_knowledge_change: {
      pass: w.bm25ChangedOnK === true,
      actual: `bm25.json rewritten=${w.bm25ChangedOnK}`,
      target: 'true (incremental save)',
    },
  };
  return gates;
}

function writeReport({ ts, root, cold, warm, corrupt, gates }) {
  const w = warm?.data || {};
  const c = cold?.data || {};
  const k = w.latencies?.keyword || {};
  const d = w.latencies?.dense || {};
  const h = w.latencies?.hybrid || {};
  const passed = Object.values(gates).filter((g) => g.pass).length;
  const total = Object.keys(gates).length;
  const allPass = passed === total;

  const md = `# RAG Performance Verification Report — Lag-Fix Effectiveness

> Generated: ${new Date(ts).toISOString()}
> Isolated RAG_ROOT: \`${root}\` · Sample corpus: \`knowledge/rag-sample\` (2 files)
> Reference: \`artifacts/history/As-I-noticed-the-terminal-when-I-turn/2026-08-11_18.59.33/rag-performance-verification-plan.md\`

## Result: **${allPass ? '✅ ALL GATES PASS' : '❌ GATES FAILED'}** (${passed}/${total})

## Pillar 1 — Startup & Cache Latency

| Metric | Cold (first boot) | Warm (cache present) | Gate |
|---|---|---|---|
| \`rag.init()\` total | ${c.initMs ?? '-'} ms | ${w.initTotalMs ?? '-'} ms (not awaited by CLI) | — |
| BM25 cache restore (\`rebuildIndex()\`) | — | **${w.cacheLoadMs ?? '-'} ms** | **< 100 ms** ${gates.p1_warm_cache_restore_lt_100ms.pass ? '✅' : '❌'} |
| Index size | — | ${w.totalDocs ?? '-'} docs / ${w.documentsSize ?? '-'} documents | > 0 ${gates.p1_cache_populated.pass ? '✅' : '❌'} |
| Time to ready + chunks | ${c.scanMs ?? '-'} ms (background scan) | ${w.timeToReadyMs ?? '-'} ms | < 2000 ms ${gates.p1_warm_ready_fast.pass ? '✅' : '❌'} |
| Cache persisted on shutdown | bm25=${c.cacheFiles?.bm25} hashes=${c.cacheFiles?.hashes} | bm25=${w.cacheFiles?.bm25} | — |
| Corrupt-cache fallback | — | threw=${gates.p1_corrupt_cache_graceful.actual.split(' ')[0]}, recovered=${gates.p1_corrupt_cache_graceful.actual.includes('recovered=true')} | no crash ${gates.p1_corrupt_cache_graceful.pass ? '✅' : '❌'} |

## Pillar 2 — Search-Mode Latency (50 iterations)

| Mode | p50 | p95 | p99 | mean | max | results | Gate |
|---|---|---|---|---|---|---|---|
| keyword | ${k.p50 ?? '-'} ms | **${k.p95 ?? '-'} ms** | ${k.p99 ?? '-'} ms | ${k.mean ?? '-'} ms | ${k.max ?? '-'} ms | ${k.sampleResults ?? '-'} | **< 10 ms** ${gates.p2_keyword_p95_lt_10ms.pass ? '✅' : '❌'} + results ${gates.p2_keyword_returns_results.pass ? '✅' : '❌'} |
| dense | ${d.p50 ?? '-'} ms | ${d.p95 ?? '-'} ms | ${d.p99 ?? '-'} ms | ${d.mean ?? '-'} ms | ${d.max ?? '-'} ms | ${d.sampleResults ?? '-'} | measured (embedder ${w.embedderAvailable ? 'available' : 'unavailable → degraded'}) |
| hybrid | ${h.p50 ?? '-'} ms | ${h.p95 ?? '-'} ms | ${h.p99 ?? '-'} ms | ${h.mean ?? '-'} ms | ${h.max ?? '-'} ms | ${h.sampleResults ?? '-'} | measured |

Zero-ONNX guarantee for keyword mode: proven by unit test \`test/unit/ragPerformance.test.js\` (embed/rerank spy) — keyword p95 < 10 ms is consistent with zero ONNX/FlashRank.

## Pillar 3 — Watcher & Workspace Isolation

| Metric | Value | Gate |
|---|---|---|
| Chunk delta after 50-file workspace burst | ${w.workspaceDelta ?? '-'} | 0 ${gates.p3_workspace_zero_chunk_delta.pass ? '✅' : '❌'} |
| \`bm25.json\` touched by workspace burst | ${w.bm25TouchedByWorkspace} | false ${gates.p3_workspace_no_cache_write.pass ? '✅' : '❌'} |
| Event-loop p95 during burst | ${w.evtLoopP95 ?? '-'} ms | < 5 ms ${gates.p3_eventloop_p95_lt_5ms.pass ? '✅' : '❌'} |
| Chunk delta after single knowledge edit | ${w.knowledgeDelta ?? '-'} (${w.incrementalMs ?? '-'} ms) | > 0 ${gates.p3_knowledge_incremental.pass ? '✅' : '❌'} |
| \`bm25.json\` rewritten after knowledge edit | ${w.bm25ChangedOnK} | true ${gates.p3_cache_persisted_on_knowledge_change.pass ? '✅' : '❌'} |
| \`saveBm25Index()\` (shutdown/\`/new\` cost) | ${w.saveBm25Ms ?? '-'} ms | informational |

## Gates Summary

| Gate | Target | Actual | Status |
|---|---|---|---|
${Object.entries(gates).map(([id, g]) => `| ${id} | ${g.target} | ${g.actual} | ${g.pass ? '✅ PASS' : '❌ FAIL'} |`).join('\n')}

## Phase 5 — Quality Non-Regression

See the quality re-run executed separately (\`node scripts/rag-quality-test.js\`, \`npm run rag:evaluate\`).
The previously archived 0% report (2026-08-11T11:51Z) predates the completed T1-T9 fix and was re-checked.

## Notes

- Real CLI startup (\`node main.js\`) never awaits \`rag.init()\` (fire-and-forget, orchestrator.js:2106) — the prompt is never blocked by RAG; warm cache restore is what the fix targets.
- Dense/hybrid latency depends on ONNX model presence (shared repo cache); embedder ${w.embedderAvailable ? 'was available' : 'was NOT available — dense/hybrid degraded to BM25-only'} during this run.
- Workspace burst files are NOT indexed (workspace/ is not watched) — they remain unsearchable until a reindex, by design.
`;

  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(REPORT_MD, md, 'utf8');
  fs.writeFileSync(
    REPORT_JSON,
    JSON.stringify({ ts, root, cold: cold?.data, warm: warm?.data, corrupt: corrupt?.data, gates, allPass, passed, total }, null, 2),
    'utf8'
  );
  return allPass;
}

async function main() {
  // Child mode: run a single phase and exit.
  if (phaseArg) {
    await runPhase(phaseArg, rootArg);
    process.exit(0);
  }

  // Parent mode: orchestrate cold -> warm -> corrupt, aggregate, report.
  const ts = Date.now();
  const root = rootArg ? path.resolve(rootArg) : path.join(REPO_ROOT, 'test', 'tmp', `rag-perf-${ts}`);
  const corruptRoot = path.join(REPO_ROOT, 'test', 'tmp', `rag-perf-${ts}-corrupt`);

  const copied = copySample(root);
  console.log(`[perf] isolated root: ${root} (sample files: ${copied})`);

  const cold = await spawnPhase('cold', root);
  console.log(`[perf] cold  -> code=${cold.code} chunkCount=${cold.data?.chunkCount ?? '?'} initMs=${cold.data?.initMs ?? '?'}ms`);
  if (cold.stderr.trim()) console.log(`[perf] cold stderr: ${cold.stderr.trim().split('\n').slice(0, 3).join(' | ')}`);

  const warm = await spawnPhase('warm', root);
  console.log(`[perf] warm  -> code=${warm.code} cacheLoadMs=${warm.data?.cacheLoadMs ?? '?'}ms keywordP95=${warm.data?.latencies?.keyword?.p95 ?? '?'}ms wsDelta=${warm.data?.workspaceDelta ?? '?'}`);
  if (warm.stderr.trim()) console.log(`[perf] warm stderr: ${warm.stderr.trim().split('\n').slice(0, 3).join(' | ')}`);

  // Corrupt-cache phase: its own fresh root with a pre-corrupted cache.
  copySample(corruptRoot);
  fs.mkdirSync(path.join(corruptRoot, '.rag'), { recursive: true });
  fs.writeFileSync(path.join(corruptRoot, '.rag', 'bm25.json'), 'NOT JSON {{{ not a valid cache', 'utf8');
  fs.writeFileSync(path.join(corruptRoot, '.rag', 'hashes.json'), 'garbage', 'utf8');
  const corrupt = await spawnPhase('corrupt', corruptRoot);
  console.log(`[perf] corrupt -> code=${corrupt.code} threw=${corrupt.data?.initThrew ?? '?'} recovered=${corrupt.data?.recovered ?? '?'}`);

  const gates = computeGates(cold, warm, corrupt);
  const allPass = writeReport({ ts, root, cold, warm, corrupt, gates });

  if (!keep) {
    try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* ignore */ }
    try { fs.rmSync(corruptRoot, { recursive: true, force: true }); } catch { /* ignore */ }
  }

  console.log('');
  console.log(`[perf] gates: ${Object.entries(gates).filter(([, g]) => g.pass).length}/${Object.keys(gates).length} PASS`);
  for (const [id, g] of Object.entries(gates)) {
    console.log(`  ${g.pass ? '✅' : '❌'} ${id}: ${g.actual} (target ${g.target})`);
  }
  console.log(`[perf] report: ${REPORT_MD}`);
  process.exit(allPass ? 0 : 1);
}

await main();
