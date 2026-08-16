/**
 * @fileoverview BOM-aware text file reader (port of book-to-skill's
 * parsers/text.py read_text_file). Decodes UTF-8 / UTF-16 / UTF-32 by BOM when
 * present, else falls back through UTF-8 then latin-1.
 *
 * @module lib/rag/extractors/text
 */

import fs from 'node:fs';

/** UTF-16/32 manual decoders (Node's Buffer lacks native utf16be/utf32 support). */

/**
 * Decode big-endian UTF-16 bytes to a string.
 * @param {Buffer} data - Bytes (BOM excluded).
 * @returns {string}
 */
function decodeUtf16Be(data) {
  const codes = [];
  const count = Math.floor(data.length / 2);
  for (let i = 0; i < count; i += 1) {
    codes.push(data.readUInt16BE(i * 2));
  }
  return String.fromCharCode(...codes);
}

/**
 * Decode UTF-32 bytes (LE or BE) to a string, skipping lone surrogates.
 * @param {Buffer} data - Bytes (BOM excluded).
 * @param {boolean} littleEndian - Byte order.
 * @returns {string}
 */
function decodeUtf32(data, littleEndian) {
  const codes = [];
  const count = Math.floor(data.length / 4);
  for (let i = 0; i < count; i += 1) {
    const cp = littleEndian ? data.readUInt32LE(i * 4) : data.readUInt32BE(i * 4);
    if (cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) continue;
    codes.push(cp);
  }
  return String.fromCodePoint(...codes);
}

/** BOM signatures, longest first (UTF-32 LE starts with the UTF-16 LE BOM). */
const BOMS = [
  { bom: [0xef, 0xbb, 0xbf], decode: (d) => d.toString('utf8') },
  { bom: [0xff, 0xfe, 0x00, 0x00], decode: (d) => decodeUtf32(d, true) },
  { bom: [0x00, 0x00, 0xfe, 0xff], decode: (d) => decodeUtf32(d, false) },
  { bom: [0xff, 0xfe], decode: (d) => d.toString('utf16le') },
  { bom: [0xfe, 0xff], decode: (d) => decodeUtf16Be(d) },
];

/**
 * Read a text file, honoring BOMs and falling back through common encodings.
 * @param {string} absPath - Absolute file path.
 * @returns {string|null} Decoded text, or null on failure.
 */
export function readTextFile(absPath) {
  let data;
  try {
    data = fs.readFileSync(absPath);
  } catch (err) {
    console.warn(`[extractors:text] read failed for ${absPath}:`, err?.message);
    return null;
  }

  for (const { bom, decode } of BOMS) {
    const sig = Buffer.from(bom);
    if (data.subarray(0, sig.length).equals(sig)) {
      try {
        return decode(data.subarray(sig.length)).replace(/^\uFEFF/, '');
      } catch (err) {
        console.warn(`[extractors:text] decode failed for ${absPath}:`, err?.message);
        break;
      }
    }
  }

  for (const encoding of ['utf8', 'latin1']) {
    try {
      return data.toString(encoding);
    } catch (err) {
      console.warn(`[extractors:text] ${encoding} decode failed for ${absPath}:`, err?.message);
    }
  }
  return null;
}
