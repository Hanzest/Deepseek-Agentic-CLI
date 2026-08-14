/**
 * @fileoverview Invisible code-point sanitizer for the RAG extractors.
 *
 * Strips invisible Unicode code points used to hide document-borne prompt
 * injection. Groups the targets by attack shape so the reasoning behind each
 * entry stays reviewable (ported from src/book_to_skill/sanitize.py):
 *
 *  1. Zero-width and invisible spacers — render as nothing, so text between
 *     them is invisible to a human reading the page but plain to the model.
 *  2. Bidirectional formatting controls — the Trojan Source class
 *     (CVE-2021-42574): they change the order a human SEES, not the character
 *     sequence a model reads. Removing them makes rendered order match logical.
 *  3. Letters that are not format controls (so a category filter misses them)
 *     but still render as blank width.
 *  4. The Unicode tag block, now used to smuggle an entire ASCII payload as
 *     invisible "tag" characters.
 *
 * @module lib/rag/extractors/sanitize
 */

// 1. Zero-width and invisible spacers.
const ZERO_WIDTH_CODEPOINTS = new Set([
  0x200b, // ZERO WIDTH SPACE
  0x200c, // ZERO WIDTH NON-JOINER
  0x200d, // ZERO WIDTH JOINER
  0x2060, // WORD JOINER
  0xfeff, // ZERO WIDTH NO-BREAK SPACE / BOM outside position 0
  0x00ad, // SOFT HYPHEN — invisible except at a line break
  0x034f, // COMBINING GRAPHEME JOINER — no rendering effect at all
  0x180e, // MONGOLIAN VOWEL SEPARATOR
  0x2061, // FUNCTION APPLICATION
  0x2062, // INVISIBLE TIMES
  0x2063, // INVISIBLE SEPARATOR
  0x2064, // INVISIBLE PLUS
]);

// 2. Bidirectional formatting controls.
const BIDI_CONTROL_CODEPOINTS = new Set([
  0x200e, // LEFT-TO-RIGHT MARK
  0x200f, // RIGHT-TO-LEFT MARK
  0x061c, // ARABIC LETTER MARK
  0x202a, // LEFT-TO-RIGHT EMBEDDING
  0x202b, // RIGHT-TO-LEFT EMBEDDING
  0x202c, // POP DIRECTIONAL FORMATTING
  0x202d, // LEFT-TO-RIGHT OVERRIDE
  0x202e, // RIGHT-TO-LEFT OVERRIDE
  0x2066, // LEFT-TO-RIGHT ISOLATE
  0x2067, // RIGHT-TO-LEFT ISOLATE
  0x2068, // FIRST STRONG ISOLATE
  0x2069, // POP DIRECTIONAL ISOLATE
]);

// 3. Invisible letters that survive whitespace normalisation.
const INVISIBLE_LETTER_CODEPOINTS = new Set([
  0x115f, // HANGUL CHOSEONG FILLER
  0x1160, // HANGUL JUNGSEONG FILLER
  0x3164, // HANGUL FILLER
  0xffa0, // HALFWIDTH HANGUL FILLER
]);

const INVISIBLE_CODEPOINTS = new Set([
  ...ZERO_WIDTH_CODEPOINTS,
  ...BIDI_CONTROL_CODEPOINTS,
  ...INVISIBLE_LETTER_CODEPOINTS,
]);

// 4. The Unicode tag block.
const TAG_BLOCK_START = 0xe0000;
const TAG_BLOCK_END = 0xe007f;

/**
 * Return true if the code point renders as nothing and should be stripped.
 *
 * @param {number} codepoint - UTF-16 code point value.
 * @returns {boolean} True when the code point is invisible / a tag character.
 */
export function isInvisibleCodepoint(codepoint) {
  return (
    INVISIBLE_CODEPOINTS.has(codepoint) ||
    (codepoint >= TAG_BLOCK_START && codepoint <= TAG_BLOCK_END)
  );
}

/**
 * Remove invisible code points used for document-borne prompt injection.
 *
 * Iterates full code points (not UTF-16 code units) so astral characters such
 * as emoji or tag-block glyphs are never torn across a surrogate pair. Never
 * throws: on any unexpected error the input is returned unchanged.
 *
 * @param {string} text - Raw text to sanitize.
 * @returns {string} Sanitized text with all invisible code points removed.
 */
export function sanitizeText(text) {
  try {
    if (typeof text !== 'string' || text.length === 0) return text;
    let kept = '';
    for (const char of text) {
      const codePoint = char.codePointAt(0);
      if (!isInvisibleCodepoint(codePoint)) kept += char;
    }
    return kept;
  } catch {
    return text;
  }
}
