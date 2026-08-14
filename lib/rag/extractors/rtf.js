// RTF text extractor (regex-based fallback port of src/book_to_skill/parsers/rtf.py).
//
// @module rtf
import * as fs from "node:fs/promises";

// RTF unicode escape: \uN (signed decimal) followed by its fallback char(s).
// Decode the code point and drop the standard single fallback — a \'XX hex byte
// or a literal "?". Assumes the default \uc1 (one fallback char); \ucN directives
// and multi-char/group fallbacks are not parsed (best-effort fallback only).
const _RTF_UNICODE = /\\u(-?\d+)[ ]?(?:\\'[0-9a-fA-F]{2}|\?)?/g;

function _rtfUnicodeRepl(_full, p1) {
  // NOTE: String.replace passes the full matched string first; the capture
  // group is the SECOND argument (Python's match.group(1) == p1 here).
  // RTF uses signed 16-bit; wrap negatives.
  let cp = parseInt(p1, 10) % 0x10000;
  if (cp < 0) cp += 0x10000;
  // NUL and lone surrogates: unwanted in text.
  if (cp === 0 || (cp >= 0xd800 && cp <= 0xdfff)) return "";
  return String.fromCharCode(cp);
}

// RTF groups whose contents are metadata or formatting tables rather than
// document text. Stripping only the control words inside them (what the cleanup
// below does) leaves the residue behind: font and style *names*, the generator
// string, and the \info title/author all end up in the extracted book text.
const _SKIP_DESTINATIONS = new Set([
  "fonttbl", // {\fonttbl{\f0\fnil Calibri;}}   -> "Calibri;"
  "colortbl", // {\colortbl;\red255...;}          -> ";;;"
  "stylesheet", // {\stylesheet{\s0 Normal;}}       -> "Normal;"
  "info", // {\info{\title X}{\author Y}}     -> "XY"
  "listtable",
  "listoverridetable",
  "revtbl",
  "rsidtbl",
  "latentstyles",
  "datastore",
  "themedata",
  "colorschememapping",
  "filetbl",
  "xmlnstbl",
  "pgptbl",
  "protusertbl",
  "userprops",
  "docvar",
  "pict",
  "objdata", // binary image / OLE payloads as hex text
  "bkmkstart",
  "bkmkend",
]);

// The first control word of a group, allowing the "\*" ignorable-destination
// prefix: "{\fonttbl", "{\*\generator", "{\*\bkmkstart".
const _GROUP_DESTINATION = /\\\*?\\?([a-zA-Z]+)/;

function _stripDestinationGroups(raw) {
  // Remove RTF groups that hold no document text. Tracks brace depth so a whole
  // group is dropped, not just its control words. Per the RTF spec a reader that
  // does not understand a \* destination must skip the entire group, which also
  // handles \*\generator and any vendor extension without naming it. Escaped
  // \{ / \} / \\ are not treated as delimiters.
  const out = [];
  let index = 0;
  let depth = 0;
  let skipAtDepth = 0; // non-zero while inside a skipped group
  const length = raw.length;

  while (index < length) {
    const char = raw[index];

    // Escaped literal: "\{", "\}", "\\" are text, never group delimiters.
    if (char === "\\" && index + 1 < length && "{}\\".includes(raw[index + 1])) {
      if (!skipAtDepth) out.push(raw.slice(index, index + 2));
      index += 2;
      continue;
    }

    if (char === "{") {
      depth += 1;
      if (!skipAtDepth) {
        const m = _GROUP_DESTINATION.exec(raw.slice(index + 1));
        const ignorable = raw.startsWith("{\\*", index);
        if (ignorable || (m && _SKIP_DESTINATIONS.has(m[1]))) {
          skipAtDepth = depth;
        } else {
          out.push(char);
        }
      }
      index += 1;
      continue;
    }

    if (char === "}") {
      if (skipAtDepth && depth === skipAtDepth) {
        skipAtDepth = 0;
      } else if (!skipAtDepth) {
        out.push(char);
      }
      depth -= 1;
      index += 1;
      continue;
    }

    if (!skipAtDepth) out.push(char);
    index += 1;
  }

  if (skipAtDepth) {
    // Unterminated destination group: the file is malformed and everything after
    // the unclosed brace was just dropped, which could be the whole book. Leaking
    // some metadata residue is the lesser evil, so fall back to the unscanned
    // text rather than returning a truncated document.
    return raw;
  }

  return out.join("");
}

/**
 * Strip RTF control markup from raw RTF text, returning the plain document text.
 * @param {string} raw
 * @returns {string}
 */
function stripRtfFallback(raw) {
  // Drop metadata/table groups wholesale first, so their contents never reach the
  // control-word cleanup that would otherwise strip the markup and leave the
  // names behind as if they were prose.
  raw = _stripDestinationGroups(raw);
  // Decode \uN escapes first.
  raw = raw.replace(_RTF_UNICODE, _rtfUnicodeRepl);
  raw = raw.replace(/\\'[0-9a-fA-F]{2}/g, " ");
  raw = raw.replace(/\\par[d]?/g, "\n");
  raw = raw.replace(/\\tab/g, "\t");
  // Park the three escaped literals ("\\", "\{", "\}") on placeholders before the
  // sweeps below, which would otherwise strip the backslash as a control symbol
  // and then delete the brace along with the real group delimiters — leaving a
  // stray "\" where the book said "{a, b}". Longest escape first.
  raw = raw
    .replace(/\\\\/g, "\x01")
    .replace(/\\\{/g, "\x02")
    .replace(/\\\}/g, "\x03");
  raw = raw.replace(/\\[a-zA-Z]+-?\d* ?/g, "");
  raw = raw.replace(/[{}]/g, "");
  // Restore the parked escaped literals (split/join avoids control-char regexes).
  raw = raw.split("\x01").join("\\").split("\x02").join("{").split("\x03").join("}");
  // Collapse blank lines (python passes collapse the blank runs; emulate here).
  raw = raw.replace(/\n\s*\n/g, "\n\n");
  return decodeHtmlEntities(raw);
}

function decodeHtmlEntities(str) {
  return str
    .replace(/&nbsp;/g, "\u00a0")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

/**
 * Extract plain text from RTF content.
 * @param {string} text
 * @returns {string}
 */
export function extractRtf(text) {
  return stripRtfFallback(String(text ?? ""));
}

/**
 * Extract plain text from an RTF file on disk.
 * @param {string} absPath
 * @returns {Promise<string>} Resolves to '' on failure.
 */
export async function extractRtfFile(absPath) {
  try {
    const text = await fs.readFile(absPath, "utf8");
    return extractRtf(text);
  } catch (err) {
    console.warn("[extractors:rtf] " + (err?.message ?? err));
    return "";
  }
}
