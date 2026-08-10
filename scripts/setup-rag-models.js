#!/usr/bin/env node
/**
 * setup-rag-models.js
 *
 * Downloads the embedding and reranker ONNX models (quantized) from Hugging Face
 * into the project-local cache at <root>/.rag/models/.
 *
 * Models:
 *   - bge-small-en-v1.5 (embedding)
 *   - bge-reranker-base (reranker)
 *
 * Each model requires three files: model_quantized.onnx, tokenizer.json, config.json.
 *
 * The script is idempotent: existing non-empty files are skipped.
 *
 * Runnable via: node scripts/setup-rag-models.js
 */

import { mkdir, writeFile, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MODELS_ROOT = path.resolve(__dirname, '..', '.rag', 'models');

/**
 * Model definitions.
 * @type {Array<{name: string, files: Array<{url: string, relativePath: string}>}>}
 */
const MODELS = [
  {
    name: 'bge-small-en-v1.5',
    files: [
      {
        url: 'https://huggingface.co/Xenova/bge-small-en-v1.5/resolve/main/onnx/model_quantized.onnx',
        relativePath: 'model_quantized.onnx',
      },
      {
        url: 'https://huggingface.co/Xenova/bge-small-en-v1.5/resolve/main/tokenizer.json',
        relativePath: 'tokenizer.json',
      },
      {
        url: 'https://huggingface.co/Xenova/bge-small-en-v1.5/resolve/main/config.json',
        relativePath: 'config.json',
      },
    ],
  },
  {
    name: 'bge-reranker-base',
    files: [
      {
        url: 'https://huggingface.co/Xenova/bge-reranker-base/resolve/main/onnx/model_quantized.onnx',
        relativePath: 'model_quantized.onnx',
      },
      {
        url: 'https://huggingface.co/Xenova/bge-reranker-base/resolve/main/tokenizer.json',
        relativePath: 'tokenizer.json',
      },
      {
        url: 'https://huggingface.co/Xenova/bge-reranker-base/resolve/main/config.json',
        relativePath: 'config.json',
      },
    ],
  },
];

/**
 * Returns true if the given file exists and has a non-zero size.
 * @param {string} filePath
 * @returns {Promise<boolean>}
 */
async function fileExistsNonEmpty(filePath) {
  try {
    const st = await access(filePath, constants.F_OK);
    void st;
    const { stat } = await import('node:fs/promises');
    const info = await stat(filePath);
    return info.size > 0;
  } catch {
    return false;
  }
}

/**
 * Downloads a single file to disk (accepting redirects).
 * @param {string} url
 * @param {string} destPath
 * @returns {Promise<number>} bytes written
 */
async function downloadFile(url, destPath) {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  await writeFile(destPath, buffer);
  return buffer.length;
}

/**
 * Ensures a single model file is present locally (skips if present & non-empty).
 * @param {string} modelName
 * @param {{url: string, relativePath: string}} fileDef
 * @param {Array<{action: string, name: string}>} summary
 */
async function ensureFile(modelName, fileDef, summary) {
  const destDir = path.join(MODELS_ROOT, modelName);
  const destPath = path.join(destDir, fileDef.relativePath);

  await mkdir(destDir, { recursive: true });

  if (await fileExistsNonEmpty(destPath)) {
    console.log(`SKIP  ${modelName}/${fileDef.relativePath} (already exists)`);
    summary.push({ action: 'skipped', name: `${modelName}/${fileDef.relativePath}` });
    return;
  }

  try {
    const bytes = await downloadFile(fileDef.url, destPath);
    console.log(`SAVED ${modelName}/${fileDef.relativePath} (${bytes} bytes)`);
    summary.push({ action: 'downloaded', name: `${modelName}/${fileDef.relativePath}` });
  } catch (err) {
    console.warn(`WARN  ${modelName}/${fileDef.relativePath}: ${err.message}`);
    summary.push({ action: 'failed', name: `${modelName}/${fileDef.relativePath}` });
  }
}

/**
 * Orchestrates downloading all model files.
 */
async function main() {
  console.log(`Model cache root: ${MODELS_ROOT}`);
  const summary = [];

  for (const model of MODELS) {
    console.log(`\n[${model.name}]`);
    for (const fileDef of model.files) {
      await ensureFile(model.name, fileDef, summary);
    }
  }

  const downloaded = summary.filter((s) => s.action === 'downloaded').length;
  const skipped = summary.filter((s) => s.action === 'skipped').length;
  const failed = summary.filter((s) => s.action === 'failed').length;

  console.log('\n=== Summary ===');
  console.log(`Downloaded: ${downloaded}`);
  console.log(`Skipped:    ${skipped}`);
  console.log(`Failed:     ${failed}`);
  console.log(
    'This script is idempotent: re-running it will skip already-present non-empty files.',
  );
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
