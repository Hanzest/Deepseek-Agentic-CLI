/**
 * @fileoverview Format dispatcher for the RAG extraction layer.
 *
 * Routes a file by extension to its dedicated extractor module; unknown
 * extensions fall back to the BOM-aware text reader. Every extractor is
 * defensive: failures return '' (or null) after a console.warn, mirroring the
 * watcher's never-crash contract.
 *
 * @module lib/rag/extractors
 */

import { readTextFile } from './text.js';
import { extractPdf } from './pdf.js';
import { extractDocxFile } from './docx.js';
import { extractEpubFile } from './epub.js';
import { extractHtmlFile } from './html.js';
import { extractRtfFile } from './rtf.js';

/**
 * Extract raw text from a file by extension. Empty string signals failure.
 * @param {string} absPath - Absolute path to the file.
 * @param {string} ext - Lowercased extension ('.pdf', '.docx', ...).
 * @returns {Promise<string>} Extracted text, or '' on failure.
 */
export async function extractText(absPath, ext) {
  switch (ext) {
    case '.pdf':
      return extractPdf(absPath);
    case '.docx':
      return extractDocxFile(absPath);
    case '.epub':
      return extractEpubFile(absPath);
    case '.html':
    case '.htm':
    case '.xhtml':
      return extractHtmlFile(absPath);
    case '.rtf':
      return extractRtfFile(absPath);
    default: {
      const text = readTextFile(absPath);
      return text ?? '';
    }
  }
}
