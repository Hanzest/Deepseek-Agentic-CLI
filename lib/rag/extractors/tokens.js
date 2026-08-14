// @ts-check

/**
 * CJK-aware token estimator, a faithful port of book_to_skill's estimate_tokens.
 * Dependency-free and deterministic so the same text always yields the same number.
 *
 * Constants mirror src/book_to_skill/config.py.
 */
const WORDS_PER_TOKEN = 0.75; // approximate (Latin / whitespace-delimited text)
const CJK_CHARS_PER_TOKEN = 1.5; // approximate for cl100k-style tokenizers

/**
 * CJK codepoints mirrored from src/book_to_skill/utils.py (_CJK_RE). Ideographs
 * + extensions, kana, hangul, CJK punctuation, fullwidth forms, and Planes 2-3
 * (U+20000-U+3FFFF) supplementary ideographic planes. These are not
 * whitespace-delimited, so word-splitting collapses them to a handful of tokens.
 */
const CJK_RE =
  /[\u3000-\u303F\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uAC00-\uD7AF\uF900-\uFAFF\uFF00-\uFFEF\u{20000}-\u{3FFFF}]/gu;

/**
 * True when the text contains any CJK character.
 * @param {unknown} text
 * @returns {boolean}
 */
export function hasCJK(text) {
  if (typeof text !== 'string' || !text) return false;
  return CJK_RE.test(text);
}

/**
 * Deterministic heuristic estimate of the token count of `text`.
 *
 * Latin / whitespace-delimited text is counted by words (words / WORDS_PER_TOKEN).
 * CJK characters are counted directly against CJK_CHARS_PER_TOKEN because they
 * carry little or no whitespace. Non-string input returns 0.
 *
 * @param {unknown} text
 * @returns {number}
 */
export function estimateTokensCJK(text) {
  if (typeof text !== 'string' || !text) return 0;
  const cjk = CJK_RE.test(text) ? text.match(CJK_RE).length : 0;
  if (!cjk) {
    return Math.trunc(text.split(/\s+/).filter(Boolean).length / WORDS_PER_TOKEN);
  }
  const latinWords = text.replace(CJK_RE, ' ').split(/\s+/).filter(Boolean).length;
  return Math.trunc(latinWords / WORDS_PER_TOKEN + cjk / CJK_CHARS_PER_TOKEN);
}
