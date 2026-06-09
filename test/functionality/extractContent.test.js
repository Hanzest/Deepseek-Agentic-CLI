import { describe, it, expect } from "vitest";
import { join, dirname, resolve } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Resolve to project root (two levels up from test/functionality/)
const projectRoot = resolve(__dirname, "..", "..");

import { extract_content, extract_content_schema } from "../../tools/extractContent.js";

// ---------------------------------------------------------------------------
// Fixtures path — mock documents in z_swe/fix_docs/
// ---------------------------------------------------------------------------
const FIX_DOCS_DIR = join(projectRoot, "z_swe", "fix_docs");
const DOCX_PATH = join(FIX_DOCS_DIR, "SWE40006 - Hồ Quốc Khánh - Deployment Task 4.docx");
const PDF_PATH = join(FIX_DOCS_DIR, "Lecture 4 - Thread.pdf");
const MIS_PDF_PATH = join(FIX_DOCS_DIR, "NHÓM_03_MIS.pdf");

// ---------------------------------------------------------------------------
// Schema validation
// ---------------------------------------------------------------------------
describe("extractContent schema", () => {
    it("exports a valid schema object with name and parameters", () => {
        expect(extract_content_schema).toHaveProperty("type", "function");
        expect(extract_content_schema).toHaveProperty("function");
        expect(extract_content_schema.function).toHaveProperty("name", "extract_content");
        expect(extract_content_schema.function).toHaveProperty("parameters");
        expect(extract_content_schema.function.parameters).toHaveProperty("required");
        expect(extract_content_schema.function.parameters.required).toContain("file_path");
    });

    it("schema describes file_path, max_chars, page_start, page_end, auto_paginate parameters", () => {
        const props = extract_content_schema.function.parameters.properties;
        expect(props).toHaveProperty("file_path");
        expect(props).toHaveProperty("max_chars");
        expect(props).toHaveProperty("page_start");
        expect(props).toHaveProperty("page_end");
        expect(props).toHaveProperty("auto_paginate");
    });
});

// ---------------------------------------------------------------------------
// DOCX extraction tests
// ---------------------------------------------------------------------------
describe("extractContent - DOCX extraction", () => {
    it(
        "extracts text from a .docx file and returns structured output",
        { timeout: 30_000 },
        async () => {
            const result = await extract_content({ file_path: DOCX_PATH });
            const parsed = typeof result === "string" ? JSON.parse(result) : result;

            expect(parsed.error).toBeFalsy();
            expect(parsed).toHaveProperty("file_type", "docx");
            expect(parsed).toHaveProperty("content");
            expect(typeof parsed.content).toBe("string");
            expect(parsed.content.length).toBeGreaterThan(0);
            expect(parsed).toHaveProperty("content_length");
            expect(parsed.content_length).toBeGreaterThan(0);
            expect(parsed).toHaveProperty("truncated", false);
        },
    );

    it(
        "extracts content containing known text from the mock DOCX",
        { timeout: 30_000 },
        async () => {
            const result = await extract_content({ file_path: DOCX_PATH });
            const parsed = typeof result === "string" ? JSON.parse(result) : result;

            // The document should contain deployment-related keywords
            const contentLower = parsed.content.toLowerCase();
            expect(contentLower).toContain("deployment");
            expect(contentLower).toContain("task");
        },
    );

    it(
        "max_chars truncation works on DOCX content",
        { timeout: 30_000 },
        async () => {
            const result = await extract_content({
                file_path: DOCX_PATH,
                max_chars: 50,
            });
            const parsed = typeof result === "string" ? JSON.parse(result) : result;

            expect(parsed.error).toBeFalsy();
            expect(parsed.content.length).toBeLessThanOrEqual(50);
            expect(parsed.truncated).toBe(true);
        },
    );
});

// ---------------------------------------------------------------------------
// PDF extraction tests
// ---------------------------------------------------------------------------
describe("extractContent - PDF extraction", () => {
    it(
        "extracts text from a .pdf file and returns structured output",
        { timeout: 30_000 },
        async () => {
            const result = await extract_content({ file_path: PDF_PATH });
            const parsed = typeof result === "string" ? JSON.parse(result) : result;

            expect(parsed.error).toBeFalsy();
            expect(parsed).toHaveProperty("file_type", "pdf");
            expect(parsed).toHaveProperty("content");
            expect(typeof parsed.content).toBe("string");
            expect(parsed.content.length).toBeGreaterThan(0);
            expect(parsed).toHaveProperty("content_length");
            expect(parsed.content_length).toBeGreaterThan(0);
            expect(parsed).toHaveProperty("truncated", false);
            expect(parsed).toHaveProperty("metadata");
            expect(parsed.metadata).toHaveProperty("page_count");
            expect(parsed.metadata.page_count).toBeGreaterThan(0);
        },
    );

    it(
        "extracts content containing known text from the mock PDF",
        { timeout: 30_000 },
        async () => {
            const result = await extract_content({ file_path: PDF_PATH });
            const parsed = typeof result === "string" ? JSON.parse(result) : result;

            // The PDF is about threads (Lecture 4 - Thread)
            const contentLower = parsed.content.toLowerCase();
            expect(contentLower).toContain("thread");
        },
    );

    it(
        "max_chars truncation works on PDF content",
        { timeout: 30_000 },
        async () => {
            const result = await extract_content({
                file_path: PDF_PATH,
                max_chars: 30,
            });
            const parsed = typeof result === "string" ? JSON.parse(result) : result;

            expect(parsed.error).toBeFalsy();
            expect(parsed.content.length).toBeLessThanOrEqual(30);
            expect(parsed.truncated).toBe(true);
        },
    );
});

// ---------------------------------------------------------------------------
// E1: Auto-pagination tests
// ---------------------------------------------------------------------------
describe("extractContent - E1 auto-pagination", () => {
    it(
        "auto_paginate with DOCX returns full content even with tiny max_chars",
        { timeout: 30_000 },
        async () => {
            const result = await extract_content({
                file_path: DOCX_PATH,
                max_chars: 50,
                auto_paginate: true,
            });
            const parsed = typeof result === "string" ? JSON.parse(result) : result;

            expect(parsed.error).toBeFalsy();
            expect(parsed.content.length).toBeGreaterThan(50); // Full content, not just 50
            expect(parsed.truncated).toBe(false);
            // Should have auto_pagination metadata
            expect(parsed.metadata).toHaveProperty("auto_paginated", true);
            expect(parsed.metadata).toHaveProperty("chunks_fetched");
            expect(parsed.metadata.chunks_fetched).toBeGreaterThanOrEqual(1);
        },
    );

    it(
        "auto_paginate with PDF returns full content even with tiny max_chars",
        { timeout: 30_000 },
        async () => {
            const result = await extract_content({
                file_path: PDF_PATH,
                max_chars: 100,
                auto_paginate: true,
            });
            const parsed = typeof result === "string" ? JSON.parse(result) : result;

            expect(parsed.error).toBeFalsy();
            expect(parsed.content.length).toBeGreaterThan(100); // Full content
            expect(parsed.truncated).toBe(false);
            expect(parsed.metadata).toHaveProperty("auto_paginated", true);
            expect(parsed.metadata).toHaveProperty("chunks_fetched");
            expect(parsed.metadata.chunks_fetched).toBeGreaterThanOrEqual(1);
        },
    );

    it(
        "auto_paginage=false (default) still truncates as before",
        { timeout: 30_000 },
        async () => {
            const result = await extract_content({
                file_path: DOCX_PATH,
                max_chars: 50,
                // auto_paginate not set — defaults to false
            });
            const parsed = typeof result === "string" ? JSON.parse(result) : result;

            expect(parsed.error).toBeFalsy();
            expect(parsed.content.length).toBeLessThanOrEqual(50);
            expect(parsed.truncated).toBe(true);
            // No auto-pagination metadata
            expect(parsed.metadata).not.toHaveProperty("auto_paginated");
        },
    );
});

// ---------------------------------------------------------------------------
// E2: Content hash tests
// ---------------------------------------------------------------------------
describe("extractContent - E2 content_hash", () => {
    it(
        "returns content_hash in metadata",
        { timeout: 30_000 },
        async () => {
            const result = await extract_content({ file_path: DOCX_PATH });
            const parsed = typeof result === "string" ? JSON.parse(result) : result;

            expect(parsed.error).toBeFalsy();
            expect(parsed.metadata).toHaveProperty("content_hash");
            // SHA-256 hex is 64 characters
            expect(parsed.metadata.content_hash).toMatch(/^[a-f0-9]{64}$/);
        },
    );

    it(
        "content_hash is consistent across two calls on same file",
        { timeout: 60_000 },
        async () => {
            const result1 = await extract_content({ file_path: PDF_PATH });
            const result2 = await extract_content({ file_path: PDF_PATH });
            const parsed1 = typeof result1 === "string" ? JSON.parse(result1) : result1;
            const parsed2 = typeof result2 === "string" ? JSON.parse(result2) : result2;

            expect(parsed1.metadata.content_hash).toBe(parsed2.metadata.content_hash);
        },
    );

    it(
        "content_hash is present for PDF files too",
        { timeout: 30_000 },
        async () => {
            const result = await extract_content({ file_path: PDF_PATH });
            const parsed = typeof result === "string" ? JSON.parse(result) : result;

            expect(parsed.error).toBeFalsy();
            expect(parsed.metadata).toHaveProperty("content_hash");
            expect(parsed.metadata.content_hash).toMatch(/^[a-f0-9]{64}$/);
        },
    );
});

// ---------------------------------------------------------------------------
// E5: Page-range awareness tests
// ---------------------------------------------------------------------------
describe("extractContent - E5 page-range awareness for DOCX", () => {
    it(
        "returns page_count for DOCX files",
        { timeout: 30_000 },
        async () => {
            const result = await extract_content({ file_path: DOCX_PATH });
            const parsed = typeof result === "string" ? JSON.parse(result) : result;

            expect(parsed.error).toBeFalsy();
            expect(parsed.metadata).toHaveProperty("page_count");
            // The SWE40006 docx is exactly 13 pages (confirmed via docProps/app.xml)
            expect(parsed.metadata.page_count).toBe(13);
            expect(Number.isInteger(parsed.metadata.page_count)).toBe(true);
        },
    );

    it(
        "returns truncated_at_page when DOCX content is truncated",
        { timeout: 30_000 },
        async () => {
            const result = await extract_content({
                file_path: DOCX_PATH,
                max_chars: 50,
            });
            const parsed = typeof result === "string" ? JSON.parse(result) : result;

            expect(parsed.error).toBeFalsy();
            expect(parsed.truncated).toBe(true);
            // DOCX with small max_chars should estimate truncated_at_page
            expect(parsed.metadata).toHaveProperty("truncated_at_page");
            expect(parsed.metadata.truncated_at_page).toBeGreaterThanOrEqual(1);
        },
    );

    it(
        "returns truncated_at_page when PDF content is truncated",
        { timeout: 30_000 },
        async () => {
            const result = await extract_content({
                file_path: PDF_PATH,
                max_chars: 30,
            });
            const parsed = typeof result === "string" ? JSON.parse(result) : result;

            expect(parsed.error).toBeFalsy();
            expect(parsed.truncated).toBe(true);
            expect(parsed.metadata).toHaveProperty("truncated_at_page");
            expect(parsed.metadata.truncated_at_page).toBeGreaterThanOrEqual(1);
        },
    );

    it(
        "no truncated_at_page when not truncated",
        { timeout: 30_000 },
        async () => {
            const result = await extract_content({ file_path: DOCX_PATH });
            const parsed = typeof result === "string" ? JSON.parse(result) : result;

            expect(parsed.error).toBeFalsy();
            expect(parsed.truncated).toBe(false);
            // Should NOT have truncated_at_page when not truncated
            // (may be absent or undefined)
            if (parsed.metadata && parsed.metadata.truncated_at_page !== undefined) {
                // If present, it should be null (we allow this)
                expect(parsed.metadata.truncated_at_page).toBeNull();
            }
        },
    );
});

// ---------------------------------------------------------------------------
// E6: PDF text spacing quality
// ---------------------------------------------------------------------------
describe("extractContent - E6 PDF text spacing quality", () => {
    it(
        "words are properly spaced (no character-level fragmentation)",
        { timeout: 30_000 },
        async () => {
            const result = await extract_content({ file_path: PDF_PATH });
            const parsed = typeof result === "string" ? JSON.parse(result) : result;

            expect(parsed.error).toBeFalsy();

            // Common multi-character words that should NOT have internal spaces
            // (e.g., "Parallelism" not "P a r a l l e l i s m")
            const content = parsed.content;
            expect(content).toContain("Parallelism");
            expect(content).toContain("Concurrency");
            expect(content).toContain("Programming");
            expect(content).toContain("Thread");
        },
    );

    it(
        "line breaks are preserved between paragraphs",
        { timeout: 30_000 },
        async () => {
            const result = await extract_content({ file_path: PDF_PATH, max_chars: 500 });
            const parsed = typeof result === "string" ? JSON.parse(result) : result;

            expect(parsed.error).toBeFalsy();
            // Content should contain newlines (not everything on one line)
            expect(parsed.content).toContain("\n");
        },
    );
});

// ---------------------------------------------------------------------------
// E7: PDF table extraction quality
// ---------------------------------------------------------------------------
describe("extractContent - E7 PDF table extraction (MIS PDF)", () => {
    it(
        "table is detected and rendered as Markdown with pipe separators",
        { timeout: 30_000 },
        async () => {
            const result = await extract_content({ file_path: MIS_PDF_PATH, max_chars: 3000 });
            const parsed = typeof result === "string" ? JSON.parse(result) : result;

            expect(parsed.error).toBeFalsy();
            const content = parsed.content;

            // The MIS PDF member table should be detected: look for pipe chars
            // indicating a Markdown table was rendered
            expect(content).toContain("|");
            // Should have a separator row with ---
            expect(content).toContain("---");
            // Should contain member names from the table
            expect(content).toContain("Thanh Phương");
            expect(content).toContain("Nhóm trưởng");
            // Table content should NOT be duplicated: "Thanh Phương" appears exactly once
            // (old code duplicated it in both table markdown and reconstructedText)
            const tpMatches = content.match(/Thanh Phương/g);
            expect(tpMatches).toHaveLength(1);
        },
    );
});
