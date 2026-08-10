/**
 * @fileoverview MCP (Model Context Protocol) server over stdio for the RAG engine.
 *
 * Implements a minimal JSON-RPC 2.0 MCP endpoint exposing the `rag_search` tool,
 * backed by the public contract of `lib/rag/index.js`.
 *
 * Two entry points are exported:
 *   - `startMcpServer({ stdio, stdout })` — attaches listeners to the provided
 *     stdio stream and replies with single-line JSON-RPC 2.0 responses.
 *   - `createMcpHandler()` — returns an async function `(jsonRpcRequest) => response`
 *     for in-process consumers / unit tests. It never throws on malformed input.
 *
 * Protocol surface:
 *   - `initialize`            -> protocolVersion '2024-11-05', capabilities {tools:{}},
 *                                serverInfo {name:'deepseek-rag', version:'1.0.0'}
 *   - `notifications/initialized` -> no response
 *   - `tools/list`            -> the `rag_search` tool definition
 *   - `tools/call`            -> invokes RAG search, returns either a content result
 *                                or an `isError:true` response
 *   - any other method        -> JSON-RPC method-not-found error (-32601)
 *   - malformed / parse error -> JSON-RPC parse error (-32700) / invalid request (-32600)
 */

import * as index from './index.js';

export const SERVER_INFO = Object.freeze({
  name: 'deepseek-rag',
  version: '1.0.0',
});

export const PROTOCOL_VERSION = '2024-11-05';

/** The single tool exposed over MCP. */
const RAG_SEARCH_TOOL = Object.freeze({
  name: 'rag_search',
  description: 'Hybrid RAG retrieval over the local knowledge base',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string' },
      namespace: { type: 'string' },
      layer: { type: 'string', enum: ['knowledge', 'workspace', 'both'], default: 'both' },
      top_k: { type: 'integer', default: 5 },
      min_score: { type: 'number', default: 0.6 },
      max_prompt_tokens: { type: 'integer' },
    },
    required: ['query'],
  },
});

/** JSON-RPC error codes. */
const JSONRPC_ERROR = Object.freeze({
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
});

/**
 * Build a JSON-RPC 2.0 error object.
 * @param {number} code
 * @param {string} message
 * @param {*} [data]
 * @returns {{code:number, message:string, data?:*}}
 */
function rpcError(code, message, data) {
  const err = { code, message };
  if (data !== undefined) err.data = data;
  return err;
}

/**
 * Build a JSON-RPC 2.0 success response.
 * @param {string|number|null} id
 * @param {*} result
 * @returns {{jsonrpc:string, id, result:*}}
 */
function rpcSuccess(id, result) {
  return { jsonrpc: '2.0', id, result };
}

/**
 * Build a JSON-RPC 2.0 error response.
 * @param {string|number|null} id
 * @param {{code:number, message:string, data?:*}} error
 * @returns {{jsonrpc:string, id, error:{code:number, message:string, data?:*}}}
 */
function rpcErrorResponse(id, error) {
  return { jsonrpc: '2.0', id, error };
}

/**
 * Execute a single `tools/call` request for the `rag_search` tool.
 * @param {string|number|null} id
 * @param {*} arguments_
 * @returns {Promise<object>} JSON-RPC response object.
 */
async function callRagSearch(id, arguments_) {
  if (!arguments_ || typeof arguments_ !== 'object' || Array.isArray(arguments_)) {
    return rpcErrorResponse(id, rpcError(JSONRPC_ERROR.INVALID_PARAMS, 'Invalid parameters', 'arguments must be an object'));
  }

  const { query, namespace, layer, top_k, min_score, max_prompt_tokens } = arguments_;

  if (typeof query !== 'string' || query.trim() === '') {
    return rpcErrorResponse(id, rpcError(JSONRPC_ERROR.INVALID_PARAMS, 'Missing required parameter: query'));
  }

  try {
    // Surface only the public contract of lib/rag/index.js.
    const { search = () => ({ results: [], topScore: 0, lowConfidence: true, warning: undefined, truncated: false }) } = index;
    const output = await search({ query, namespace, layer, top_k, min_score, max_prompt_tokens });

    return rpcSuccess(id, {
      content: [{ type: 'text', text: JSON.stringify(output ?? {}) }],
      isError: false,
    });
  } catch (err) {
    return rpcSuccess(id, {
      content: [{ type: 'text', text: JSON.stringify({ error: err?.message ?? String(err) }) }],
      isError: true,
    });
  }
}

/**
 * Apply a batch of tool calls, collecting their responses in order.
 * @param {string|number|null} id
 * @param {Array} calls
 * @returns {Promise<object>}
 */
async function callBatch(id, calls) {
  const responses = [];
  for (const call of calls) {
    if (!call || typeof call.name !== 'string') {
      responses.push(
        rpcErrorResponse(null, rpcError(JSONRPC_ERROR.INVALID_REQUEST, 'Invalid tool call')),
      );
      continue;
    }
    if (call.name === 'rag_search') {
      const resp = await callRagSearch(call.id ?? null, call.arguments);
      responses.push(resp);
    } else {
      responses.push(
        rpcSuccess(call.id ?? null, {
          content: [{ type: 'text', text: `Unknown tool: ${call.name}` }],
          isError: true,
        }),
      );
    }
  }
  return rpcSuccess(id, { content: responses });
}

/**
 * Dispatch a parsed JSON-RPC request and produce the matching response.
 * Never throws for normal inputs; returns an error response instead.
 * @param {object} request
 * @returns {Promise<object|null>} Response object, or null when no response is
 *   required (notifications) or the request is invalid with no id to reply to.
 */
async function handleRequestObject(request) {
  if (!request || typeof request !== 'object' || Array.isArray(request)) {
    return rpcErrorResponse(null, rpcError(JSONRPC_ERROR.INVALID_REQUEST, 'Invalid Request'));
  }

  const { jsonrpc, id, method, params } = request;
  const hasId = id !== undefined && id !== null;

  // Batch request.
  if (Array.isArray(request)) {
    // Unreachable — handled above; kept defensive to satisfy JSDoc expectations.
    return rpcErrorResponse(null, rpcError(JSONRPC_ERROR.INVALID_REQUEST, 'Invalid Request'));
  }

  if (jsonrpc !== '2.0' || typeof method !== 'string') {
    // Invalid request without an id gets no response back.
    if (!hasId) return null;
    return rpcErrorResponse(id, rpcError(JSONRPC_ERROR.INVALID_REQUEST, 'Invalid Request'));
  }

  const fallbackId = hasId ? id : null;

  switch (method) {
    case 'initialize':
      return rpcSuccess(fallbackId, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: SERVER_INFO,
      });

    case 'notifications/initialized':
      // Notifications produce no response.
      return null;

    case 'tools/list':
      return rpcSuccess(fallbackId, { tools: [RAG_SEARCH_TOOL] });

    case 'tools/call': {
      if (!params || typeof params !== 'object' || Array.isArray(params)) {
        return rpcErrorResponse(fallbackId, rpcError(JSONRPC_ERROR.INVALID_PARAMS, 'Invalid params'));
      }
      if (Array.isArray(params.calls)) {
        return callBatch(fallbackId, params.calls);
      }
      const { name, arguments: callArgs } = params;
      if (name !== 'rag_search') {
        return rpcSuccess(fallbackId, {
          content: [{ type: 'text', text: `Unknown tool: ${name}` }],
          isError: true,
        });
      }
      return callRagSearch(fallbackId, callArgs);
    }

    default:
      if (!hasId) return null;
      return rpcErrorResponse(id, rpcError(JSONRPC_ERROR.METHOD_NOT_FOUND, `Method not found: ${method}`));
  }
}

/**
 * Create an in-process MCP handler.
 *
 * @returns {(jsonRpcRequest: object) => Promise<object|null>} An async function that accepts a parsed
 *   JSON-RPC request and resolves to the response object, or `null` when none is
 *   required (e.g. `notifications/initialized`). Malformed input is never thrown.
 */
export function createMcpHandler() {
  return handleRequestObject;
}

/**
 * Start an MCP JSON-RPC 2.0 server over stdio.
 *
 * Reads line-delimited JSON from `stdio`, processes each request, and writes
 * single-line JSON responses to `stdout`. Partial lines are buffered and split
 * on newlines. Malformed input is answered with a JSON-RPC parse error.
 *
 * @param {object} [opts]
 * @param {NodeJS.ReadableStream} [opts.stdio=process.stdin] Input stream.
 * @param {NodeJS.WritableStream} [opts.stdout=process.stdout] Output stream.
 * @returns {Promise<{handler: (req:object)=>Promise<object|null>, close: () => void}>}
 *   A handle exposing the underlying handler and a cleanup function.
 */
export async function startMcpServer({ stdio = process.stdin, stdout = process.stdout } = {}) {
  const handler = createMcpHandler();
  let buffer = '';

  const close = () => {
    stdio.removeListener('data', onData);
    stdio.removeListener('end', onEnd);
  };

  function writeResponse(obj) {
    stdout.write(`${JSON.stringify(obj)}\n`);
  }

  function onData(chunk) {
    buffer += chunk.toString();
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (line.trim() === '') continue;
      let parsed;
      try {
        parsed = JSON.parse(line);
      } catch {
        writeResponse(rpcErrorResponse(null, rpcError(JSONRPC_ERROR.PARSE_ERROR, 'Parse error')));
        continue;
      }
      // Await async handling without blocking the data loop.
      handler(parsed)
        .then((resp) => {
          if (resp != null) writeResponse(resp);
        })
        .catch(() => {
          // Safety net; handler never throws, but guard against edge cases.
          writeResponse(rpcErrorResponse(null, rpcError(JSONRPC_ERROR.INTERNAL_ERROR, 'Internal error')));
        });
    }
  }

  function onEnd() {
    // Flush any trailing partial line at stream end.
    if (buffer.trim() !== '') {
      onData(`${buffer}\n`);
      buffer = '';
    }
  }

  stdio.on('data', onData);
  stdio.on('end', onEnd);

  return { handler, close };
}

export default startMcpServer;
