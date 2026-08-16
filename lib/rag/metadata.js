import { createHash } from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';

/**
 * Compute the SHA-256 hex digest of a file's content.
 * @param {string} filePath - Absolute or relative path to the file.
 * @returns {Promise<string>} SHA-256 hex digest.
 */
export async function hashFile(filePath) {
  const content = await fs.promises.readFile(filePath);
  return createHash('sha256').update(content).digest('hex');
}

/**
 * Map a file extension to a canonical language identifier.
 * @param {string} filePath - Path to the file.
 * @returns {string|null} Detected language, or null if unknown.
 */
export function detectLanguage(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const map = {
    '.py': 'python',
    '.ts': 'typescript',
    '.js': 'javascript',
    '.go': 'go',
    '.cpp': 'cpp',
    '.cc': 'cpp',
    '.h': 'cpp',
    '.hpp': 'cpp',
    '.md': 'markdown',
    '.json': 'json',
    '.yaml': 'yaml',
    '.yml': 'yaml',
    '.log': 'log',
    '.txt': 'text',
    '.docx': 'text',
    '.pdf': 'text',
    '.epub': 'text',
    '.rtf': 'text',
    '.html': 'html',
    '.htm': 'html',
    '.xhtml': 'html',
  };
  return map[ext] ?? null;
}

/**
 * Build a line map from text.
 * @param {string} text - Source text.
 * @returns {Array<{offset: number, line: number}>} First entry is {offset: 0, line: 1}.
 */
export function lineMap(text) {
  const lines = [{ offset: 0, line: 1 }];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\n') {
      lines.push({ offset: i + 1, line: lines.length + 1 });
    }
  }
  return lines;
}

/**
 * Resolve a character offset to a 1-based line number via binary search.
 * @param {Array<{offset: number, line: number}>} map - Line map from lineMap().
 * @param {number} charOffset - Character offset within the text.
 * @returns {number} The line number whose start offset is <= charOffset.
 */
export function lineFromOffset(map, charOffset) {
  let lo = 0;
  let hi = map.length - 1;
  let result = 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (map[mid].offset <= charOffset) {
      result = map[mid].line;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return result;
}

/**
 * Build a stable chunk id from file path and line span.
 * @param {string} filePath - Absolute file path.
 * @param {number} lineStart - First source line (1-based).
 * @param {number} lineEnd - Last source line (1-based, inclusive).
 * @returns {string} SHA-1 hex digest.
 */
export function buildId(filePath, lineStart, lineEnd) {
  return createHash('sha1')
    .update(`${filePath}:${lineStart}:${lineEnd}`)
    .digest('hex');
}

/**
 * Compute the namespace (subdirectory) for a file relative to its layer root.
 * @param {string} filePath - Absolute file path.
 * @param {string|undefined} layerRoot - Absolute layer root directory, if any.
 * @returns {string} Forward-slash relative dir, '' if at root or root absent.
 */
function computeNamespace(filePath, layerRoot) {
  if (!layerRoot) return '';
  const rel = path.relative(layerRoot, path.dirname(filePath));
  if (!rel || rel === '.' || rel.startsWith('..')) return '';
  return rel.split(path.sep).join('/');
}

/**
 * Assemble a canonical chunk from raw extraction inputs.
 * @param {object} input - Raw chunk inputs.
 * @param {string} input.filePath - Absolute path to the source file.
 * @param {string} [input.layer] - Layer name.
 * @param {string} input.text - The chunk text content.
 * @param {number} input.lineStart - First source line (1-based).
 * @param {number} input.lineEnd - Last source line (1-based, inclusive).
 * @param {string[]} [input.sectionHeaders] - Extracted section headers.
 * @param {string} [input.language] - Detected language.
 * @param {string[]} [input.tags] - Tags for the chunk.
 * @param {string} [input.fileHash] - SHA-256 hash of the source file.
 * @param {string} [input.layerRoot] - Absolute root of the layer.
 * @returns {object} Canonical chunk object.
 */
export function extractMetadata({
  filePath,
  layer,
  text,
  lineStart,
  lineEnd,
  sectionHeaders = [],
  language,
  tags = [],
  fileHash,
  layerRoot,
}) {
  return {
    id: buildId(filePath, lineStart, lineEnd),
    layer: layer ?? '',
    namespace: computeNamespace(filePath, layerRoot),
    file_path: path.resolve(filePath),
    line_start: lineStart,
    line_end: lineEnd,
    timestamp: Date.now(),
    section_headers: sectionHeaders,
    language: language ?? detectLanguage(filePath),
    tags,
    text,
    file_hash: fileHash,
  };
}
