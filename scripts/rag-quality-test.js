#!/usr/bin/env node
/**
 * rag-quality-test.js — "Before vs After RAG" quality + token benchmark.
 *
 * Answers two questions with a sample corpus (default: knowledge/rag-sample):
 *   1. Is the RAG system GOOD at retrieving the right section?
 *        -> Hit@1, Hit@3, Precision@3, MRR, avg topScore, low-confidence rate
 *   2. What does RAG SAVE vs NOT using RAG?
 *        -> full-file tokens ("without RAG") vs injected chunk tokens ("with RAG")
 *
 * The sample corpus is copied into an ISOLATED RAG_ROOT (test/tmp/...) so the
 * real knowledge index and .rag/config.json are never touched.
 *
 * Modes (auto-selected unless --mode given):
 *   - bm25    : keyword-only (auto when embedding models are absent/offline)
 *   - dense   : AI-embedding hybrid search (requires models: npm run setup:rag)
 *   - rerank  : dense + FlashRank cross-encoder re-ranking
 *
 * Usage:
 *   node scripts/rag-quality-test.js [--sample <file|dir>] [--mode auto|bm25|dense|rerank]
 *
 * Exit code 0 when the primary mode reaches Hit@3 >= 0.85 and MRR >= 0.75.
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
const sampleArg = opt('--sample', path.join(REPO_ROOT, 'knowledge', 'rag-sample'));
const modeFilter = opt('--mode', null);

// ---- quiz: question -> unique marker + expected section (ground truth) ----
const QUIZ = [
  { q: 'How do I authenticate to the API and where is the bearer token stored?', marker: 'eyJhbGciOiJIUzI1NiJ9', section: '1. Authentication & API Tokens' },
  { q: 'What timeout and retry policy does the configuration system use?', marker: 'timeout: 30000', section: '2. Configuration & Timeouts' },
  { q: 'What are the steps in the production deployment checklist?', marker: 'helm upgrade', section: '3. Production Deployment Checklist' },
  { q: 'What is the API rate limit and which endpoint is affected?', marker: '60 requests per minute', section: '4. REST API Rate Limits' },
  { q: 'Which database index speeds up user lookup queries?', marker: 'idx_users_email', section: '5. Database Indexing & Queries' },
  { q: 'How are unit tests executed in the CI pipeline?', marker: 'vitest run', section: '6. Testing Strategy & CI' },
  { q: 'Which CLI flag enables verbose logging?', marker: '--verbose', section: '7. CLI Commands & Flags' },
  { q: 'How does the cache reduce latency for repeated queries?', marker: 'time-to-live of 300 seconds', section: '8. Caching & Performance' },
];

// ---- isolated root (must be set BEFORE dynamic imports of lib/rag) ----
const root = path.join(REPO_ROOT, 'test', 'tmp', `rag-quality-${Date.now()}`);
process.env.RAG_ROOT = root;

const rag = await import('../lib/rag/index.js');
const { getConfig, saveConfig } = await import('../lib/rag/config.js');
const { isAvailable: embedderAvailable } = await import('../lib/rag/embedder.js');
const { countTokens } = await import('../lib/rag/tokenBudget.js');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- build corpus: copy sample file(s) into isolated knowledge/ ----
const knowledgeDir = path.join(root, 'knowledge');
fs.mkdirSync(knowledgeDir, { recursive: true });

const samplePath = path.resolve(sampleArg);
if (!fs.existsSync(samplePath)) {
  console.error(`[quality] Sample not found: ${samplePath}`);
  process.exit(2);
}

const copiedFiles = [];
const fullTexts = [];
if (fs.statSync(samplePath).isDirectory()) {
  for (const f of fs.readdirSync(samplePath)) {
    const src = path.join(samplePath, f);
    if (!fs.statSync(src).isFile()) continue;
    fs.copyFileSync(src, path.join(knowledgeDir, f));
    copiedFiles.push(f);
    fullTexts.push(fs.readFileSync(src, 'utf8'));
  }
} else {
  fs.copyFileSync(samplePath, path.join(knowledgeDir, path.basename(samplePath)));
  copiedFiles.push(path.basename(samplePath));
  fullTexts.push(fs.readFileSync(samplePath, 'utf8'));
}

/** Tokens the agent would consume WITHOUT RAG (the entire source). */
const withoutRagTokens = countTokens(fullTexts.join('\n\n'));

console.log(`[quality] root=${root}`);
console.log(`[quality] sample=${samplePath} (${copiedFiles.join(', ')})`);
console.log(`[quality] queries=${QUIZ.length}  without-RAG tokens=${withoutRagTokens}`);

// ---- index & wait ----
await rag.init();
let status = await rag.getStatus();
let waited = 0;
while ((!status || status.chunkCount < 1) && waited < 120_000) {
  await sleep(1000);
  waited += 1000;
  status = await rag.getStatus();
}
console.log(`[quality] indexed ${status?.chunkCount} chunks in ${(waited / 1000).toFixed(1)}s (embedder: ${status?.modelAvailable ? 'dense' : 'bm25-only'})`);
if (!status || status.chunkCount < 1) {
  console.error('[quality] FAILED: nothing indexed.');
  process.exit(1);
}

// ---- relevance helpers ----
function isHit(result, quiz) {
  const text = String(result.text || '');
  return text.includes(quiz.marker);
}

async function evaluateRun(label, useRerank) {
  const stats = { hit1: 0, hit3: 0, p3sum: 0, mrrSum: 0, topScoreSum: 0, lowConf: 0, ragTokensSum: 0 };
  const rows = [];
  for (const quiz of QUIZ) {
    const res = await rag.search({ query: quiz.q, top_k: 5, layer: 'knowledge' });
    const top = res.results || [];
    const ranks = top.map((r, i) => ({ r, i })).filter(({ r }) => isHit(r, quiz));
    const hit1 = ranks.some(({ i }) => i === 0) ? 1 : 0;
    const hit3 = ranks.some(({ i }) => i < 3) ? 1 : 0;
    const p3 = top.slice(0, 3).filter((r) => isHit(r, quiz)).length / 3;
    const firstRank = ranks.length > 0 ? ranks[0].i : null;
    const mrr = firstRank !== null ? 1 / (firstRank + 1) : 0;
    const ragTokens = top.reduce((s, r) => s + countTokens(r.text || ''), 0);
    stats.hit1 += hit1;
    stats.hit3 += hit3;
    stats.p3sum += p3;
    stats.mrrSum += mrr;
    stats.topScoreSum += Number(res.topScore) || 0;
    if (res.lowConfidence) stats.lowConf += 1;
    stats.ragTokensSum += ragTokens;
    const t0 = top[0];
    rows.push({
      id: quiz.section.split('.')[0],
      expected: quiz.section,
      top: t0 ? `${path.basename(t0.file_path || '')}:${t0.line_start ?? '?'}` : '(none)',
      topScore: Number(res.topScore || 0).toFixed(3),
      hit1: hit1 ? 'Y' : '-',
      hit3: hit3 ? 'Y' : '-',
      p3: p3.toFixed(2),
      mrr: mrr.toFixed(2),
      lowConf: res.lowConfidence ? 'Y' : '-',
      ragTokens,
    });
  }
  const n = QUIZ.length;
  const avgRagTokens = stats.ragTokensSum / n;
  return {
    label,
    queries: n,
    hit1: stats.hit1 / n,
    hit3: stats.hit3 / n,
    p3: stats.p3sum / n,
    mrr: stats.mrrSum / n,
    avgTopScore: stats.topScoreSum / n,
    lowConfidenceRate: stats.lowConf / n,
    withoutRagTokens,
    avgRagTokens,
    savings: 1 - avgRagTokens / withoutRagTokens,
    rows,
  };
}

function printTable(agg) {
  console.log(`\n=== ${agg.label} ===`);
  console.log('  id  expected                         top-result             score   hit1 hit3  p3   mrr  low  ragTok');
  for (const r of agg.rows) {
    console.log(
      `  ${r.id.padEnd(3)} ${r.expected.padEnd(32)} ${r.top.padEnd(22)} ${r.topScore.padStart(6)}  ${r.hit1.padEnd(3)}  ${r.hit3.padEnd(3)}  ${r.p3.padStart(4)} ${r.mrr.padStart(4)}  ${r.lowConf.padEnd(2)} ${String(r.ragTokens).padStart(6)}`,
    );
  }
  console.log(
    `  ---- totals: Hit@1=${(agg.hit1 * 100).toFixed(1)}%  Hit@3=${(agg.hit3 * 100).toFixed(1)}%  ` +
    `P@3=${(agg.p3 * 100).toFixed(1)}%  MRR=${agg.mrr.toFixed(3)}  avgScore=${agg.avgTopScore.toFixed(3)}  lowConf=${(agg.lowConfidenceRate * 100).toFixed(1)}%`,
  );
  console.log(
    `  ---- tokens: without-RAG=${agg.withoutRagTokens}  with-RAG(avg)=${agg.avgRagTokens.toFixed(0)}  savings=${(agg.savings * 100).toFixed(1)}%`,
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
  console.log('[quality] No runnable modes for requested filter. (--mode dense/rerank need models; bm25 always runs)');
  if (modeFilter) process.exit(2);
}

const results = { generatedAt: new Date().toISOString(), sample: sampleArg, embedderAvailable: embedderOn, modes: [] };
let primary = null;

for (const m of modes) {
  // Explicit reranker control keeps labels truthful under the enabled-by-default config.
  saveConfig({ reranker: { enabled: Boolean(m.rerank) } });
  const agg = await evaluateRun(m.name, m.rerank);
  printTable(agg);
  results.modes.push(agg);
  if (!primary) primary = agg;
}

// ---- persistence ----
const outDir = path.join(REPO_ROOT, 'artifacts', 'active');
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, 'rag-quality-report.json');
fs.writeFileSync(outPath, JSON.stringify(results, null, 2));

// Also emit a human-readable markdown report.
const mdPath = path.join(outDir, 'rag-quality-report.md');
const md = buildMarkdown(results);
fs.writeFileSync(mdPath, md, 'utf8');
console.log(`\n[quality] report -> ${mdPath}`);

// ---- gate ----
if (primary) {
  const ok = primary.hit3 >= 0.85 && primary.mrr >= 0.75;
  console.log(`\n[quality] GATE (${primary.label}): Hit@3=${(primary.hit3 * 100).toFixed(1)}% MRR=${primary.mrr.toFixed(3)} -> ${ok ? 'PASS' : 'FAIL'}`);
  await rag.shutdown();
  process.exit(ok ? 0 : 1);
}
await rag.shutdown();
process.exit(0);

/**
 * Build the markdown report body.
 * @param {object} results
 * @returns {string}
 */
function buildMarkdown(results) {
  const lines = [];
  lines.push('# RAG Quality Report — Before vs After RAG');
  lines.push('');
  lines.push(`> Generated: ${results.generatedAt}`);
  lines.push(`> Sample: \`${results.sample}\``);
  lines.push(`> Embedder available (dense): **${results.embedderAvailable ? 'yes' : 'no — running BM25-only (models not installed/offline)'}**`);
  lines.push('');
  for (const agg of results.modes) {
    lines.push(`## ${agg.label}`);
    lines.push('');
    lines.push('| # | Expected section | Top result | Score | Hit@1 | Hit@3 | P@3 | MRR | LowConf | RAG tokens |');
    lines.push('|---|---|---|---|---|---|---|---|---|---|');
    for (const r of agg.rows) {
      lines.push(`| ${r.id} | ${r.expected} | \`${r.top}\` | ${r.topScore} | ${r.hit1} | ${r.hit3} | ${r.p3} | ${r.mrr} | ${r.lowConf} | ${r.ragTokens} |`);
    }
    lines.push('');
    lines.push(`**Retrieval quality:** Hit@1 = ${(agg.hit1 * 100).toFixed(1)}%, Hit@3 = ${(agg.hit3 * 100).toFixed(1)}%, Precision@3 = ${(agg.p3 * 100).toFixed(1)}%, MRR = ${agg.mrr.toFixed(3)}, avg topScore = ${agg.avgTopScore.toFixed(3)}, low-confidence rate = ${(agg.lowConfidenceRate * 100).toFixed(1)}%`);
    lines.push('');
    lines.push(`**Before vs after RAG (tokens):** without RAG (whole file) = **${agg.withoutRagTokens}** tokens · with RAG (retrieved chunks, avg) = **${agg.avgRagTokens.toFixed(0)}** tokens · **${(agg.savings * 100).toFixed(1)}% savings**`);
    lines.push('');
  }
  lines.push('---');
  lines.push('');
  lines.push('### How to re-run with the full (dense + rerank) stack');
  lines.push('');
  lines.push('```powershell');
  lines.push('npm install');
  lines.push('npm run setup:rag');
  lines.push('node scripts/rag-quality-test.js          # auto: dense + dense+rerank');
  lines.push('node scripts/rag-quality-test.js --mode rerank');
  lines.push('```');
  lines.push('');
  return lines.join('\n');
}
