/**
 * BM25 ranking implementation with an in-memory inverted index.
 *
 * @module lib/rag/bm25
 */

import fs from 'node:fs';
import path from 'node:path';

/** Default stopword set used when `useStopwords` is enabled. */
const DEFAULT_STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'has',
  'he', 'in', 'is', 'it', 'its', 'of', 'on', 'that', 'the', 'to', 'was',
  'were', 'will', 'with',
]);

/**
 * Tokenizes text for BM25 indexing.
 *
 * Normalization: lowercase, strip non-alphanumeric characters, split on
 * whitespace, and drop tokens shorter than 2 characters.
 *
 * @param {string} text - The raw input text.
 * @param {{useStopwords?: boolean}} [options] - Options controlling tokenization.
 * @param {boolean} [options.useStopwords=true] - Whether to filter stopwords.
 * @returns {string[]} The list of tokens.
 */
export function tokenize(text, { useStopwords = true } = {}) {
  if (typeof text !== 'string' || text.length === 0) return [];

  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((token) => token.length > 1);

  if (!useStopwords) return tokens;

  return tokens.filter((token) => !DEFAULT_STOPWORDS.has(token));
}

/**
 * A BM25 (Best Matching 25) index supporting incremental document
 * add/remove, bulk rebuild, and ranked retrieval.
 */
export class BM25Index {
  /**
   * @param {number} [k1=1.5] - Term frequency saturation parameter.
   * @param {number} [b=0.75] - Document length normalization parameter.
   */
  constructor(k1 = 1.5, b = 0.75) {
    this.k1 = k1;
    this.b = b;
    this.docFreq = new Map(); // term -> number of docs containing it
    this.postings = new Map(); // term -> Map(docId -> term freq)
    this.docLen = new Map(); // docId -> token count
    this.totalDocs = 0;
    this.avgdl = 0;
    this.documents = new Map(); // docId -> { text, tokens }
    this._postingsBuilt = false;
  }

  /**
   * Initializes the index from a list of chunks.
   *
   * @param {Array<{id: string|number, text: string}>} [chunks=[]] - Chunks to index.
   * @returns {BM25Index} This index for chaining.
   */
  init(chunks = []) {
    return this.rebuild(chunks);
  }

  /**
   * Adds a single document to the index.
   *
   * @param {string|number} id - Unique document identifier.
   * @param {string} text - Document text.
   * @returns {BM25Index} This index for chaining.
   */
  addDocument(id, text) {
    if (this.documents.has(id)) {
      // Replace existing document to keep docFreq accurate.
      this.removeDocument(id);
    }

    const tokens = tokenize(text);
    this.documents.set(id, { text, tokens });
    this.docLen.set(id, tokens.length);
    this.totalDocs += 1;
    this._postingsBuilt = false;
    this._recomputeAvgdl();

    return this;
  }

  /**
   * Removes a document from the index by id.
   *
   * @param {string|number} id - Document identifier to remove.
   * @returns {boolean} `true` if the document existed and was removed.
   */
  removeDocument(id) {
    if (!this.documents.has(id)) return false;

    this.documents.delete(id);
    this.docLen.delete(id);
    if (this.totalDocs > 0) this.totalDocs -= 1;
    this._postingsBuilt = false;
    this._recomputeAvgdl();

    return true;
  }

  /**
   * Replaces the entire index contents with the given chunks.
   *
   * @param {Array<{id: string|number, text: string}>} [chunks=[]] - Chunks to index.
   * @returns {BM25Index} This index for chaining.
   */
  rebuild(chunks = []) {
    this.docFreq.clear();
    this.postings.clear();
    this.docLen.clear();
    this.documents.clear();
    this.totalDocs = 0;
    this.avgdl = 0;
    this._postingsBuilt = true;

    for (const chunk of chunks) {
      if (!chunk || chunk.id === undefined || chunk.id === null) continue;
      this.addDocument(chunk.id, chunk.text ?? '');
    }

    return this;
  }

  /**
   * Searches the index for documents relevant to the query.
   *
   * @param {string} query - The search query text.
   * @param {{limit?: number, useStopwords?: boolean}} [options] - Search options.
   * @param {number} [options.limit=10] - Maximum number of results.
   * @param {boolean} [options.useStopwords=true] - Whether to apply stopword filtering.
   * @returns {Array<{id: string|number, score: number}>} Ranked results, desc by score.
   */
  search(query, { limit = 10, useStopwords = true } = {}) {
    if (this.totalDocs === 0) return [];

    this._buildPostings();

    const queryTokens = tokenize(query, { useStopwords });
    if (queryTokens.length === 0) return [];

    const N = this.totalDocs;
    const avgdl = this.avgdl || 1; // guard div-by-zero
    const scoreMap = new Map();

    for (const term of queryTokens) {
      const df = this.docFreq.get(term) || 0;
      const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));
      if (idf <= 0) continue;

      for (const [docId, tf] of this.postings.get(term) ?? []) {
        const dl = this.docLen.get(docId) || 0;
        const denom = tf + this.k1 * (1 - this.b + this.b * (dl / avgdl));
        const score = idf * ((tf * (this.k1 + 1)) / (denom || 1));
        scoreMap.set(docId, (scoreMap.get(docId) || 0) + score);
      }
    }

    const results = [...scoreMap.entries()]
      .map(([id, score]) => ({ id, score }))
      .sort((a, b) => b.score - a.score || this._idCompare(a.id, b.id));

    return limit > 0 ? results.slice(0, limit) : results;
  }

  /**
   * Builds the inverted index (postings) and the document-frequency map.
   * @private
   */
  _buildPostings() {
    if (this._postingsBuilt) return;

    this.postings.clear();
    this.docFreq.clear();

    for (const [docId, { tokens }] of this.documents) {
      const tfMap = new Map();
      for (const term of tokens) {
        tfMap.set(term, (tfMap.get(term) || 0) + 1);
      }
      for (const [term, tf] of tfMap) {
        if (!this.postings.has(term)) this.postings.set(term, new Map());
        this.postings.get(term).set(docId, tf);
        this.docFreq.set(term, (this.docFreq.get(term) || 0) + 1);
      }
    }
    this._postingsBuilt = true;
  }

  /**
   * Recomputes the average document length.
   * @private
   */
  _recomputeAvgdl() {
    if (this.totalDocs === 0) {
      this.avgdl = 0;
      return;
    }
    let total = 0;
    for (const len of this.docLen.values()) total += len;
    this.avgdl = total / this.totalDocs;
  }

  /**
   * Compares two ids deterministically for stable sort ordering.
   * @private
   */
  _idCompare(a, b) {
    if (a < b) return -1;
    if (a > b) return 1;
    return 0;
  }

  /**
   * Serialize the full index state to a plain JSON-safe object.
   * Maps are converted to plain objects so the payload can be persisted to disk.
   * The inverted index is materialized first — postings are built lazily on the
   * first search, so a persist before any query would otherwise save an empty
   * index.
   * @returns {object} JSON-safe representation (includes postings + documents).
   */
  serialize() {
    this._buildPostings();
    const objFromMap = (map) => Object.fromEntries(map.entries());
    const postingsObj = {};
    for (const [term, docMap] of this.postings) {
      postingsObj[term] = Object.fromEntries(docMap.entries());
    }
    const documentsObj = {};
    for (const [id, doc] of this.documents) {
      documentsObj[String(id)] = { text: doc.text, tokens: doc.tokens };
    }
    return {
      version: 1,
      k1: this.k1,
      b: this.b,
      totalDocs: this.totalDocs,
      avgdl: this.avgdl,
      docLen: objFromMap(this.docLen),
      docFreq: objFromMap(this.docFreq),
      postings: postingsObj,
      documents: documentsObj,
    };
  }

  /**
   * Restore index state from a serialized payload (see {@link serialize}).
   * Replaces all current contents. Idempotent.
   * @param {object} data - The serialized payload.
   * @returns {BM25Index} This index for chaining.
   */
  deserialize(data) {
    if (!data || typeof data !== 'object') return this;
    const { k1, b, totalDocs, avgdl, docLen, docFreq, postings, documents } = data;

    this.k1 = typeof k1 === 'number' ? k1 : this.k1;
    this.b = typeof b === 'number' ? b : this.b;
    this.totalDocs = Number(totalDocs) || 0;
    this.avgdl = Number(avgdl) || 0;

    this.docLen = new Map(Object.entries(docLen ?? {}).map(([k, v]) => [k, Number(v)]));
    this.docFreq = new Map(Object.entries(docFreq ?? {}).map(([k, v]) => [k, Number(v)]));
    this.postings = new Map(
      Object.entries(postings ?? {}).map(([term, docMap]) => [
        term,
        new Map(Object.entries(docMap).map(([docId, tf]) => [docId, Number(tf)])),
      ])
    );
    this.documents = new Map(
      Object.entries(documents ?? {}).map(([id, doc]) => [
        id,
        { text: typeof doc?.text === 'string' ? doc.text : '', tokens: Array.isArray(doc?.tokens) ? doc.tokens : [] },
      ])
    );

    // Postings were persisted; the inverted index is ready without a rebuild.
    this._postingsBuilt = true;
    return this;
  }

  /**
   * Persist the index to disk (atomic write). Best-effort.
   * @param {string} filePath - Destination file path.
   * @returns {Promise<boolean>} True when the file was written.
   */
  async saveToFile(filePath) {
    try {
      await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
      const tmp = `${filePath}.tmp`;
      await fs.promises.writeFile(tmp, JSON.stringify(this.serialize()), 'utf8');
      await fs.promises.rename(tmp, filePath);
      return true;
    } catch (err) {
      console.warn('[bm25] saveToFile failed:', err.message);
      return false;
    }
  }

  /**
   * Load an index from disk into a new BM25Index instance.
   * @param {string} filePath - Source file path.
   * @returns {Promise<BM25Index|null>} The restored index, or null when missing/corrupt.
   */
  static async loadFromFile(filePath) {
    try {
      const raw = await fs.promises.readFile(filePath, 'utf8');
      const data = JSON.parse(raw);
      if (!data || typeof data !== 'object') return null;
      return new BM25Index().deserialize(data);
    } catch {
      return null;
    }
  }
}

/** @type {Set<string>} Exposed stopwords for advanced use. */
export const stopwords = DEFAULT_STOPWORDS;
