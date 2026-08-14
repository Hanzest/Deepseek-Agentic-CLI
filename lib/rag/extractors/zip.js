/**
 * @fileoverview Minimal, dependency-free ZIP reader for the RAG extractors.
 *
 * Parses the End of Central Directory (EOCD) + central directory to enumerate
 * entries, and extracts stored (method 0) and deflated (method 8) entries using
 * node:zlib. Purpose-built for EPUB / DOCX (both plain ZIP containers); Zip64
 * and exotic compression methods are out of scope (book files stay < 4 GB).
 *
 * @module lib/rag/extractors/zip
 */

import zlib from 'node:zlib';

const EOCD_SIG = 0x06054b50; // PK\x05\x06
const CD_SIG = 0x02014b50;   // PK\x01\x02
const LOCAL_SIG = 0x04034b50; // PK\x03\x04

/**
 * Locate the End of Central Directory record (scan backwards; comment ≤ 64 KiB).
 * @param {Buffer} buffer - Whole ZIP file bytes.
 * @returns {{cdOffset: number, cdCount: number}|null} Central directory info.
 */
function findEocd(buffer) {
  const min = Math.max(0, buffer.length - 22 - 0xffff);
  for (let i = buffer.length - 22; i >= min; i -= 1) {
    if (buffer.readUInt32LE(i) === EOCD_SIG) {
      return {
        cdCount: buffer.readUInt16LE(i + 10),
        cdOffset: buffer.readUInt32LE(i + 16),
      };
    }
  }
  return null;
}

/**
 * Enumerate the ZIP's central directory entries.
 * @param {Buffer} buffer - Whole ZIP file bytes.
 * @returns {Array<{name: string, compressionMethod: number, compressedSize: number, uncompressedSize: number, localOffset: number}>}
 */
export function listEntries(buffer) {
  const eocd = findEocd(buffer);
  if (!eocd) return [];
  const { cdOffset, cdCount } = eocd;
  const entries = [];
  let offset = cdOffset;
  for (let i = 0; i < cdCount; i += 1) {
    if (offset + 46 > buffer.length || buffer.readUInt32LE(offset) !== CD_SIG) break;
    const compressionMethod = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const nameLen = buffer.readUInt16LE(offset + 28);
    const extraLen = buffer.readUInt16LE(offset + 30);
    const commentLen = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.toString('utf8', offset + 46, offset + 46 + nameLen);
    entries.push({ name, compressionMethod, compressedSize, uncompressedSize, localOffset });
    offset += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

/**
 * Read one entry's decompressed bytes (stored or deflate).
 * @param {Buffer} buffer - Whole ZIP file bytes.
 * @param {string} name - Exact entry name (case-sensitive).
 * @returns {Buffer|null} Decompressed bytes, or null when missing/unsupported.
 */
export function readEntry(buffer, name) {
  const entry = listEntries(buffer).find((e) => e.name === name);
  if (!entry) return null;
  const local = entry.localOffset;
  if (local + 30 > buffer.length || buffer.readUInt32LE(local) !== LOCAL_SIG) return null;
  const nameLen = buffer.readUInt16LE(local + 26);
  const extraLen = buffer.readUInt16LE(local + 28);
  const dataStart = local + 30 + nameLen + extraLen;
  const compressed = buffer.subarray(dataStart, dataStart + entry.compressedSize);
  try {
    if (entry.compressionMethod === 0) return Buffer.from(compressed);
    if (entry.compressionMethod === 8) return zlib.inflateRawSync(compressed);
  } catch {
    return null;
  }
  return null;
}

/**
 * Read one entry as UTF-8 text.
 * @param {Buffer} buffer - Whole ZIP file bytes.
 * @param {string} name - Exact entry name.
 * @returns {string|null} Decoded text, or null when missing/unsupported.
 */
export function readEntryText(buffer, name) {
  const bytes = readEntry(buffer, name);
  if (!bytes) return null;
  return bytes.toString('utf8');
}
