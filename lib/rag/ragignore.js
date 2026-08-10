import ignore from 'ignore';
import path from 'node:path';
import { existsSync, readFileSync } from 'node:fs';

/**
 * Built-in exclusion patterns applied to every layer regardless of a .ragignore file.
 * @constant {string[]}
 */
const BUILTIN_PATTERNS = [
  '**/.env',
  '**/.env.*',
  '**/node_modules/**',
  '**/.git/**',
  '**/__pycache__/**',
  '**/dist/**',
  '**/build/**',
  '**/.rag/**',
  '**/chat_history/**',
  '**/artifacts/**',
  '**/test/tmp/**',
  '**/*.local.env',
];

/**
 * File extensions whose contents are allowed to be indexed by the RAG pipeline.
 * @constant {Set<string>}
 */
const ALLOWED_EXTENSIONS = new Set([
  '.md',
  '.pdf',
  '.txt',
  '.docx',
  '.py',
  '.ts',
  '.js',
  '.go',
  '.cpp',
  '.json',
  '.yaml',
  '.yml',
  '.log',
]);

/**
 * Build an ignore instance seeded with the built-in exclusion patterns.
 * @returns {import('ignore').Ignore}
 */
function createIgnoreInstance() {
  return ignore().add(BUILTIN_PATTERNS);
}

/**
 * Determine whether a relative path should be excluded based ONLY on the built-in
 * patterns and the allowed-extension whitelist. This helper is pure (no filesystem
 * access) so it can be unit tested directly.
 *
 * @param {string} relPath - Path relative to the layer root, using forward slashes.
 * @returns {boolean} true if the path should be excluded.
 */
export function shouldExclude(relPath) {
  const normalized = relPath.split(path.sep).join('/').replace(/^\.\//, '');
  if (createIgnoreInstance().ignores(normalized)) {
    return true;
  }
  const ext = path.extname(normalized).toLowerCase();
  return !ALLOWED_EXTENSIONS.has(ext);
}

/**
 * Load and merge a .ragignore file (if present) into an ignore instance seeded with
 * built-in patterns.
 *
 * @param {string} layerRoot - Absolute path to the layer root directory.
 * @returns {import('ignore').Ignore} An ignore instance combining built-ins and file rules.
 */
export function loadRagignore(layerRoot) {
  const ig = createIgnoreInstance();
  const ragignorePath = path.join(layerRoot, '.ragignore');
  if (existsSync(ragignorePath)) {
    const lines = readFileSync(ragignorePath, 'utf-8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith('#'));
    ig.add(lines);
  }
  return ig;
}

/**
 * Convert an absolute path to a forward-slash path relative to the layer root.
 * @param {string} absPath - Absolute path to check.
 * @param {string} layerRoot - Absolute path to the layer root.
 * @returns {string} The relative path with forward slashes.
 */
export function isExcluded(absPath, layerRoot) {
  const relPath = path
    .relative(layerRoot, absPath)
    .split(path.sep)
    .join('/');
  if (shouldExclude(relPath)) {
    return true;
  }
  const ig = loadRagignore(layerRoot);
  return ig.ignores(relPath);
}
