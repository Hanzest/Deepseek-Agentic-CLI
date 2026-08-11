#!/usr/bin/env node
/**
 * setup-rag-models.js
 *
 * Pre-warms the RAG model caches for the CPU-friendly stack:
 *
 *   - Embedder: FastEmbed (Qdrant) — intfloat/multilingual-e5-small (INT8)
 *     cached under <root>/.rag/models/fastembed
 *   - Reranker: FlashRank — ms-marco-MultiBERT-L-6-v2 ONNX (managed by the
 *     flashrank package's own cache)
 *
 * Both libraries self-download their ONNX artifacts on first use. This script
 * triggers those downloads eagerly so the CLI never stalls on the first search.
 * It is idempotent: re-running skips already-warmed caches and prints sizes.
 *
 * Usage:
 *   node scripts/setup-rag-models.js                  # warm new caches
 *   node scripts/setup-rag-models.js --cleanup-bge    # ...and delete legacy models
 *
 * Runnable via: npm run setup:rag [-- --cleanup-bge]
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const MODELS_ROOT = path.join(ROOT, '.rag', 'models');
const FASTEMBED_CACHE = path.join(MODELS_ROOT, 'fastembed');

/** Legacy models replaced by this migration (~310 MB combined). */
const LEGACY_MODELS = ['bge-small-en-v1.5', 'bge-reranker-base'];

const args = process.argv.slice(2);
const cleanupBge = args.includes('--cleanup-bge');

/**
 * Recursively compute a directory size in bytes.
 * @param {string} dir
 * @returns {number}
 */
function dirSizeBytes(dir) {
  if (!fs.existsSync(dir)) return 0;
  let total = 0;
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(cur, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const p = path.join(cur, e.name);
      if (e.isDirectory()) stack.push(p);
      else if (e.isFile()) {
        try {
          total += fs.statSync(p).size;
        } catch {
          /* ignore */
        }
      }
    }
  }
  return total;
}

/**
 * Human-readable byte size.
 * @param {number} bytes
 * @returns {string}
 */
function fmtBytes(bytes) {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(2)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(2)} MB`;
  if (bytes >= 1e3) return `${(bytes / 1e3).toFixed(1)} KB`;
  return `${bytes} B`;
}

/**
 * Warm the FastEmbed (e5-small) cache via the embedder wrapper.
 * @returns {Promise<boolean>}
 */
async function warmEmbedder() {
  const { init, embed, isAvailable } = await import('../lib/rag/embedder.js');
  const ok = await init({ modelPath: FASTEMBED_CACHE });
  if (!ok || !isAvailable()) {
    console.log('  FAIL embedder cache not ready (check network / npm install)');
    return false;
  }
  // Trigger a real inference so the ONNX session + tokenizer are fully loaded.
  await embed(['FastEmbed warm-up probe.']);
  const size = dirSizeBytes(FASTEMBED_CACHE);
  console.log(`  OK   embedder ready (FastEmbed cache: ${fmtBytes(size)})`);
  return true;
}

/**
 * Warm the FlashRank (MultiBERT) cache via the reranker wrapper.
 * @returns {Promise<boolean>}
 */
async function warmReranker() {
  const { init, rerank, isAvailable } = await import('../lib/rag/reranker.js');
  const ok = await init();
  if (!ok || !isAvailable()) {
    console.log('  FAIL reranker cache not ready (check network / npm install)');
    return false;
  }
  // One tiny rerank forces FlashRank to fetch + load its ONNX model.
  await rerank('FlashRank warm-up probe', [
    { id: 'w1', text: 'FlashRank warm-up probe passage.' },
  ], 1);
  console.log('  OK   reranker ready (FlashRank model cache warmed)');
  return true;
}

/**
 * Delete the legacy bge model directories and report freed space.
 * @returns {number} bytes freed
 */
function cleanupLegacyModels() {
  let freed = 0;
  for (const name of LEGACY_MODELS) {
    const dir = path.join(MODELS_ROOT, name);
    if (fs.existsSync(dir)) {
      const sz = dirSizeBytes(dir);
      try {
        fs.rmSync(dir, { recursive: true, force: true });
        freed += sz;
        console.log(`DELETED ${name} (${fmtBytes(sz)})`);
      } catch (err) {
        console.warn(`WARN  failed to delete ${name}: ${err?.message ?? err}`);
      }
    } else {
      console.log(`SKIP  ${name} (not present)`);
    }
  }
  return freed;
}

/**
 * Orchestrates cache warm-up and optional legacy cleanup.
 */
async function main() {
  fs.mkdirSync(MODELS_ROOT, { recursive: true });
  console.log(`Model cache root: ${MODELS_ROOT}`);
  console.log('Target stack: FastEmbed (e5-small INT8) + FlashRank (MultiBERT ONNX)\n');

  console.log('[embedder] FastEmbed e5-small');
  const embedderOk = await warmEmbedder();

  console.log('\n[reranker] FlashRank MultiBERT');
  const rerankerOk = await warmReranker();

  let freed = 0;
  if (cleanupBge) {
    console.log('\n[cleanup] legacy bge models');
    freed = cleanupLegacyModels();
  } else if (LEGACY_MODELS.some((n) => fs.existsSync(path.join(MODELS_ROOT, n)))) {
    console.log('\nNOTE  legacy bge model folders still present (~310 MB).');
    console.log('      Delete them after verifying benchmarks with:');
    console.log('        npm run setup:rag -- --cleanup-bge');
  }

  console.log('\n=== Summary ===');
  console.log(`Embedder cache: ${embedderOk ? 'READY' : 'NOT READY'}`);
  console.log(`Reranker cache: ${rerankerOk ? 'READY' : 'NOT READY'}`);
  if (cleanupBge) console.log(`Legacy models freed: ${fmtBytes(freed)}`);
  console.log('This script is idempotent: re-running skips already-warmed caches.');

  if (!embedderOk || !rerankerOk) {
    console.log('\nSome caches are not ready. If deps are missing, run `npm install` first;');
    console.log('if the network is unavailable, re-run this script once online.');
    process.exitCode = 1;
  } else {
    console.log('\nRollback (if ever needed): restore package.json deps + config.js defaults');
    console.log('from git, re-download bge models, and run `/rag reindex`.');
  }
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
