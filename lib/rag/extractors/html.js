import fs from 'node:fs';

/**
 * Minimal HTML -> plain text converter, a faithful port of
 * `src/book_to_skill/parsers/html.py` (the `_HTMLTextExtractor` state machine)
 * built on top of cheerio's DOM.
 *
 * @module lib/rag/extractors/html
 */

/** Tags whose content is skipped entirely (with nesting-depth tracking). */
const SKIP_TAGS = new Set(['script', 'style', 'head']);

/** Block-level elements. A boundary is emitted when they open AND close. */
const BLOCK_TAGS = new Set([
  'address', 'article', 'aside', 'blockquote', 'br', 'dd', 'details',
  'div', 'dl', 'dt', 'fieldset', 'figcaption', 'figure', 'footer',
  'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hgroup', 'hr',
  'li', 'main', 'nav', 'ol', 'p', 'pre', 'section', 'table', 'tbody',
  'tfoot', 'thead', 'tr', 'ul',
]);

/** Table cells are separated by a tab so a row stays on one line. */
const CELL_TAGS = new Set(['td', 'th']);

/**
 * Port of the `_HTMLTextExtractor` state machine over the cheerio DOM.
 *
 * @param {import('cheerio').CheerioAPI} $ - the loaded cheerio instance
 * @returns {string} extracted plain text
 */
function extractText($) {
  const parts = [];
  let skipDepth = 0;
  // Strongest boundary awaiting the next non-blank text run.
  let pending = '';

  const mark = (separator) => {
    // "\n" outranks "\t": a row/block boundary must not be downgraded to a
    // cell boundary by a <td> that opens straight after a <tr>.
    if (separator === '\n' || !pending) pending = separator;
  };

  const walk = (node) => {
    if (node.type === 'text') {
      if (skipDepth) return;
      const data = node.data == null ? '' : String(node.data);
      if (pending) {
        if (!data.trim()) {
          // Whitespace-only text between tags is layout indentation. It cannot
          // satisfy a pending boundary — drop it and keep waiting for content.
          return;
        }
        // Suppress a leading separator so the output does not start blank.
        if (parts.length) parts.push(pending);
        pending = '';
      }
      if (data) parts.push(data);
      return;
    }

    if (node.type === 'tag') {
      const tag = node.tagName ? node.tagName.toLowerCase() : '';

      if (SKIP_TAGS.has(tag)) skipDepth += 1;

      if (BLOCK_TAGS.has(tag)) mark('\n');
      else if (CELL_TAGS.has(tag)) mark('\t');

      if (node.children) {
        for (const child of node.children) walk(child);
      }

      if (SKIP_TAGS.has(tag)) {
        if (skipDepth) skipDepth -= 1;
        // skip tags emit no closing boundary (matches Python: early return)
        return;
      }
      if (BLOCK_TAGS.has(tag)) mark('\n');
      else if (CELL_TAGS.has(tag)) mark('\t');
    }
  };

  const body = $('body');
  if (body.length) {
    const root = body.get(0);
    if (root && root.children) {
      for (const child of root.children) walk(child);
    }
  }

  return parts.join('');
}

/**
 * Extract plain text from an HTML string.
 *
 * @param {string} htmlText - raw HTML input
 * @returns {Promise<string>} extracted plain text ('' on failure)
 */
export async function extractHtml(htmlText) {
  if (!htmlText) return '';
  try {
    const { load } = await import('cheerio');
    const $ = load(htmlText);
    return extractText($);
  } catch (err) {
    console.warn('[extractors:html] extractHtml error:', err?.message);
    return '';
  }
}

/**
 * Read an HTML file as utf-8 and extract its plain text.
 *
 * @param {string} absPath - absolute path to the file
 * @returns {Promise<string>} extracted plain text ('' on failure)
 */
export async function extractHtmlFile(absPath) {
  try {
    const raw = await fs.promises.readFile(absPath, 'utf8');
    if (raw == null || raw === '') return '';
    return await extractHtml(raw);
  } catch (err) {
    console.warn('[extractors:html] extractHtmlFile error:', err?.message);
    return '';
  }
}
