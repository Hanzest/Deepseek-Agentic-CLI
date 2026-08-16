/**
 * RAG token-savings benchmark against a real document.
 *
 * Compares the context tokens injected by rag_search (bounded by
 * max_prompt_tokens with the 10% safety buffer) vs the tokens a non-RAG agent
 * would consume reading the ENTIRE source document.
 *
 * Usage:
 *   node scripts/rag-token-benchmark.js \
 *       [--file path/to/book.pdf] [--query "your question"] [--max-tokens 12000] [--root absPath]
 *
 * Defaults: Wooldridge_latest.pdf, a chapter-level question, 12000 max tokens.
 * Exit 0 when savings > 0 and the budget was respected.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : dflt;
};

const pdfArg = opt('--file', path.join(REPO_ROOT, 'knowledge', 'Wooldridge_latest.pdf'));
const query = opt('--query', 'What is omitted variable bias and how does it bias OLS estimators?');
const maxTokens = Number(opt('--max-tokens', '12000'));
const rootArg = opt('--root', null);
const root = rootArg
  ? path.resolve(rootArg)
  : path.join(REPO_ROOT, 'test', 'tmp', `rag-tokenbench-${Date.now()}`);
process.env.RAG_ROOT = root;

if (!fs.existsSync(pdfArg)) {
  console.error(`[token-bench] File not found: ${pdfArg}`);
  process.exit(2);
}

// Dynamic imports AFTER RAG_ROOT is set.
const rag = await import('../lib/rag/index.js');
const { countTokens } = await import('../lib/rag/tokenBudget.js');
const { extractText } = await import('../lib/rag/watcher.js');

// ---- corpus ----
const knowledgeDir = path.join(root, 'knowledge');
fs.mkdirSync(knowledgeDir, { recursive: true });
fs.copyFileSync(pdfArg, path.join(knowledgeDir, path.basename(pdfArg)));
console.log(`[token-bench] root=${root}`);
console.log(`[token-bench] file=${path.basename(pdfArg)}`);

// ---- index & wait ----
await rag.init();
let status = await rag.getStatus();
let waited = 0;
while ((!status || status.chunkCount < 1) && waited < 180_000) {
  await new Promise((r) => setTimeout(r, 1000));
  waited += 1000;
  status = await rag.getStatus();
}
console.log(`[token-bench] indexed ${status?.chunkCount} chunks in ${(waited / 1000).toFixed(1)}s`);
if (!status || status.chunkCount < 1) {
  console.error('[token-bench] FAILED: nothing indexed.');
  process.exit(1);
}

// ---- withRAG: tokens actually injected ----
const res = await rag.search({ query, top_k: 5, max_prompt_tokens: maxTokens });
const injected = res.results || [];
const ragTokens = injected.reduce((s, r) => s + countTokens(r.text || ''), 0);
const overhead = 60; // fixed tool-call framing cost
const tokensWithRag = ragTokens + overhead;

// ---- withoutRAG: reading the whole book ----
const fullText = await extractText(pdfArg, '.pdf');
const tokensFull = countTokens(fullText);

const savings = tokensFull > 0 ? (1 - tokensWithRag / tokensFull) * 100 : 0;
const budget = Math.floor(maxTokens * 0.9);

console.log(`\n  query: ${query}`);
console.log(`  top results: ${injected.length}  (topScore=${(res.topScore ?? 0).toFixed(3)})`);
console.log(`  withRAG   : ${tokensWithRag} tokens (${injected.length} chunks + ${overhead} overhead)`);
console.log(`  withoutRAG: ${tokensFull} tokens (entire document)`);
console.log(`  savings   : ${savings.toFixed(1)}%`);
console.log(`  budget    : kept ${ragTokens} <= ${budget} (floor(${maxTokens} * 0.9)) -> ${ragTokens <= budget ? 'RESPECTED' : 'VIOLATED'}`);

// ---- persist to results doc ----
const resultsPath = path.join(REPO_ROOT, 'artifacts', 'active', 'rag-textbook-results.md');
const row = [
  '',
  `### Token benchmark — ${path.basename(pdfArg)} (${new Date().toISOString()})`,
  `- Query: \`${query}\``,
  `- Indexed: ${status.chunkCount} chunks | topScore=${(res.topScore ?? 0).toFixed(3)} | lowConfidence=${res.lowConfidence}`,
  `- **withRAG: ${tokensWithRag} tokens** | **withoutRAG: ${tokensFull} tokens** | **savings: ${savings.toFixed(1)}%**`,
  `- Budget respected: ${ragTokens <= budget ? 'yes' : 'no'} (${ragTokens} <= ${budget})`,
].join('\n');
fs.appendFileSync(resultsPath, row + '\n');
console.log(`\n[token-bench] results appended -> ${resultsPath}`);

await rag.shutdown();
const ok = savings > 0 && ragTokens <= budget;
console.log(`\n[token-bench] GATE: savings>0 && budget respected -> ${ok ? 'PASS' : 'FAIL'}`);
process.exit(ok ? 0 : 1);
