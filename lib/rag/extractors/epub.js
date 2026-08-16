/**
 * @fileoverview Dependency-free EPUB text extractor for the RAG pipelines.
 *
 * Port of src/book_to_skill/parsers/epub.py's stdlib-only extract_with_zipfile
 * implementation. Reads the OPF package document via the shared ZIP reader,
 * walks its manifest + spine to build the true reading order, and extracts
 * text from each HTML/XHTML content document with the shared HTML extractor.
 *
 * @module lib/rag/extractors/epub
 */

import fs from 'node:fs';

import { listEntries, readEntryText } from './zip.js';
import { extractHtml } from './html.js';

const CONTENT_EXTS = ['.html', '.xhtml'];

/** Split a zip entry name into its dirname + basename (forward-slash only). */
function posixDirname(p) {
  const idx = p.lastIndexOf('/');
  return idx === -1 ? '' : p.slice(0, idx);
}

/** posixpath.normpath equivalent for forward-slash paths. */
function posixNormpath(p) {
  const out = [];
  for (const part of p.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') out.pop();
    else out.push(part);
  }
  return out.join('/');
}

/** posixpath.join equivalent for forward-slash paths (empty base = rest). */
function posixJoin(base, part) {
  if (!base) return part;
  return `${base}/${part}`;
}

/**
 * Locate the OPF package document. Tries META-INF/container.xml first, then
 * falls back to any entry whose name ends in ".opf".
 * @param {Buffer} buffer - Whole EPUB file bytes.
 * @param {Array<{name: string}>} entries - ZIP central directory entries.
 * @returns {string|null} The OPF path, or null when not found.
 */
function findOpfPath(buffer, entries) {
  const container = readEntryText(buffer, 'META-INF/container.xml');
  if (container) {
    const match = container.match(/full-path=["']([^"']+\.opf)["']/);
    if (match) return match[1];
  }
  const opf = entries.find((e) => e.name.endsWith('.opf'));
  return opf ? opf.name : null;
}

/**
 * Extract full text from an EPUB file in OPF spine order.
 * @param {string} absPath - Absolute path to the .epub file.
 * @returns {Promise<string>} Joined text, or '' when extraction fails.
 */
export async function extractEpubFile(absPath) {
  try {
    const buffer = await fs.promises.readFile(absPath);
    const entries = listEntries(buffer);
    if (!entries.length) return '';

    const opfPath = findOpfPath(buffer, entries);
    const opfDir = opfPath ? posixDirname(opfPath) : '';

    const spineOrder = [];
    const seen = new Set();

    if (opfPath) {
      const opfText = readEntryText(buffer, opfPath);
      if (opfText) {
        // Manifest: item id -> resolved href (attribute order agnostic).
        const manifest = {};
        const itemRe = /<item\b[^>]*?\/?>/g;
        let m;
        while ((m = itemRe.exec(opfText)) !== null) {
          const itemTag = m[0];
          const idM = itemTag.match(/\bid=["']([^"']+)["']/);
          const hrefM = itemTag.match(/\bhref=["']([^"']+)["']/);
          if (idM && hrefM) {
            const href = hrefM[1];
            const resolved = opfDir ? posixNormpath(posixJoin(opfDir, href)) : href;
            manifest[idM[1]] = resolved;
          }
        }

        // Spine: ordered idrefs -> hrefs (true reading order).
        const idrefRe = /<itemref\b[^>]*?\bidref=["']([^"']+)["']/g;
        while ((m = idrefRe.exec(opfText)) !== null) {
          const href = manifest[m[1]];
          if (href && !seen.has(href)) {
            spineOrder.push(href);
            seen.add(href);
          }
        }

        // Safety net: remaining content docs in manifest order.
        for (const href of Object.values(manifest)) {
          if (CONTENT_EXTS.some((ext) => href.endsWith(ext)) && !seen.has(href)) {
            spineOrder.push(href);
            seen.add(href);
          }
        }
      }
    }

    const htmlFiles = spineOrder.length
      ? spineOrder
      : entries
          .map((e) => e.name)
          .filter((n) => CONTENT_EXTS.some((ext) => n.endsWith(ext)))
          .sort();

    if (!htmlFiles.length) return '';

    const parts = [];
    for (const name of htmlFiles) {
      try {
        const raw = readEntryText(buffer, name);
        if (!raw) continue;
        const text = await extractHtml(raw);
        if (text) parts.push(text);
      } catch (err) {
        console.warn('[extractors:epub] skipping entry:', err?.message);
      }
    }
    return parts.join('\n\n');
  } catch (err) {
    console.warn('[extractors:epub]', err?.message);
    return '';
  }
}
