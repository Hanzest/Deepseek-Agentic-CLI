import fs from "fs";
import path from "path";
import crypto from "crypto";
import zlib from "zlib";
import { createToolHandler } from "./template.js";
import { reconstructText, buildTable } from "../lib/pdfLayoutBuilder.js";

// ---------------------------------------------------------------------------
// Dynamic imports for document parsers (lazy-loaded only when needed)
// ---------------------------------------------------------------------------
let mammoth = null;
async function getMammoth() {
    if (!mammoth) {
        mammoth = await import("mammoth");
    }
    return mammoth;
}

let pdfjsLib = null;
async function getPdfJs() {
    if (!pdfjsLib) {
        pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
    }
    return pdfjsLib;
}

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------
export const extract_content_schema = {
    type: "function",
    function: {
        name: "extract_content",
        description:
            "Extracts text content from .docx (Word) and .pdf documents. " +
            "Returns structured JSON with the extracted text as Markdown-compatible content. " +
            "Supports optional page range filtering for PDFs and max_chars truncation. " +
            "When auto_paginate is enabled with max_chars>0, the tool automatically " +
            "retrieves all content chunks and concatenates them (eliminates manual re-fetch). " +
            "Returns content_hash (SHA-256 of first 1KB) in metadata for dedup detection. " +
            "Use this to read content from binary document formats that cannot be opened " +
            "with plain text file readers.",
        parameters: {
            type: "object",
            properties: {
                file_path: {
                    type: "string",
                    description:
                        "Absolute or relative path to the .docx or .pdf file to extract content from.",
                },
                max_chars: {
                    type: "integer",
                    description:
                        "Maximum characters to return per chunk. Default: 0 (no limit). " +
                        "Useful for token-budget management when extracting large documents. " +
                        "When auto_paginate=true, this sets the internal chunk size and " +
                        "the tool automatically fetches all chunks.",
                },
                page_start: {
                    type: "integer",
                    description:
                        "Start page (1-indexed) for PDF extraction. Default: 1. Only applies to PDF files; ignored for .docx files.",
                },
                page_end: {
                    type: "integer",
                    description:
                        "End page (1-indexed) for PDF extraction. Default: last page. Only applies to PDF files; ignored for .docx files.",
                },
                auto_paginate: {
                    type: "boolean",
                    description:
                        "When true and max_chars>0, automatically fetches all content chunks " +
                        "and returns the concatenated result. Eliminates manual re-fetch for " +
                        "large documents. Default: false.",
                },
            },
            required: ["file_path"],
        },
    },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Resolve a potentially relative file path to absolute.
 * @param {string} filePath
 * @returns {string}
 */
function resolvePath(filePath) {
    if (!path.isAbsolute(filePath)) {
        return path.resolve(process.cwd(), filePath);
    }
    return filePath;
}

/**
 * Determine document type from file extension.
 * @param {string} ext - Lowercase file extension.
 * @returns {"docx" | "pdf" | null}
 */
function getFileType(ext) {
    if (ext === ".docx") return "docx";
    if (ext === ".pdf") return "pdf";
    return null;
}

/**
 * Extract a specific file from a ZIP buffer by binary-scanning for the
 * local file header of `targetPath`. Handles stored (method 0) and
 * deflated (method 8) compression. Generalizes the ZIP-entry extraction
 * pattern previously inlined in countDocxPages().
 *
 * @param {Buffer} buffer - Full file buffer (read from .docx / ZIP).
 * @param {string} targetPath - Internal path within the ZIP (e.g. "docProps/app.xml").
 * @returns {string|null} Decompressed content string, or null if not found / unsupported.
 */
function extractZipFile(buffer, targetPath) {
    const nameIdx = buffer.indexOf(targetPath);
    if (nameIdx === -1) return null;

    // Walk backward from the filename to find the local file header (PK\x03\x04)
    let headerStart = nameIdx;
    while (headerStart > 3) {
        if (
            buffer[headerStart] === 0x50 &&
            buffer[headerStart + 1] === 0x4B &&
            buffer[headerStart + 2] === 0x03 &&
            buffer[headerStart + 3] === 0x04
        ) {
            break;
        }
        headerStart--;
    }
    if (headerStart <= 0) return null;

    const compressionMethod = buffer.readUInt16LE(headerStart + 8);
    const compressedSize = buffer.readUInt32LE(headerStart + 18);
    const fileNameLength = buffer.readUInt16LE(headerStart + 26);
    const extraFieldLength = buffer.readUInt16LE(headerStart + 28);

    if (compressedSize === 0) return null;

    const dataStart = headerStart + 30 + fileNameLength + extraFieldLength;
    const compressedData = buffer.slice(dataStart, dataStart + compressedSize);

    if (compressionMethod === 0) {
        return compressedData.toString("utf-8");
    }
    if (compressionMethod === 8) {
        return zlib.inflateRawSync(compressedData).toString("utf-8");
    }
    return null;
}

/**
 * Get accurate page count from a .docx file by reading the <Pages> element
 * in docProps/app.xml (set by Word when the document is saved).
 *
 * Falls back to character-based estimation if the props XML is not available.
 *
 * @param {string} filePath - Path to the .docx file.
 * @param {string} [content=""] - Optional extracted text (for fallback estimation).
 * @returns {number} Page count (at least 1).
 */
function getDocxPageCount(filePath, content = "") {
    try {
        const buffer = fs.readFileSync(filePath);
        const propsXml = extractZipFile(buffer, "docProps/app.xml");
        if (propsXml) {
            const match = propsXml.match(/<Pages>(\d+)<\/Pages>/i);
            if (match) return Math.max(1, parseInt(match[1], 10));
        }
    } catch {
        // Fall through to fallback
    }
    // Fallback: estimate from content length using an average of ~3000 chars/page
    return Math.max(1, Math.ceil(content.length / 3000));
}

/**
 * Truncate content to max_chars if a limit is set.
 * @param {string} content
 * @param {number} maxChars - 0 means no limit.
 * @returns {{ content: string, truncated: boolean }}
 */
function truncateContent(content, maxChars) {
    if (maxChars > 0 && content.length > maxChars) {
        return { content: content.substring(0, maxChars), truncated: true };
    }
    return { content, truncated: false };
}

/**
 * Compute SHA-256 hash of the first 1024 characters (UTF-16 code units) of content.
 * Used for duplicate detection (E2).
 * @param {string} content
 * @returns {string} hex-encoded SHA-256 hash (64 characters)
 */
function computeContentHash(content) {
    const sample = content.substring(0, 1024);
    return crypto.createHash("sha256").update(sample, "utf-8").digest("hex");
}

/**
 * @deprecated Replaced by getDocxPageCount() which reads the authoritative
 * <Pages> value from docProps/app.xml. Kept only as a fallback reference.
 */

// ---------------------------------------------------------------------------
// DOCX Extraction
// ---------------------------------------------------------------------------

/**
 * Extract text from a .docx file using mammoth.
 * @param {string} filePath
 * @returns {Promise<string>} Extracted plain text.
 */
async function extractDocx(filePath) {
    const mammothModule = await getMammoth();
    const buffer = fs.readFileSync(filePath);
    const result = await mammothModule.extractRawText({ buffer });
    return result.value;
}

// ---------------------------------------------------------------------------
// PDF Extraction (using pdfjs-dist directly)
// ---------------------------------------------------------------------------

/**
 * Extract text from a .pdf file using pdfjs-dist.
 * Supports optional page range filtering and tracks per-page lengths
 * for truncated_at_page detection.
 *
 * @param {string} filePath
 * @param {number} [pageStart=1]
 * @param {number} [pageEnd] - If omitted, extracts to the last page.
 * @param {number} [maxChars=0] - If >0, tracks which page the truncation boundary falls on.
 * @returns {Promise<{ text: string, pageCount: number, truncatedAtPage: number | null }>}
 */
async function extractPdf(filePath, pageStart = 1, pageEnd, maxChars = 0) {
    const pdfjs = await getPdfJs();
    const buffer = fs.readFileSync(filePath);
    const data = new Uint8Array(buffer);

    const doc = await pdfjs.getDocument({ data }).promise;
    const pageCount = doc.numPages;

    const startPage = Math.max(1, pageStart);
    const endPage = pageEnd ? Math.min(pageEnd, pageCount) : pageCount;

    const pageTexts = [];
    const cumulativeLengths = [];
    let cumulativeLength = 0;

    for (let i = startPage; i <= endPage; i++) {
        const page = await doc.getPage(i);
        const content = await page.getTextContent();
        // Attempt table detection on this page's items — returns markdown + used items
        const tableResult = buildTable(content.items);
        const tableMarkdown = tableResult?.markdown ?? null;
        const usedItems = tableResult?.usedItems ?? new Set();

        // Filter out table items so they don't appear twice in reconstructedText
        const nonTableItems = content.items.filter((item) => !usedItems.has(item));
        const reconstructedText = reconstructText(nonTableItems);

        const pageText = tableMarkdown
            ? `${tableMarkdown}\n\n${reconstructedText}`
            : reconstructedText;
        const separatorLen = pageTexts.length > 0 ? 2 : 0; // \n\n
        cumulativeLength += separatorLen + pageText.length;
        pageTexts.push(pageText);
        cumulativeLengths.push(cumulativeLength);
        page.cleanup();
    }

    await doc.destroy();

    const text = pageTexts.join("\n\n");
    let truncatedAtPage = null;

    if (maxChars > 0 && text.length > maxChars) {
        for (let i = 0; i < cumulativeLengths.length; i++) {
            if (cumulativeLengths[i] > maxChars) {
                truncatedAtPage = startPage + i;
                break;
            }
        }
    }

    return { text, pageCount, truncatedAtPage };
}

// ---------------------------------------------------------------------------
// Core handler
// ---------------------------------------------------------------------------

/**
 * Core extraction logic — no consent concerns (read-only).
 *
 * @param {{
 *   file_path: string,
 *   max_chars?: number,
 *   page_start?: number,
 *   page_end?: number,
 *   auto_paginate?: boolean
 * }} args
 * @returns {Promise<string>} JSON-stringified result
 */
async function extractContentCore({
    file_path,
    max_chars = 0,
    page_start,
    page_end,
    auto_paginate = false,
}) {
    const toolName = "extract_content";

    // 1. Security: block .env files
    if (path.basename(file_path).toLowerCase().includes(".env")) {
        return buildError(
            toolName,
            "Security Error: Reading .env files is strictly prohibited."
        );
    }

    // 2. Resolve and validate path
    const resolvedPath = resolvePath(file_path);

    if (!fs.existsSync(resolvedPath)) {
        return buildError(
            toolName,
            `File not found at '${resolvedPath}'.`
        );
    }

    // 3. Determine file type
    const ext = path.extname(resolvedPath).toLowerCase();
    const fileType = getFileType(ext);

    if (!fileType) {
        return buildError(
            toolName,
            `Unsupported file extension '${ext}'. Only .docx and .pdf files are supported.`
        );
    }

    // 4. Extract content based on type
    try {
        let content;
        let metadata = {};

        if (fileType === "docx") {
            content = await extractDocx(resolvedPath);
            // E5: page_count for DOCX — reads authoritative <Pages> from docProps/app.xml
            metadata.page_count = getDocxPageCount(resolvedPath, content);
        } else {
            // PDF
            const pageStartNum = page_start && page_start > 0 ? page_start : 1;
            const pageEndNum = page_end && page_end > 0 ? page_end : undefined;
            const result = await extractPdf(
                resolvedPath,
                pageStartNum,
                pageEndNum,
                // Pass max_chars so extractPdf can track truncated_at_page
                max_chars > 0 ? max_chars : 0
            );
            content = result.text;
            metadata.page_count = result.pageCount;
            metadata.truncated_at_page = result.truncatedAtPage;
        }

        // 5. Handle auto-pagination (E1)
        //    When auto_paginate is true and max_chars > 0, the tool internally
        //    fetches all content (already done above), and we report it as
        //    non-truncated with auto-pagination metadata.
        let chunksFetched = 1;

        if (auto_paginate && max_chars > 0) {
            // Content is already fully extracted above.
            // If the content was larger than max_chars, we would have fetched
            // multiple chunks. For PDF, if truncatedAtPage was set, we count chunks.
            // For DOCX, we always extract at once.
            if (fileType === "pdf" && metadata.truncated_at_page) {
                // Estimate chunks: total pages / pages per chunk
                const totalChars = content.length;
                chunksFetched = Math.ceil(totalChars / max_chars);
            }
            metadata.auto_paginated = true;
            metadata.chunks_fetched = chunksFetched;
            // Override: return full content as non-truncated
            // (no truncation applied since we auto-paginated everything)
        }

        // 6. Apply truncation (only if NOT auto-paginating)
        let truncated = false;
        let truncatedContent = content;
        let truncatedAtPage = null;

        if (auto_paginate && max_chars > 0) {
            // Auto-pagination mode: return everything, no truncation
            truncated = false;
        } else {
            // Standard mode: apply truncation
            const truncResult = truncateContent(content, max_chars);
            truncatedContent = truncResult.content;
            truncated = truncResult.truncated;

            // E5: truncated_at_page for metadata
            if (truncated && fileType === "pdf") {
                truncatedAtPage = metadata.truncated_at_page || null;
            } else if (truncated && fileType === "docx") {
                // Estimate page for DOCX based on character ratio
                const totalPages = metadata.page_count || 1;
                const charRatio = max_chars > 0 ? max_chars / content.length : 1;
                truncatedAtPage = Math.max(1, Math.ceil(charRatio * totalPages));
            }
        }

        // 7. Compute content hash (E2) — always, regardless of mode
        metadata.content_hash = computeContentHash(content);

        // 8. Add truncated_at_page to metadata if applicable
        if (truncatedAtPage !== null) {
            metadata.truncated_at_page = truncatedAtPage;
        }

        // 9. Clean up metadata keys that shouldn't be exposed if null/undefined
        //    (truncated_at_page from PDF extraction that wasn't used)
        if (fileType === "pdf" && !truncated && metadata.truncated_at_page === null) {
            delete metadata.truncated_at_page;
        }

        // 10. Build and return output
        return buildOutput({
            filePath: resolvedPath,
            fileType,
            content: truncatedContent,
            truncated,
            metadata,
        });
    } catch (e) {
        return buildError(toolName, `Failed to extract content: ${e.message || e}`);
    }
}

/**
 * Build the standard structured output object.
 * @param {object} params
 * @returns {string} JSON-stringified result
 */
function buildOutput({ filePath, fileType, content, truncated, metadata }) {
    const output = {
        file_path: filePath,
        file_type: fileType,
        content,
        content_length: content.length,
        truncated,
    };
    if (metadata && Object.keys(metadata).length > 0) {
        output.metadata = metadata;
    }
    return JSON.stringify(output, null, 2);
}

/**
 * Build a structured error response (same pattern as template.js formatError).
 * @param {string} toolName
 * @param {string} message
 * @returns {string} JSON-stringified error
 */
function buildError(toolName, message) {
    const errorMsg = `Error in tool '${toolName}': ${message}`;
    console.log(`\x1b[91m${errorMsg}\x1b[0m`);
    return JSON.stringify({ error: true, tool: toolName, message: errorMsg });
}

// ---------------------------------------------------------------------------
// Wrapped handler (read-only — no consent required)
// ---------------------------------------------------------------------------
export const extract_content = createToolHandler("extract_content", extractContentCore, false);
