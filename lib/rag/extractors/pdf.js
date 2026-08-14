/**
 * RAG PDF extractor.
 *
 * Extracts clean text from a PDF using pdfjs-dist in-process. Pages are joined
 * with form feeds ('\f') before running cleanPdfText, which strips repeated
 * running headers/footers and edge page numbers, and joins words split across
 * a line by a hyphen.
 *
 * Ported from src/book_to_skill/parsers/pdf.py (clean_pdftotext + regexes) and
 * lib/rag/watcher.js (reconstructPageText + pdfjs loading/extraction loop).
 *
 * @module lib/rag/extractors/pdf
 */

import fs from 'fs';

// A bare page number sitting alone on a line: Arabic, or a Roman numeral of
// the kind used to number front matter. The range is 1-99.
const _ROMAN_1_99 = '(?=[ivxl])(?:xc|xl|l?x{0,3})(?:ix|iv|v?i{0,3})';
const _PDF_PAGE_NUM = new RegExp(`^\\s*(?:\\d{1,4}|${_ROMAN_1_99})\\s*$`, 'i');
const _PDF_HYPHEN_WRAP = /(\w)-\n(\w)/g;

/**
 * Clean form-feed-delimited PDF text: drop repeated running headers/footers
 * and edge page numbers, and join words split across a line by a hyphen.
 * @param {string} text - Raw PDF text with pages separated by '\f'.
 * @returns {string} Cleaned text.
 */
export function cleanPdfText(text) {
  const pages = text.split('\f');
  if (pages.length >= 3) {
    // A top/bottom line repeated on > half the pages is boilerplate.
    const edge = new Map();
    for (const p of pages) {
      const nb = p.split('\n').map((ln) => ln.trim()).filter((ln) => ln.length > 0);
      if (nb.length > 0) {
        edge.set(nb[0], (edge.get(nb[0]) || 0) + 1);
        // On a single-line page the first and last line are the same line.
        // Counting it twice would let one page cast two votes toward the
        // "more than half the pages" threshold.
        if (nb.length > 1) {
          edge.set(nb[nb.length - 1], (edge.get(nb[nb.length - 1]) || 0) + 1);
        }
      }
    }
    const boiler = new Set();
    for (const [ln, c] of edge) {
      if (c > pages.length / 2) boiler.add(ln);
    }
    const kept = [];
    for (const p of pages) {
      const lines = p.split('\n');
      const nbIdx = [];
      for (let i = 0; i < lines.length; i += 1) {
        if (lines[i].trim()) nbIdx.push(i);
      }
      const first = nbIdx.length > 0 ? nbIdx[0] : null;
      const last = nbIdx.length > 0 ? nbIdx[nbIdx.length - 1] : null;
      for (let i = 0; i < lines.length; i += 1) {
        // Running headers/footers and page numbers only ever occur at a page
        // edge -- which is also the only place `boiler` is collected from.
        if (i === first || i === last) {
          const s = lines[i].trim();
          if (boiler.has(s) || _PDF_PAGE_NUM.test(s)) continue;
        }
        kept.push(lines[i]);
      }
    }
    text = kept.join('\n');
  } else {
    text = text.replace(/\f/g, '\n');
  }
  // Naive dehyphenation; may join a genuinely-hyphenated wrapped compound.
  return text.replace(_PDF_HYPHEN_WRAP, (m, a, b) => `${a}${b}`);
}

/**
 * Reconstruct a PDF page's text with real line breaks and paragraph gaps.
 * pdfjs gives text items with `transform[5]` = baseline y. Items on the same
 * visual line share a y; a large y-gap between consecutive lines signals a
 * paragraph break.
 * @param {Array<object>} items - pdfjs getTextContent() items.
 * @returns {string} Page text with '\n' line breaks and '\n\n' paragraph gaps.
 */
function reconstructPageText(items) {
  const pts = (items || [])
    .filter((it) => it && typeof it.str === 'string' && it.str.length > 0)
    .map((it) => ({
      x: (it.transform && typeof it.transform[4] === 'number') ? it.transform[4] : 0,
      y: (it.transform && typeof it.transform[5] === 'number') ? it.transform[5] : 0,
      str: it.str,
    }));
  if (pts.length === 0) return '';

  // Sort by vertical then horizontal position.
  pts.sort((a, b) => (a.y - b.y) || (a.x - b.x));

  // Group into visual lines (tolerance ~1.5 pdf units).
  const lines = [];
  let cur = [];
  let curY = null;
  for (const p of pts) {
    if (curY === null || Math.abs(p.y - curY) <= 1.5) {
      cur.push(p);
      curY = curY === null ? p.y : (curY * 0.5 + p.y * 0.5);
    } else {
      lines.push(cur);
      cur = [p];
      curY = p.y;
    }
  }
  if (cur.length > 0) lines.push(cur);

  const lineTexts = lines.map((ln) => ln.map((p) => p.str).join(' ').trim()).filter((t) => t.length > 0);
  if (lineTexts.length === 0) return '';

  // Median vertical gap between consecutive lines.
  const gaps = [];
  for (let i = 1; i < lines.length; i += 1) {
    gaps.push(lines[i][0].y - lines[i - 1][0].y);
  }
  const sorted = [...gaps].sort((a, b) => a - b);
  const median = sorted.length > 0 ? sorted[Math.floor(sorted.length / 2)] : 0;

  const out = [];
  for (let i = 0; i < lineTexts.length; i += 1) {
    if (i > 0) {
      const g = gaps[i - 1];
      // A gap > ~2.5x the median signals a paragraph boundary.
      out.push(g > Math.max(median * 2.5, 3) ? '\n\n' : '\n');
    }
    out.push(lineTexts[i]);
  }
  return out.join('');
}

/**
 * Extract cleaned text from a PDF file using pdfjs-dist in-process.
 *
 * @async
 * @param {string} absPath - Absolute path to the PDF file.
 * @param {object} [opts] - Options.
 * @param {number} [opts.pageStart] - 1-indexed first page to extract (default 1).
 * @param {number} [opts.pageEnd] - 1-indexed last page to extract (default numPages).
 * @returns {Promise<string>} Cleaned extracted text, or '' on failure.
 */
export async function extractPdf(absPath, opts = {}) {
  try {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const data = new Uint8Array(await fs.promises.readFile(absPath));
    const doc = await pdfjs.getDocument({ data, isEvalSupported: false }).promise;
    const pageStart = Math.max(1, (opts.pageStart ?? 1));
    const pageEnd = Math.min(doc.numPages, (opts.pageEnd ?? doc.numPages));
    let text = '';
    for (let i = pageStart; i <= pageEnd; i += 1) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      text += reconstructPageText(content.items) + '\n';
    }
    // Pages separated by form feed so cleanPdfText can strip repeated
    // per-page headers/footers and edge page numbers.
    return cleanPdfText(text.replace(/\n/g, '\f'));
  } catch (err) {
    console.warn(`[extractors:pdf] extraction failed for ${absPath}:`, err?.message ?? String(err));
    return '';
  }
}
