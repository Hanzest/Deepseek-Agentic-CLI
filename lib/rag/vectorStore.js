/**
 * @fileoverview RagVectorStore - LanceDB-backed vector store for RAG chunks.
 * Wraps LanceDB at <root>/.rag/lancedb. Lazy dynamic imports so module load
 * never throws when the underlying package is missing.
 * @module lib/rag/vectorStore
 */

import { join } from 'node:path';
import { existsSync, statSync, readdirSync } from 'node:fs';
import { projectRoot } from './runtime.js';

// Project root (honors RAG_ROOT env).
const ROOT = projectRoot();
const DB_PATH = join(ROOT, '.rag', 'lancedb');
const TABLE_NAME = 'chunks';
const VECTOR_DIM = 384;

/** @type {import('@lancedb/lancedb').Connection|null} */
let db = null;
/** @type {any|null} */
let table = null;
/** @type {number|null} */
let lastWriteTime = null;
/** @type {string[]} */
let columnNames = [
  'id',
  'layer',
  'namespace',
  'file_path',
  'line_start',
  'line_end',
  'timestamp',
  'section_headers',
  'language',
  'tags',
  'text',
  'file_hash',
  'vector'
];

/**
 * Dynamically imports the LanceDB client package. Never throws if missing.
 * @returns {Promise<any|null>} The lancedb module or null on failure.
 */
async function loadLanceModule() {
  try {
    return await import('@lancedb/lancedb');
  } catch {
    try {
      return await import('lancedb');
    } catch {
      // Fallback failure - return a stub with open() and connect() that no-op.
      return {
        connect: async () => ({ openTable: async () => null, createTable: async () => null, tableNames: async () => [] })
      };
    }
  }
}

let lancedbModule = null;

/**
 * Initializes the vector store connection and table.
 * @returns {Promise<boolean>} True on success, false on failure.
 */
export async function init() {
  try {
    if (db && table) return true;
    lancedbModule = await loadLanceModule();
    db = await lancedbModule.connect(DB_PATH);
    const names = await db.tableNames();
    if (names.includes(TABLE_NAME)) {
      table = await db.openTable(TABLE_NAME);
    } else {
      // LanceDB rejects createTable with an empty dataset; seed one record
      // matching the full schema, then immediately delete it.
      const seed = {
        id: '__rag_seed__',
        layer: '',
        namespace: '',
        file_path: '',
        line_start: 0,
        line_end: 0,
        timestamp: 0,
        section_headers: '[]',
        language: '',
        tags: '[]',
        text: '',
        file_hash: '',
        vector: new Float32Array(VECTOR_DIM),
      };
      table = await db.createTable(TABLE_NAME, [seed], {});
      try {
        await table.delete("id = '__rag_seed__'");
      } catch {
        // Seed deletion is best-effort; a leftover row is harmless.
      }
    }
    if (!table) {
      console.warn('[vectorStore] init failed: table unavailable');
      return false;
    }
    const existing = await table.schema?.fields?.map?.((f) => f.name) ?? [];
    // Refresh known columns from schema if available.
    if (existing.length) {
      for (const name of existing) {
        if (name !== 'id' && !columnNames.includes(name)) columnNames.push(name);
      }
    }
    return true;
  } catch (err) {
    console.warn('[vectorStore] init failed:', err?.message ?? err);
    return false;
  }
}

/**
 * Adds chunk records with their vectors to the store.
 * @param {Array<Record<string, any>>} chunks Vector-less chunk metadata rows.
 * @param {Float32Array[]} vectors Parallel array of embeddings (dim 384).
 * @returns {Promise<number|null>} Number of rows added, or null on failure.
 */
export async function addChunks(chunks, vectors) {
  try {
    if (!(await init())) return null;
    if (!Array.isArray(chunks) || !Array.isArray(vectors)) return null;
    const rows = chunks.map((chunk, i) => {
      const row = { ...chunk };
      // LanceDB string columns: serialize arrays and normalize nulls.
      row.section_headers = Array.isArray(row.section_headers)
        ? JSON.stringify(row.section_headers)
        : (row.section_headers ?? '[]');
      row.tags = Array.isArray(row.tags) ? JSON.stringify(row.tags) : (row.tags ?? '[]');
      row.language = row.language ?? '';
      row.vector = vectors[i] instanceof Float32Array ? vectors[i] : Float32Array.from(vectors[i] ?? []);
      return row;
    });
    await table.add(rows);
    lastWriteTime = Date.now();
    return rows.length;
  } catch (err) {
    console.warn('[vectorStore] addChunks failed:', err?.message ?? err);
    return null;
  }
}

/**
 * Deserialize stored rows back to canonical chunk shape (arrays restored).
 * @param {Record<string, any>} row - Raw LanceDB row.
 * @returns {Record<string, any>} Canonical chunk object.
 */
function deserializeRow(row) {
  const out = { ...row };
  if (typeof out.section_headers === 'string') {
    try { out.section_headers = JSON.parse(out.section_headers); } catch { out.section_headers = []; }
  }
  if (typeof out.tags === 'string') {
    try { out.tags = JSON.parse(out.tags); } catch { out.tags = []; }
  }
  return out;
}

/**
 * Removes all rows associated with a given file path.
 * @param {string} filePath Absolute path to the file.
 * @returns {Promise<number|null>} Rows removed, or null on failure.
 */
export async function removeByFile(filePath) {
  try {
    if (!(await init())) return null;
    if (!filePath) return null;
    const rows = await table.delete(`file_path = '${escapeSql(filePath)}'`);
    lastWriteTime = Date.now();
    return rows;
  } catch (err) {
    console.warn('[vectorStore] removeByFile failed:', err?.message ?? err);
    return null;
  }
}

/**
 * Removes rows whose namespace starts with the given prefix within a layer.
 * @param {string} layer The layer to scope deletion to.
 * @param {string} prefix Namespace prefix filter (LIKE 'prefix%').
 * @returns {Promise<number|null>} Rows removed, or null on failure.
 */
export async function removeSubtree(layer, prefix) {
  try {
    if (!(await init())) return null;
    const where = `layer = '${escapeSql(layer)}' AND namespace LIKE '${escapeLike(prefix)}%'`;
    const rows = await table.delete(where);
    lastWriteTime = Date.now();
    return rows;
  } catch (err) {
    console.warn('[vectorStore] removeSubtree failed:', err?.message ?? err);
    return null;
  }
}

/**
 * Performs a dense vector search with cosine similarity.
 * Similarity = 1 - (distance^2) / 2. Detects _distance/_dist/vector_dist columns.
 * @param {Float32Array} vector Query embedding (dim 384).
 * @param {{layer?: string|null, namespace?: string|null, limit?: number}} [opts]
 * @returns {Promise<Array<Record<string, any>>|null>} Rows sorted by similarity, or null.
 */
export async function searchDense(vector, { layer = null, namespace = null, limit = 50 } = {}) {
  try {
    if (!(await init())) return null;
    if (!(vector instanceof Float32Array)) vector = Float32Array.from(vector ?? []);
    let q = table.search(vector).limit(limit);
    if (layer) q = q.where(`layer = '${escapeSql(layer)}'`);
    if (namespace) q = q.where(`namespace = '${escapeSql(namespace)}'`);
    const results = await q.toArray();
    return results.map((row) => {
      const dist = Number(row._distance ?? row._dist ?? row.vector_dist ?? 0);
      const sim = Math.max(0, 1 - (dist * dist) / 2);
      const rest = { ...row };
      delete rest._distance;
      delete rest._dist;
      delete rest.vector_dist;
      return { ...deserializeRow(rest), cosine: sim };
    }).sort((a, b) => b.cosine - a.cosine);
  } catch (err) {
    console.warn('[vectorStore] searchDense failed:', err?.message ?? err);
    return null;
  }
}

/**
 * Returns all chunk rows in the store.
 * @returns {Promise<Array<Record<string, any>>|null>} All rows, or null on failure.
 */
export async function getAllChunks() {
  try {
    if (!(await init())) return null;
    let rows;
    if (typeof table.query === 'function') {
      rows = await table.query().toArray(); // LanceDB 0.12+ API
    } else if (typeof table.toArrow === 'function') {
      rows = (await table.toArrow()).toArray();
    } else if (typeof table.search === 'function') {
      rows = await table.search(new Float32Array(VECTOR_DIM)).limit(1_000_000).toArray();
    } else {
      return [];
    }
    return Array.isArray(rows) ? rows.map(deserializeRow) : rows;
  } catch (err) {
    console.warn('[vectorStore] getAllChunks failed:', err?.message ?? err);
    return null;
  }
}

/**
 * Computes store statistics.
 * @returns {Promise<{chunkCount: number, tableSizeBytes: number, lastWriteTime: number|null}|null>}
 */
export async function getStats() {
  try {
    if (!(await init())) return null;
    let chunkCount = 0;
    try {
      chunkCount = await table.countRows();
    } catch {
      try {
        chunkCount = (await table.query().toArray()).length;
      } catch {
        chunkCount = 0;
      }
    }
    let tableSizeBytes = 0;
    if (existsSync(DB_PATH)) {
      const walk = (dir) => {
        for (const name of readdirSync(dir)) {
          const p = join(dir, name);
          const st = statSync(p);
          if (st.isDirectory()) walk(p);
          else tableSizeBytes += st.size;
        }
      };
      walk(DB_PATH);
    }
    let lastWrite = lastWriteTime;
    if (lastWrite === null) {
      // Heuristic: latest mtime under db dir.
      let latest = 0;
      const scan = (dir) => {
        for (const name of readdirSync(dir)) {
          const p = join(dir, name);
          const st = statSync(p);
          if (st.isDirectory()) scan(p);
          else latest = Math.max(latest, st.mtimeMs);
        }
      };
      try {
        scan(DB_PATH);
        lastWrite = latest ? Math.round(latest) : null;
      } catch {
        lastWrite = null;
      }
    }
    return { chunkCount, tableSizeBytes, lastWriteTime: lastWrite };
  } catch (err) {
    console.warn('[vectorStore] getStats failed:', err?.message ?? err);
    return null;
  }
}

/**
 * Closes the database connection.
 * @returns {Promise<boolean>} True on success, false on failure.
 */
export async function close() {
  try {
    if (db) await db.close?.();
    db = null;
    table = null;
    return true;
  } catch (err) {
    console.warn('[vectorStore] close failed:', err?.message ?? err);
    return false;
  }
}

/**
 * Resets the store by dropping the table and rebuilding it empty.
 * @returns {Promise<boolean>} True on success, false on failure.
 */
export async function reset() {
  try {
    if (!(await init())) return false;
    await table.delete('1 = 1');
    lastWriteTime = Date.now();
    return true;
  } catch (err) {
    console.warn('[vectorStore] reset failed:', err?.message ?? err);
    return false;
  }
}

/** @param {string} s */
function escapeSql(s) {
  return String(s).replace(/'/g, "''");
}

/** @param {string} s */
function escapeLike(s) {
  return String(s).replace(/[%_]/g, (m) => '\\' + m);
}

export default {
  init,
  addChunks,
  removeByFile,
  removeSubtree,
  searchDense,
  getAllChunks,
  getStats,
  close,
  reset
};
