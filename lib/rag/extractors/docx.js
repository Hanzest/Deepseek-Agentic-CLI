/**
 * @fileoverview Dependency-free DOCX text extractor for the RAG extractors.
 *
 * Port of src/book_to_skill/parsers/docx.py to JS. Provides an XXE / entity
 * expansion guard, an order-preserving stdlib-style fallback parser, and a
 * higher-level `extractDocxFile` that prefers the `mammoth` package when
 * available.
 *
 * `validateDocxXmlSafety` throws by design (security refusal). `extractDocx`
 * and `extractDocxFile` never throw — they log a warning and return null / ''
 * respectively.
 *
 * @module lib/rag/extractors/docx
 */

import { readEntry, readEntryText, listEntries } from './zip.js';

const T_OPEN = /<w:t[^>]*>/g;

/**
 * Scan all XML-ish files in the DOCX ZIP archive for forbidden DTD or entity
 * declarations to prevent XML Entity Expansion (Billion Laughs) and XXE
 * injections.
 * @param {Buffer} buffer - Whole DOCX file bytes.
 * @returns {void}
 * @throws {Error} When a forbidden declaration is found or the archive is
 *   invalid — always propagates (never swallowed).
 */
export function validateDocxXmlSafety(buffer) {
  let names;
  try {
    names = listEntries(buffer).map((e) => e.name);
  } catch (err) {
    throw new Error(`XXE: Invalid DOCX file: ${err?.message ?? err}`, { cause: err });
  }
  for (const name of names) {
    if (!(name.endsWith('.xml') || name.endsWith('.rels'))) continue;
    const bytes = readEntry(buffer, name);
    if (!bytes) continue;
    // Scan across a few encodings, forgiving decode errors (mirrors Python).
    for (const encoding of ['utf8', 'utf16le', 'latin1']) {
      let content;
      try {
        content = bytes.toString(encoding).toUpperCase();
      } catch {
        continue; // undecodable bytes in this encoding — try the next
      }
      if (content.includes('<!DOCTYPE') || content.includes('<!ENTITY')) {
        throw new Error(
          `Security validation failed: XML file '${name}' in DOCX archive contains forbidden DTD or entity declarations.`
        );
      }
    }
  }
}

/**
 * Extract all <w:p> paragraph texts and <w:tbl> tab-joined rows from a DOCX,
 * preserving document order. Tables and paragraphs are emitted exactly as
 * encountered; unknown wrappers (e.g. <w:sdt> content controls) are recursed
 * into, while <w:p> / <w:tbl> bodies are not, to avoid double-counting cell
 * paragraphs and nested tables.
 * @param {Buffer} buffer - Whole DOCX file bytes.
 * @returns {string|null} Joined text, or null on failure.
 */
export function extractDocx(buffer) {
  // Security guard runs first and throws on any DTD/entity declaration.
  validateDocxXmlSafety(buffer);
  let documentXml;
  try {
    documentXml = readEntryText(buffer, 'word/document.xml');
  } catch (err) {
    console.warn(`  [warn] extractDocx failed: ${err?.name ?? 'Error'}: ${err?.message ?? err}`);
    return null;
  }
  if (!documentXml) return null;

  const parts = [];
  scanXml(documentXml, parts);
  return parts.length ? parts.join('\n') : null;
}

/**
 * Walk the document XML linearly, emitting top-level paragraphs and table rows
 * in document order. Unknown wrapper tags (e.g. w:sdt content controls) are
 * transparent: their inner w:p / w:tbl elements are still found by the linear
 * scan, so they are neither lost nor double-counted. w:p elements nested
 * inside a w:tbl are consumed by emitTable (cell runs), not emitted standalone.
 *
 * @param {string} xml - Raw document.xml.
 * @param {string[]} parts - Accumulator for emitted lines.
 */
function scanXml(xml, parts) {
  const re = /<(\/?)([A-Za-z][\w.:-]*)([^>]*?)(\/?)>/g;
  const stack = [];
  let m;
  while ((m = re.exec(xml)) !== null) {
    const isClose = m[1] === '/';
    const tag = m[2];
    const selfClosing = m[4] === '/';
    if (selfClosing) continue; // no text content
    if (!isClose) {
      stack.push({ tag, start: m.index });
      continue;
    }
    // Match this close to its nearest open of the same tag (top of stack for
    // well-formed XML; scan backwards to tolerate malformed nesting).
    let idx = stack.length - 1;
    while (idx >= 0 && stack[idx].tag !== tag) idx -= 1;
    if (idx === -1) continue; // unmatched close
    const open = stack.splice(idx, 1)[0];
    const end = m.index + m[0].length;
    const content = xml.slice(open.start, end);
    if (tag === 'w:p') {
      // Skip paragraphs inside tables: emitTable already folds cell runs into
      // the row line, matching python-docx's no-double-count behavior.
      if (!stack.some((s) => s.tag === 'w:tbl')) {
        const text = extractPTagText(content);
        if (text) parts.push(text);
      }
    } else if (tag === 'w:tbl') {
      emitTable(content, parts);
    }
    // Any other tag (w:document, w:body, w:sdt, ...) is transparent.
  }
}


/**
 * Extract concatenated run text (<w:t>) from a paragraph's XML.
 * @param {string} paraXml - Raw XML of a <w:p> element.
 * @returns {string} Concatenated text.
 */
function extractPTagText(paraXml) {
  const texts = [];
  let m;
  T_OPEN.lastIndex = 0;
  while ((m = T_OPEN.exec(paraXml)) !== null) {
    const openEnd = m.index + m[0].length;
    const closeIdx = paraXml.indexOf('</w:t>', openEnd);
    if (closeIdx === -1) break;
    texts.push(paraXml.slice(openEnd, closeIdx));
    T_OPEN.lastIndex = closeIdx + '</w:t>'.length;
  }
  return texts.join('');
}

/**
 * Emit one tab-joined line per table row (w:tr); cell texts concatenate the
 * cell's runs and are stripped.
 * @param {string} tblXml - Raw XML of a <w:tbl> element.
 * @param {string[]} parts - Accumulator for emitted lines.
 */
function emitTable(tblXml, parts) {
  const rows = [];
  const trRe = /<w:tr[^>]*>/g;
  let m;
  while ((m = trRe.exec(tblXml)) !== null) {
    const openEnd = m.index + m[0].length;
    const close = findClosingTagIndex(tblXml, m.index, 'w:tr');
    if (close === -1) break;
    // `close` is already the index AFTER '</w:tr>'; do not advance further.
    rows.push(tblXml.slice(openEnd, close));
    trRe.lastIndex = close;
  }
  for (const rowXml of rows) {
    const cells = [];
    const tcRe = /<w:tc[^>]*>/g;
    let cm;
    tcRe.lastIndex = 0;
    while ((cm = tcRe.exec(rowXml)) !== null) {
      const openEnd = cm.index + cm[0].length;
      const close = findClosingTagIndex(rowXml, cm.index, 'w:tc');
      if (close === -1) break;
      const cellXml = rowXml.slice(openEnd, close);
      cells.push(extractPTagText(cellXml).trim());
      // `close` already points past '</w:tc>'; do not advance further.
      tcRe.lastIndex = close;
    }
    if (cells.some((c) => c.length > 0)) {
      parts.push(cells.join('\t'));
    }
  }
}

/**
 * Find the index of the matching close tag ('</name>') for an open tag,
 * accounting for same-tag nesting.
 * @param {string} xml - Raw XML.
 * @param {number} openIndex - Index of the '<w:name' open tag.
 * @param {string} name - e.g. 'w:tr'.
 * @returns {number} Index of the '>' of the matching close, or -1.
 */
function findClosingTagIndex(xml, openIndex, name) {
  const openRe = new RegExp(`<${name}[^>]*>`, 'g');
  const closeRe = new RegExp(`</${name}>`, 'g');
  openRe.lastIndex = openIndex;
  const firstOpen = openRe.exec(xml);
  if (!firstOpen) return -1;
  let depth = 1;
  openRe.lastIndex = firstOpen.index + firstOpen[0].length;
  closeRe.lastIndex = openRe.lastIndex;
  let o;
  let c;
  while (depth > 0) {
    o = openRe.exec(xml);
    c = closeRe.exec(xml);
    if (!c) return -1;
    if (o && o.index < c.index) {
      depth += 1;
      if (closeRe.lastIndex < openRe.lastIndex) closeRe.lastIndex = openRe.lastIndex;
    } else {
      depth -= 1;
      if (depth === 0) return c.index + c[0].length;
      if (openRe.lastIndex < closeRe.lastIndex) openRe.lastIndex = closeRe.lastIndex;
    }
  }
  return -1;
}

/**
 * Read a DOCX and extract its text, preferring the `mammoth` package when
 * available and falling back to the dependency-free `extractDocx` parser.
 * @param {string} absPath - Absolute path to the .docx file.
 * @returns {Promise<string>} Extracted text, or '' on failure.
 */
export async function extractDocxFile(absPath) {
  let buffer;
  try {
    buffer = (await import('node:fs')).readFileSync(absPath);
  } catch (err) {
    console.warn(`  [warn] extractDocxFile read failed: ${err?.name ?? 'Error'}: ${err?.message ?? err}`);
    return '';
  }
  try {
    validateDocxXmlSafety(buffer);
  } catch {
    return '';
  }
  try {
    const mammoth = await import('mammoth');
    const r = await mammoth.extractRawText({ path: absPath });
    if (r?.value && r.value.trim()) return r.value;
  } catch (err) {
    console.warn(`  [warn] extractDocxFile mammoth failed: ${err?.name ?? 'Error'}: ${err?.message ?? err}`);
  }
  const text = extractDocx(buffer);
  return text ?? '';
}
