/**
 * RAG retrieval-effectiveness benchmark.
 *
 * Runs known-answer queries against an isolated RAG root and reports:
 *   Hit@1, Hit@3, Precision@3, MRR, avg topScore, low-confidence rate.
 *
 * Modes (auto-selected unless --mode is given):
 *   - dense   : AI-embedding hybrid search (requires downloaded models)
 *   - bm25    : keyword-only (auto when models are absent)
 *   - rerank  : dense + cross-encoder re-ranking (config.reranker.enabled=true)
 *
 * Usage:
 *   node scripts/rag-benchmark.js [--dataset synthetic|textbook] [--root <absPath>] [--mode dense|bm25|rerank]
 *
 * Exit code 0 when primary-mode Hit@3 >= 0.85 and MRR >= 0.75.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

// ---- arg parsing ----
const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : dflt;
};
const datasetName = opt('--dataset', 'synthetic');
const rootArg = opt('--root', null);
const modeFilter = opt('--mode', null);

const DATASETS = {
  synthetic: {
    json: path.join(REPO_ROOT, 'benchmarks', 'rag', 'benchmark-dataset.json'),
    corpus: path.join(REPO_ROOT, 'benchmarks', 'rag', 'fixtures'),
  },
  textbook: {
    json: path.join(REPO_ROOT, 'benchmarks', 'rag', 'textbook-dataset.json'),
    corpus: path.join(REPO_ROOT, 'knowledge'),
  },
};

const ds = DATASETS[datasetName];
if (!ds) {
  console.error(`Unknown dataset '${datasetName}'. Use 'synthetic' or 'textbook'.`);
  process.exit(2);
}

// ---- isolated root ----
const root = rootArg
  ? path.resolve(rootArg)
  : path.join(REPO_ROOT, 'test', 'tmp', `rag-bench-${datasetName}-${Date.now()}`);
process.env.RAG_ROOT = root;

// Dynamic imports AFTER RAG_ROOT is set (ESM import hoisting would break this).
const rag = await import('../lib/rag/index.js');
const { getConfig, saveConfig } = await import('../lib/rag/config.js');
const { isAvailable: embedderAvailable } = await import('../lib/rag/embedder.js');
const { countTokens } = await import('../lib/rag/tokenBudget.js');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- build corpus ----
const knowledgeDir = path.join(root, 'knowledge');
fs.mkdirSync(knowledgeDir, { recursive: true });

const dataset = JSON.parse(fs.readFileSync(ds.json, 'utf8'));
let copiedFiles = 0;

if (datasetName === 'synthetic') {
  for (const f of fs.readdirSync(ds.corpus)) {
    fs.copyFileSync(path.join(ds.corpus, f), path.join(knowledgeDir, f));
    copiedFiles += 1;
  }
} else {
  // textbook: copy the source PDF from the user's real knowledge folder.
  const srcPdf = path.join(ds.corpus, dataset.source_file);
  if (!fs.existsSync(srcPdf)) {
    console.error(`Missing source PDF: ${srcPdf}`);
    process.exit(2);
  }
  fs.copyFileSync(srcPdf, path.join(knowledgeDir, dataset.source_file));
  copiedFiles = 1;
}
console.log(`[bench] root=${root}`);
console.log(`[bench] dataset=${datasetName} (${dataset.queries.length} queries, ${copiedFiles} file(s))`);

// ---- index & wait ----
await rag.init();
let status = await rag.getStatus();
const maxWait = datasetName === 'textbook' ? 180_000 : 60_000;
let waited = 0;
while ((!status || status.chunkCount < 1) && waited < maxWait) {
  await sleep(1000);
  waited += 1000;
  status = await rag.getStatus();
}
console.log(`[bench] indexed ${status?.chunkCount} chunks in ${waited / 1000}s (embedder: ${status?.modelAvailable ? 'dense' : 'bm25-only'})`);
if (!status || status.chunkCount < 1) {
  console.error('[bench] FAILED: nothing indexed.');
  process.exit(1);
}

// ---- relevance helpers ----
function isRelevant(result, q) {
  if (q.expected_file) {
    const file = String(result.file_path || '');
    if (!file.includes(q.expected_file)) return false;
  }
  const terms = q.expected_terms || [];
  if (terms.length === 0) return true;
  const text = String(result.text || '').toLowerCase();
  const hits = terms.map((t) => text.includes(String(t).toLowerCase()));
  return q.terms_match === 'all' ? hits.every(Boolean) : hits.some(Boolean);
}

async function evaluateRun(label, queries) {
  const stats = { hit1: 0, hit3: 0, p3sum: 0, mrrSum: 0, topScoreSum: 0, lowConf: 0 };
  const rows = [];
  for (const q of queries) {
    const res = await rag.search({ query: q.query, top_k: 5 });
    const top = res.results || [];
    const ranks = top.map((r, i) => ({ r, i })).filter(({ r }) => isRelevant(r, q));
    const hit1 = ranks.some(({ i }) => i === 0) ? 1 : 0;
    const hit3 = ranks.some(({ i }) => i < 3) ? 1 : 0;
    const p3 = top.slice(0, 3).filter((r) => isRelevant(r, q)).length / 3;
    const firstRank = ranks.length > 0 ? ranks[0].i : null;
    const mrr = firstRank !== null ? 1 / (firstRank + 1) : 0;
    stats.hit1 += hit1;
    stats.hit3 += hit3;
    stats.p3sum += p3;
    stats.mrrSum += mrr;
    stats.topScoreSum += Number(res.topScore) || 0;
    if (res.lowConfidence) stats.lowConf += 1;
    rows.push({
      id: q.id,
      top: top[0] ? (top[0].file_path || '').split(path.sep).pop() : '(none)',
      topScore: Number(res.topScore || 0).toFixed(3),
      hit1: hit1 ? 'Y' : '-',
      hit3: hit3 ? 'Y' : '-',
      p3: p3.toFixed(2),
      mrr: mrr.toFixed(2),
      lowConf: res.lowConfidence ? 'Y' : '-',
    });
  }
  const n = queries.length;
  const agg = {
    label,
    queries: n,
    hit1: stats.hit1 / n,
    hit3: stats.hit3 / n,
    p3: stats.p3sum / n,
    mrr: stats.mrrSum / n,
    avgTopScore: stats.topScoreSum / n,
    lowConfidenceRate: stats.lowConf / n,
    rows,
  };
  return agg;
}

function printTable(agg) {
  console.log(`\n=== ${agg.label} ===`);
  console.log('  id    top-result                    score   hit1 hit3  p3   mrr  low');
  for (const r of agg.rows) {
    console.log(
      `  ${r.id.padEnd(6)} ${r.top.padEnd(30)} ${r.topScore.padStart(6)}  ${r.hit1.padEnd(3)}  ${r.hit3.padEnd(3)}  ${r.p3.padStart(4)} ${r.mrr.padStart(4)}   ${r.lowConf}`,
    );
  }
  console.log(
    `  ---- totals: Hit@1=${(agg.hit1 * 100).toFixed(1)}%  Hit@3=${(agg.hit3 * 100).toFixed(1)}%  ` +
    `P@3=${(agg.p3 * 100).toFixed(1)}%  MRR=${agg.mrr.toFixed(3)}  avgScore=${agg.avgTopScore.toFixed(3)}  lowConf=${(agg.lowConfidenceRate * 100).toFixed(1)}%`,
  );
}

// ---- run modes ----
const embedderOn = embedderAvailable();
const modes = [];
if (!modeFilter || modeFilter === 'bm25') {
  modes.push({ name: embedderOn ? 'dense' : 'bm25-only', rerank: false });
}
if (!modeFilter && embedderOn) {
  modes.push({ name: 'dense+rerank', rerank: true });
}
if (modeFilter === 'dense' && embedderOn) {
  modes.push({ name: 'dense', rerank: false });
}
if (modeFilter === 'rerank' && embedderOn) {
  modes.push({ name: 'dense+rerank', rerank: true });
}
if (modes.length === 0) {
  console.log('[bench] No runnable modes for requested filter. (--mode dense/rerank need models; bm25 always runs)');
  if (modeFilter) process.exit(2);
}

const results = { dataset: datasetName, root, generatedAt: new Date().toISOString(), modes: [] };
let primary = null;

for (const m of modes) {
  if (m.rerank) {
    saveConfig({ reranker: { enabled: true } });
    // Force hybridSearch to reload config (fresh module state is fine; config is read per search).
  }
  const agg = await evaluateRun(m.name, dataset.queries);
  printTable(agg);
  results.modes.push(agg);
  if (!primary) primary = agg;
  if (m.rerank) saveConfig({ reranker: { enabled: false } });
}

// ---- persistence ----
const outDir = path.join(REPO_ROOT, 'artifacts', 'active');
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, 'rag-benchmark-results.json');
fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
console.log(`\n[bench] results -> ${outPath}`);

// ---- gate ----
if (primary) {
  const ok = primary.hit3 >= 0.85 && primary.mrr >= 0.75;
  console.log(`\n[bench] GATE (${primary.label}): Hit@3=${(primary.hit3 * 100).toFixed(1)}% MRR=${primary.mrr.toFixed(3)} -> ${ok ? 'PASS' : 'FAIL'}`);
  await rag.shutdown();
  process.exit(ok ? 0 : 1);
}
await rag.shutdown();
process.exit(0);
