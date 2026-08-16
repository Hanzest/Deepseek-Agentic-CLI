/**
 * RAG pre-flight: verify the watcher's PDF extraction path works on the user's
 * real textbook PDFs before benchmarking. Uses the exact extractText() the
 * watcher calls at runtime, so a PASS here means indexing will actually work.
 *
 * Usage: node scripts/rag-pdf-check.js [path/to/folder]
 * Default folder: <repo>/knowledge
 *
 * Exit code 0 = every PDF extracted > 0 chars (gate passed).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

const targetDir = path.resolve(process.argv[2] || path.join(REPO_ROOT, 'knowledge'));

const { extractText } = await import('../lib/rag/watcher.js');

if (!fs.existsSync(targetDir)) {
  console.error(`[pdf-check] Folder not found: ${targetDir}`);
  process.exit(1);
}

const pdfs = fs.readdirSync(targetDir)
  .filter((f) => f.toLowerCase().endsWith('.pdf'))
  .sort();

if (pdfs.length === 0) {
  console.error(`[pdf-check] No .pdf files in ${targetDir}`);
  process.exit(1);
}

let failures = 0;
const rows = [];

for (const name of pdfs) {
  const absPath = path.join(targetDir, name);
  try {
    const text = await extractText(absPath, '.pdf');
    const chars = text.length;
    const lines = text.split('\n');
    const blank = lines.filter((l) => l.trim().length === 0).length;
    const density = lines.length > 0 ? (blank / lines.length) : 0;
    const ok = chars > 0;
    if (!ok) failures += 1;
    rows.push({ name, chars, lines: lines.length, blankDensity: density.toFixed(2), ok });
    console.log(
      `${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(45)} chars=${String(chars).padStart(8)} ` +
      `lines=${String(lines.length).padStart(6)} blankDensity=${density.toFixed(2)}`,
    );
    if (chars > 0) {
      console.log(`       sample: ${text.slice(0, 90).replace(/\n/g, ' ')}`);
    }
  } catch (e) {
    failures += 1;
    rows.push({ name, chars: 0, lines: 0, blankDensity: 0, ok: false });
    console.log(`FAIL  ${name.padEnd(45)} extraction threw: ${e.message}`);
  }
}

const good = rows.filter((r) => r.ok).length;
console.log(`\n[pdf-check] ${good}/${rows.length} PDFs extract text.`);
if (failures > 0) {
  console.log('[pdf-check] GATE FAILED: fix lib/rag/watcher.js PDF branch before benchmarking.');
  process.exit(1);
}
console.log('[pdf-check] GATE PASSED.');
