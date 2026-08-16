/**
 * @fileoverview Structure-aware document chunker for the RAG pipeline.
 *
 * Produces canonical chunks with rich metadata (line ranges, section
 * hierarchy, tags) suitable for both dense (embedding) and sparse (BM25)
 * retrieval.
 *
 * Strategy (in priority order):
 *   1. Markdown heading boundaries (H1-H3) split top-level sections.
 *   2. Paragraphs (blank-line delimited) split each section.
 *   3. If a section is heading-less and an embed function is available,
 *      consecutive paragraphs are semantically segmented at topic shifts
 *      (cosineSim < 0.35).
 *   4. Paragraphs are assembled into ~1000-char chunks with a small overlap
 *      window carrying the tail of the previous chunk for continuity.
 *
 * Two entry points:
 *   - chunkText()      synchronous  (embedFn must return vectors directly)
 *   - chunkTextAsync() asynchronous (embedFn may return a Promise)
 *
 * @module chunker
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { buildId } from './metadata.js';

/** Target chunk size in characters. */
const TARGET_CHUNK_SIZE = 1000;
/** Overlap window (characters) preserved from the previous chunk. */
const OVERLAP_SIZE = 120;
/** Semantic similarity cutoff below which consecutive paragraphs diverge. */
const SEMANTIC_THRESHOLD = 0.35;

/**
 * Compute the cosine similarity between two equal-length numeric vectors.
 * Returns 0 when vectors are empty or any vector is all zeros.
 *
 * @param {number[]} a First vector.
 * @param {number[]} b Second vector.
 * @returns {number} Cosine similarity clamped to [0, 1].
 */
export function cosineSim(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length === 0 || a.length !== b.length) {
    return 0;
  }
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) {
    return 0;
  }
  return Math.max(0, Math.min(1, dot / (Math.sqrt(normA) * Math.sqrt(normB))));
}

/**
 * Compute the SHA-256 hex digest of a file's bytes (synchronous fallback).
 * @param {string} filePath Absolute path to the file.
 * @returns {string} Hex digest, or '' on failure.
 */
function hashFileOnDisk(filePath) {
  try {
    return createHash('sha256').update(readFileSync(filePath)).digest('hex');
  } catch {
    return '';
  }
}

/**
 * Match a markdown heading line (H1-H6).
 * @param {string} line A single line (newline stripped).
 * @returns {{level: number, title: string} | null} Parsed heading or null.
 */
function matchHeading(line) {
  const m = /^(#{1,6})\s+(.+)$/.exec(line);
  if (!m) {
    return null;
  }
  return { level: m[1].length, title: m[2].trim() };
}

/**
 * Extract tags from a text block: bare `#word` tokens and `[tag]` tokens.
 * Markdown headings are skipped so `# Heading` is not misread as a tag.
 *
 * @param {string} text The block to scan.
 * @returns {string[]} Deduplicated, sorted tag list.
 */
function extractTags(text) {
  const tags = new Set();
  const tokenRe = /(?:^|\s)#([A-Za-z0-9_][A-Za-z0-9_-]*)|\[([A-Za-z0-9_][A-Za-z0-9_-]*)\]/g;
  let m;
  while ((m = tokenRe.exec(text)) !== null) {
    const tag = m[1] || m[2];
    if (tag && !/^\d+$/.test(tag)) {
      tags.add(tag.toLowerCase());
    }
  }
  return [...tags].sort();
}

/**
 * Compute the namespace (subdirectory) for a file relative to its layer root.
 * Mirrors the logic in metadata.js (which keeps it private).
 *
 * @param {string} filePath Absolute file path.
 * @param {string|undefined} layerRoot Absolute layer root directory.
 * @returns {string} Forward-slash relative dir, '' if at root or root absent.
 */
function computeNamespace(filePath, layerRoot) {
  if (!layerRoot) return '';
  const rel = path.relative(layerRoot, path.dirname(filePath));
  if (!rel || rel === '.' || rel.startsWith('..')) return '';
  return rel.split(path.sep).join('/');
}

/**
 * Semantically segment paragraphs within a heading-less section using the
 * supplied embedding function (synchronous contract). Consecutive pairs are
 * embedded and cut where cosine similarity < threshold. Falls back to the
 * original paragraph list on any failure.
 *
 * @param {string[]} paragraphs Paragraph bodies.
 * @param {Function} embedFn Function (string) -> number[].
 * @returns {string[]} Merged paragraph blocks.
 */
function semanticSegmentSync(paragraphs, embedFn) {
  if (!embedFn || paragraphs.length < 3) {
    return paragraphs;
  }
  try {
    const groups = [[]];
    let prevEmbedding = null;
    for (const para of paragraphs) {
      const vec = embedFn(para);
      if (!Array.isArray(vec) || vec.length === 0) {
        return paragraphs;
      }
      if (prevEmbedding !== null && cosineSim(prevEmbedding, vec) < SEMANTIC_THRESHOLD) {
        groups.push([]);
      }
      groups[groups.length - 1].push(para);
      prevEmbedding = vec;
    }
    return groups
      .map((g) => g.join('\n\n').trim())
      .filter((g) => g.length > 0);
  } catch {
    return paragraphs;
  }
}

/**
 * Asynchronous variant of semanticSegmentSync for Promise-returning embedders.
 * @param {string[]} paragraphs Paragraph bodies.
 * @param {Function} embedFn Function (string) -> Promise<number[]>.
 * @returns {Promise<string[]>} Merged paragraph blocks.
 */
async function semanticSegmentAsync(paragraphs, embedFn) {
  if (!embedFn || paragraphs.length < 3) {
    return paragraphs;
  }
  try {
    const groups = [[]];
    let prevEmbedding = null;
    for (const para of paragraphs) {
      const vec = await embedFn(para);
      if (!Array.isArray(vec) || vec.length === 0) {
        return paragraphs;
      }
      if (prevEmbedding !== null && cosineSim(prevEmbedding, vec) < SEMANTIC_THRESHOLD) {
        groups.push([]);
      }
      groups[groups.length - 1].push(para);
      prevEmbedding = vec;
    }
    return groups
      .map((g) => g.join('\n\n').trim())
      .filter((g) => g.length > 0);
  } catch {
    return paragraphs;
  }
}

/**
 * Split blocks that exceed a comfortable paragraph length into smaller
 * sub-blocks at line boundaries (PDF-extracted text often has few blank-line
 * paragraph breaks, so a "paragraph" can be an entire page).
 *
 * @param {string[]} blocks Paragraph blocks.
 * @param {number} [maxLen=1000] Target max length per sub-block.
 * @returns {string[]} Blocks with oversized ones split by lines.
 */
function splitOversizedBlocks(blocks, maxLen = 1000) {
  const out = [];
  for (const b of blocks) {
    if (b.length <= maxLen + 300) {
      out.push(b);
      continue;
    }
    const lines = b.split('\n');
    let cur = '';
    for (const ln of lines) {
      if (cur && (cur + '\n' + ln).length > maxLen) {
        out.push(cur);
        cur = ln;
      } else {
        cur = cur ? cur + '\n' + ln : ln;
      }
    }
    if (cur) out.push(cur);
  }
  return out;
}

/**
 * Core chunking pipeline shared by the sync and async entry points.
 *
 * @param {string} text Raw file content.
 * @param {object} options
 * @param {string} options.filePath Absolute path to the source file.
 * @param {string} [options.layer='workspace'] Layer ('knowledge' | 'workspace').
 * @param {string|null} [options.language=null] Language for code chunks.
 * @param {string|null} [options.layerRoot=null] Root of the watched layer folder.
 * @param {string|null} [options.fileHash=null] Precomputed SHA-256 of the file.
 * @param {Function} segmenter (paragraphs, embedFn) -> blocks.
 * @param {Function|null} [options.embedFn=null] Optional embedding function.
 * @returns {Array<object>} Canonical chunk objects.
 */
function buildChunks(text, options, segmenter, asyncMode) {
  const {
    filePath,
    layer = 'workspace',
    language = null,
    layerRoot = null,
    fileHash = null,
    embedFn = null,
  } = options;

  // Never throw: empty or missing input yields no chunks.
  if (!text || text.trim().length === 0 || !filePath) {
    return [];
  }

  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const timestamp = Date.now();
  const hash = fileHash || hashFileOnDisk(filePath);

  /**
   * Parse the document into sections. Each section captures its heading stack
   * (H1-H6), the leading heading text if any, and its line span.
   */
  const sections = [];
  let headingStack = [];
  let sectionStart = 0;
  let sectionHeading = null;
  let sectionHeaders = [];

  const pushSection = (endIdx) => {
    sections.push({
      startIdx: sectionStart,
      endIdx: endIdx - 1, // exclusive end -> last owned line index
      heading: sectionHeading,
      headers: sectionHeaders ? [...sectionHeaders] : [],
    });
  };

  for (let i = 0; i < lines.length; i += 1) {
    if (!/^#{1,6}\s+/.test(lines[i])) {
      continue;
    }
    const parsed = matchHeading(lines[i]);
    if (!parsed) {
      continue;
    }
    if (parsed.level <= 3) {
      // Top-level section split on H1-H3.
      if (sectionStart < i) {
        pushSection(i);
      }
      sectionStart = i;
      sectionHeading = parsed;
      sectionHeaders = [...headingStack, parsed.title];
    }
    // Maintain a full H1-H6 stack.
    headingStack = headingStack.filter((h) => h.level < parsed.level);
    headingStack.push({ level: parsed.level, title: parsed.title });
  }

  // Flush the final open section.
  if (sectionStart < lines.length) {
    pushSection(lines.length);
  }

  // Fallback single section when the document had no H1-H3 heading.
  if (sections.length === 0) {
    sections.push({
      startIdx: 0,
      endIdx: lines.length - 1,
      heading: null,
      headers: [],
    });
  }

  /**
   * Group a section's paragraph lines by blank-line boundaries, keeping the
   * original line indices so line_start/line_end can be computed precisely.
   */
  const paragraphsIn = (startIdx, endIdx) => {
    const paras = [];
    let buffer = [];
    let bufferStart = -1;
    for (let i = startIdx; i <= endIdx; i += 1) {
      const lineText = lines[i];
      if (lineText.trim().length === 0) {
        if (buffer.length > 0) {
          paras.push({ text: buffer.join('\n'), startLine: bufferStart, endLine: i - 1 });
          buffer = [];
        }
        continue;
      }
      if (buffer.length === 0) {
        bufferStart = i;
      }
      buffer.push(lineText);
    }
    if (buffer.length > 0) {
      paras.push({ text: buffer.join('\n'), startLine: bufferStart, endLine: endIdx });
    }
    return paras;
  };

  const chunks = [];

  /** Emit canonical chunks for one section given its resolved blocks. */
  const emitSection = (section, rawBlocks) => {
    // Skip the leading heading line(s) so the heading is not duplicated in
    // the body; it is re-injected once as a header prefix on the first chunk.
    const bodyStart = section.heading ? section.startIdx + 1 : section.startIdx;
    const blocks = splitOversizedBlocks(rawBlocks);

    // Map each block back to its first source line (0-based index).
    const blockSpans = blocks.map((blockText) => {
      const firstLineText = blockText.split('\n', 1)[0].trim();
      for (let i = bodyStart; i <= section.endIdx; i += 1) {
        if (lines[i].trim() === firstLineText) {
          return i;
        }
      }
      return -1;
    });

    // Assemble character-bounded chunks with an overlap window.
    const assembled = [];
    let current = '';
    let currentFirstBlock = -1;
    let currentLastBlock = -1;

    const flushAssembled = () => {
      const body = current.trim();
      if (body.length === 0) {
        return;
      }
      assembled.push({ text: body, firstBlock: currentFirstBlock, lastBlock: currentLastBlock });
    };

    for (let b = 0; b < blocks.length; b += 1) {
      const block = (blocks[b] || '').trim();
      if (!block) {
        continue;
      }
      if (current.length === 0) {
        current = block;
        currentFirstBlock = b;
        currentLastBlock = b;
        continue;
      }
      const candidate = current + '\n\n' + block;
      if (candidate.length <= TARGET_CHUNK_SIZE) {
        current = candidate;
        currentLastBlock = b;
      } else {
        flushAssembled();
        // Carry the overlap tail of the flushed chunk into the next one.
        const tail = current.trim().slice(-OVERLAP_SIZE);
        current = (tail.length > 0 ? tail + '\n\n' : '') + block;
        currentFirstBlock = b;
        currentLastBlock = b;
      }
    }
    flushAssembled();

    // Prepend the leading section heading into the first assembled chunk.
    if (section.heading && assembled.length > 0) {
      const headerPrefix = `${'#'.repeat(section.heading.level)} ${section.heading.title}\n\n`;
      assembled[0] = { ...assembled[0], text: headerPrefix + assembled[0].text };
    }

    for (let c = 0; c < assembled.length; c += 1) {
      const chunkTextBody = assembled[c].text.trim();
      if (!chunkTextBody) {
        continue;
      }

      const tags = extractTags(chunkTextBody);
      if (section.heading) {
        for (const word of section.heading.title.split(/\s+/).filter(Boolean)) {
          tags.push(word.toLowerCase());
        }
      }

      // Resolve the source line span from the leading and trailing blocks.
      const firstBlock = assembled[c].firstBlock;
      const lastBlock = assembled[c].lastBlock;
      let startIdx = bodyStart;
      let endIdx = section.endIdx;
      if (firstBlock >= 0 && firstBlock < blockSpans.length && blockSpans[firstBlock] >= 0) {
        startIdx = blockSpans[firstBlock];
      }
      if (lastBlock >= 0 && lastBlock < blockSpans.length) {
        const lastStart = blockSpans[lastBlock] >= 0 ? blockSpans[lastBlock] : startIdx;
        const lastLen = blocks[lastBlock] ? blocks[lastBlock].split('\n').length : 1;
        endIdx = Math.min(section.endIdx, lastStart + lastLen - 1);
      }

      const resolvedStart = startIdx + 1; // 1-based
      const resolvedEnd = endIdx + 1;     // 1-based

      chunks.push({
        id: buildId(filePath, resolvedStart, resolvedEnd),
        layer,
        namespace: computeNamespace(filePath, layerRoot),
        file_path: path.resolve(filePath),
        line_start: resolvedStart,
        line_end: resolvedEnd,
        timestamp,
        section_headers: section.headers,
        language,
        tags: [...new Set(tags)],
        text: chunkTextBody,
        file_hash: hash,
      });
    }
  };

  const shouldSegment = (section, bodyTexts) =>
    !section.heading && embedFn && bodyTexts.length >= 3;

  // Pre-scan sections (shared by both modes).
  const work = [];
  for (const section of sections) {
    const bodyStart = section.heading ? section.startIdx + 1 : section.startIdx;
    const paragraphs = paragraphsIn(bodyStart, section.endIdx);
    if (paragraphs.length === 0) {
      continue;
    }
    work.push({ section, bodyTexts: paragraphs.map((p) => p.text.trim()) });
  }

  const finish = () => {
    // Final sort by source order (stable).
    chunks.sort((a, b) => a.line_start - b.line_start || a.line_end - b.line_end);
    return chunks;
  };

  if (asyncMode) {
    // Async segmentation (embedFn returns Promises). Resolve each section's
    // blocks, then emit. Never throws on segmenter failure.
    return Promise.all(work.map(({ section, bodyTexts }) => {
      const seg = shouldSegment(section, bodyTexts)
        ? Promise.resolve(segmenter(bodyTexts, embedFn)).catch(() => bodyTexts)
        : Promise.resolve(bodyTexts);
      return seg.then((blocks) => {
        emitSection(section, blocks);
      });
    })).then(finish);
  }

  // Sync segmentation (embedFn returns vectors directly).
  for (const { section, bodyTexts } of work) {
    const blocks = shouldSegment(section, bodyTexts)
      ? segmenter(bodyTexts, embedFn)
      : bodyTexts;
    emitSection(section, blocks);
  }
  return finish();
}

/**
 * Synchronous chunking entry point. `embedFn` must return vectors directly
 * (number[]); for async embedders use chunkTextAsync().
 *
 * @param {string} text Raw file content.
 * @param {object} options See buildChunks().
 * @returns {Array<object>} Canonical chunk objects.
 */
export function chunkText(text, options = {}) {
  return buildChunks(text, options, semanticSegmentSync, false);
}

/**
 * Asynchronous chunking entry point for Promise-returning embedders
 * (e.g. the ONNX embedder). Falls back gracefully to structural chunking
 * when embeddings fail.
 *
 * @param {string} text Raw file content.
 * @param {object} options See buildChunks().
 * @returns {Promise<Array<object>>} Canonical chunk objects.
 */
export async function chunkTextAsync(text, options = {}) {
  return buildChunks(text, options, semanticSegmentAsync, true);
}
