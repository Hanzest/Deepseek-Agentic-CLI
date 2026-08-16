/**
 * ragastChunker.js
 *
 * tree-sitter AST-based chunking for source code files.
 * Supports: .py, .js, .ts, .go, .cpp
 *
 * Uses dynamic `import()` for 'tree-sitter' and the per-language grammar
 * packages ('tree-sitter-python', 'tree-sitter-javascript', etc.) so that this
 * module loads cleanly even when those optional dependencies are not installed.
 * On parse failure, unsupported language, or unavailable tree-sitter, it falls back
 * gracefully to the canonical `chunkText` from './chunker.js'.
 */

import path from 'node:path';

// Grammar npm package per language id.
const GRAMMAR_PACKAGES = {
  python: 'tree-sitter-python',
  javascript: 'tree-sitter-javascript',
  typescript: 'tree-sitter-typescript',
  go: 'tree-sitter-go',
  cpp: 'tree-sitter-cpp',
};

// AST node type (langId) mapping per language.
const NODE_TYPES = {
  python: {
    function: 'function_definition',
    class: 'class_definition',
  },
  javascript: {
    function: 'function_declaration',
    class: 'class_declaration',
    method: 'method_definition',
  },
  typescript: {
    function: 'function_declaration',
    class: 'class_declaration',
    method: 'method_definition',
  },
  go: {
    function: 'function_declaration',
    class: 'type_declaration',
  },
  cpp: {
    function: 'function_definition',
    class: 'class_specifier',
  },
};

// Language identifiers accepted by tree-sitter-wasms.getLanguage().
const LANG_IDS = {
  py: 'python',
  python: 'python',
  js: 'javascript',
  javascript: 'javascript',
  ts: 'typescript',
  typescript: 'typescript',
  go: 'go',
  cpp: 'cpp',
  'c++': 'cpp',
  cc: 'cpp',
};

/**
 * Resolve the language id (python|javascript|typescript|go|cpp) from an explicit
 * language hint or a file path. Returns null when unresolvable.
 *
 * @param {string|null} language
 * @param {string} filePath
 * @returns {string|null}
 */
function resolveLanguage(language, filePath) {
  if (language) {
    const id = LANG_IDS[String(language).toLowerCase()];
    if (id) return id;
  }
  if (!filePath) return null;
  const ext = filePath.split('.').pop().toLowerCase();
  return LANG_IDS[ext] || null;
}

/**
 * Capture a module header — the first ~30 lines containing the language's module
 * import statements (imports/requires/includes/using).
 *
 * @param {string} source
 * @param {string} filePath
 * @param {string} langId
 * @returns {string} header text (may be empty string)
 */
function extractModuleHeader(source, filePath, langId) {
  const lines = source.split('\n');
  const maxLines = Math.min(lines.length, 30);
  let headerLines = [];
  for (let i = 0; i < maxLines; i++) {
    const line = lines[i];
    const t = line.trim();
    const isStmt =
      (langId === 'python' && (t.startsWith('import ') || t.startsWith('from '))) ||
      ((langId === 'javascript' || langId === 'typescript') &&
        (t.startsWith('import ') || t.startsWith('export ') || t.includes('require('))) ||
      (langId === 'go' && (t.startsWith('package ') || t.startsWith('import'))) ||
      (langId === 'cpp' && (t.startsWith('#include') || t.startsWith('using ')));
    if (isStmt) {
      headerLines.push(line);
    }
  }
  return headerLines.join('\n');
}

/**
 * Compute module / class path annotation for a node.
 *
 * For classes nested inside other classes, we track a nesting stack of class paths
 * to produce `['python', 'utils', 'MathUtils']`.
 *
 * @param {string} langId
 * @param {Array<string>} classStack
 * @returns {string[]}
 */
function buildSectionHeaders(langId, classStack) {
  const headers = [langId];
  let module = null;
  for (const name of classStack) {
    if (name.startsWith('module:')) {
      module = name.slice('module:'.length);
      break;
    }
  }
  if (module) headers.push(module);
  const classNames = classStack.filter((n) => !n.startsWith('module:'));
  headers.push(...classNames);
  return headers;
}

/**
 * Get the name of an AST node if it has a `name` field node.
 *
 * @param {object} node tree-sitter syntax node
 * @returns {string|null}
 */
function nodeName(node, tree) {
  const field = node.childForFieldName && node.childForFieldName('name');
  if (field) {
    // tree-sitter 0.25: SyntaxNode exposes .text directly; fall back to type.
    const t = field.text ?? (tree.getText ? tree.getText(field.startIndex, field.endIndex) : null);
    return typeof t === 'string' && t.length > 0 ? t : null;
  }
  return null;
}

/**
 * Determine whether a node is a class-defining node for the given langId.
 *
 * @param {string} langId
 * @param {string} type
 * @returns {boolean}
 */
function isClassType(langId, type) {
  return type === NODE_TYPES[langId].class;
}

/**
 * Parse the AST and produce chunks for the module header plus each top-level
 * function/class (recursively resolving nested classes for class-path depth).
 *
 * @param {string} source
 * @param {object} tree tree-sitter tree
 * @param {string} filePath
 * @param {string} langId
 * @param {object} base metadata base fields
 * @returns {Array<object>} canonical chunks
 */
function chunkAst(source, tree, filePath, langId, base) {
  const chunks = [];
  const headerParts = extractModuleHeader(source, filePath, langId);
  const moduleChunk = headerParts.length > 0
    ? {
        id: base.idPrefix + ':module:header',
        layer: base.layer,
        namespace: base.namespace,
        file_path: filePath,
        line_start: 1,
        line_end: Math.min(headerParts.split('\n').length, 30),
        timestamp: base.timestamp,
        section_headers: [langId, 'module'],
        language: base.language || langId,
        tags: [langId, 'module'],
        text: headerParts,
        file_hash: base.fileHash,
      }
    : null;
  if (moduleChunk) chunks.push(moduleChunk);

  const root = tree.rootNode;
  const stack = [{ node: root, classPath: [] }];

  while (stack.length > 0) {
    const { node, classPath } = stack.pop();
    const type = node.type;

    if (type === NODE_TYPES[langId].class) {
      const name = nodeName(node, tree);
      const childPath = name ? [...classPath, name] : classPath;
      chunks.push(buildChunk(node, source, filePath, langId, base, childPath, name));
      // Descend into class body to find methods / nested classes.
      for (const child of node.namedChildren) {
        if (child.type === 'class_body' || child.type === 'declaration_list' || child.type === 'block') {
          stack.push({ node: child, classPath: childPath });
        }
      }
      continue;
    }

    if (type === NODE_TYPES[langId].function || type === NODE_TYPES[langId].method) {
      const name = nodeName(node, tree);
      chunks.push(buildChunk(node, source, filePath, langId, base, classPath, name));
      continue;
    }

    for (const child of node.namedChildren) {
      stack.push({ node: child, classPath });
    }
  }

  return chunks;
}

/**
 * Build a canonical chunk for a single function/class AST node.
 *
 * @param {object} node
 * @param {string} source
 * @param {string} filePath
 * @param {string} langId
 * @param {object} base
 * @param {string[]} classPath
 * @param {string|null} name
 * @returns {object}
 */
function buildChunk(node, source, filePath, langId, base, classPath, name) {
  const lineStart = node.startPosition.row + 1;
  const lineEnd = node.endPosition.row + 1;
  const text = source.slice(node.startIndex, node.endIndex);
  const headers = buildSectionHeaders(langId, classPath);
  const kind = classPath.length > 0 && (langId !== 'python') ? 'method' : (isClassType(langId, node.type) ? 'class' : 'function');
  const chunkId = `${base.idPrefix}:${kind}:${name || 'anon'}:${lineStart}-${lineEnd}`;
  return {
    id: chunkId,
    layer: base.layer,
    namespace: base.namespace,
    file_path: filePath,
    line_start: lineStart,
    line_end: lineEnd,
    timestamp: base.timestamp,
    section_headers: headers,
    language: base.language || langId,
    tags: [langId, kind, ...(name ? [name] : [])],
    text,
    file_hash: base.fileHash,
  };
}

/**
 * Async, grace-degrading AST-based chunker.
 *
 * Tries tree-sitter via dynamic imports. On any failure falls back to chunkText.
 *
 * @param {string} source source code to chunk
 * @param {object} opts
 * @param {string} [opts.filePath='']
 * @param {string} [opts.layer='workspace']
 * @param {string|null} [opts.layerRoot=null]
 * @param {string|null} [opts.language=null]
 * @param {string|null} [opts.fileHash=null]
 * @returns {Promise<Array<object>>} canonical chunks
 */
export async function chunkCodeAsync(
  source,
  { filePath = '', layer = 'workspace', layerRoot = null, language = null, fileHash = null } = {},
) {
  const langId = resolveLanguage(language, filePath);
  // Namespace = subdirectory relative to the layer root ('' at root).
  let namespace = '';
  if (layerRoot) {
    const rel = path.relative(layerRoot, path.dirname(filePath));
    if (rel && rel !== '.' && !rel.startsWith('..')) {
      namespace = rel.split(path.sep).join('/');
    }
  }
  const base = {
    idPrefix: buildId(filePath, 1, 1),
    layer,
    namespace,
    timestamp: Date.now(),
    fileHash,
    language: language || langId,
  };

  // Try tree-sitter; on any failure fall back to chunker.chunkText.
  try {
    if (!langId) throw new Error(`Unsupported language/extension: ${language || filePath}`);
    const grammarName = GRAMMAR_PACKAGES[langId];
    if (!grammarName) throw new Error(`No grammar package for ${langId}`);
    const ParserCls = (await import('tree-sitter')).default;
    const LangMod = await import(grammarName);
    const Lang = LangMod.default || LangMod.Language;
    if (!Lang) throw new Error(`No Language export from ${grammarName}`);
    const Parser = new ParserCls();
    if (typeof Parser.setLanguage !== 'function') {
      throw new Error('tree-sitter Parser has no setLanguage');
    }
    Parser.setLanguage(Lang);
    const tree = Parser.parse(source);
    if (!tree) throw new Error('Parse returned no tree');
    const output = chunkAst(source, tree, filePath, langId, base);
    if (output.length === 0) throw new Error('No AST chunks produced');
    return output;
  } catch {
    // Graceful fallback.
    const { chunkText } = await import('./chunker.js');
    return chunkText(source, {
      filePath,
      layer,
      layerRoot,
      language: language || langId,
      fileHash,
    });
  }
}

// Build a simple deterministic id (kept local to avoid importing metadata.js).
/**
 * Create a stable id segment from a file path and line range.
 *
 * @param {string} filePath
 * @param {number} lineStart
 * @param {number} lineEnd
 * @returns {string}
 */
function buildId(filePath, lineStart, lineEnd) {
  const safePath = String(filePath).replace(/[^a-zA-Z0-9_\-./\\]/g, '_');
  return `${safePath}:${lineStart}-${lineEnd}`;
}

export default chunkCodeAsync;
