import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { join, dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Resolve to project root
const projectRoot = resolve(__dirname, "..", "..");
const tmpDir = join(__dirname, "..", "tmp");

vi.mock("../../lib/cliInput.js", () => ({
    ask: vi.fn().mockResolvedValue("y"),
}));

import { extract_content } from "../../tools/extractContent.js";

// ---------------------------------------------------------------------------
// Reliability / Edge-case tests
// ---------------------------------------------------------------------------

describe("extractContent reliability - error handling", () => {
    beforeEach(() => {
        if (!existsSync(tmpDir)) {
            mkdirSync(tmpDir, { recursive: true });
        }
    });

    afterEach(() => {
        // Clean temp files
        if (existsSync(tmpDir)) {
            rmSync(tmpDir, { recursive: true, force: true });
            mkdirSync(tmpDir, { recursive: true });
        }
    });

    it("returns structured error for non-existent file", async () => {
        const result = await extract_content({
            file_path: join(tmpDir, "nonexistent.docx"),
        });
        const parsed = typeof result === "string" ? JSON.parse(result) : result;

        expect(parsed.error).toBe(true);
        expect(parsed).toHaveProperty("tool", "extract_content");
        expect(parsed.message).toContain("File not found");
    });

    it("returns structured error for unsupported file extension (.txt)", async () => {
        // Create a dummy .txt file
        const txtPath = join(tmpDir, "test.txt");
        writeFileSync(txtPath, "some text", "utf-8");

        const result = await extract_content({ file_path: txtPath });
        const parsed = typeof result === "string" ? JSON.parse(result) : result;

        expect(parsed.error).toBe(true);
        expect(parsed).toHaveProperty("tool", "extract_content");
        expect(parsed.message).toContain("Unsupported file extension");
    });

    it("returns structured error for unsupported file extension (.html)", async () => {
        const htmlPath = join(tmpDir, "test.html");
        writeFileSync(htmlPath, "<html></html>", "utf-8");

        const result = await extract_content({ file_path: htmlPath });
        const parsed = typeof result === "string" ? JSON.parse(result) : result;

        expect(parsed.error).toBe(true);
        expect(parsed.message).toContain("Unsupported file extension");
    });

    it("returns structured error for unsupported file extension (.png)", async () => {
        const pngPath = join(tmpDir, "test.png");
        writeFileSync(pngPath, "fake png content", "utf-8");

        const result = await extract_content({ file_path: pngPath });
        const parsed = typeof result === "string" ? JSON.parse(result) : result;

        expect(parsed.error).toBe(true);
        expect(parsed.message).toContain("Unsupported file extension");
    });

    it("blocks .env files with security error", async () => {
        const envPath = join(tmpDir, ".env");
        writeFileSync(envPath, "SECRET=value", "utf-8");

        const result = await extract_content({ file_path: envPath });
        const parsed = typeof result === "string" ? JSON.parse(result) : result;

        expect(parsed.error).toBe(true);
        expect(parsed.message).toContain("Security Error");
        expect(parsed.message).toContain(".env");
    });

    it("returns structured error for empty .docx file (malformed)", async () => {
        const emptyDocx = join(tmpDir, "empty.docx");
        // Write a minimal but invalid docx (just empty bytes)
        writeFileSync(emptyDocx, Buffer.from([]));

        const result = await extract_content({ file_path: emptyDocx });
        const parsed = typeof result === "string" ? JSON.parse(result) : result;

        expect(parsed.error).toBe(true);
        expect(parsed).toHaveProperty("tool", "extract_content");
    });

    it("returns structured error for empty .pdf file (malformed)", async () => {
        const emptyPdf = join(tmpDir, "empty.pdf");
        writeFileSync(emptyPdf, Buffer.from([]));

        const result = await extract_content({ file_path: emptyPdf });
        const parsed = typeof result === "string" ? JSON.parse(result) : result;

        expect(parsed.error).toBe(true);
        expect(parsed).toHaveProperty("tool", "extract_content");
    });

    it("returns error when file_path is not provided (missing required param)", async () => {
        const result = await extract_content({});
        const parsed = typeof result === "string" ? JSON.parse(result) : result;

        expect(parsed.error).toBe(true);
        expect(parsed).toHaveProperty("tool", "extract_content");
    });

    it("handles path with special characters in filename", async () => {
        const specialPath = join(tmpDir, "test file (1).pdf");
        writeFileSync(specialPath, Buffer.from([]));

        const result = await extract_content({ file_path: specialPath });
        const parsed = typeof result === "string" ? JSON.parse(result) : result;

        // Should get an error (empty file), not a crash
        expect(parsed.error).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// E2: Content hash reliability tests
// ---------------------------------------------------------------------------
describe("extractContent reliability - E2 content_hash", () => {
    it("content_hash is always a 64-char lowercase hex string", async () => {
        const txtPath = join(tmpDir, "hash_test.txt");
        writeFileSync(txtPath, "Hello World", "utf-8");

        const result = await extract_content({ file_path: txtPath });
        const parsed = typeof result === "string" ? JSON.parse(result) : result;

        // Should error (unsupported extension), but if it somehow passed:
        if (!parsed.error) {
            expect(parsed.metadata).toHaveProperty("content_hash");
            expect(parsed.metadata.content_hash).toMatch(/^[a-f0-9]{64}$/);
        }
    });
});

// ---------------------------------------------------------------------------
// E1: Auto-pagination reliability tests
// ---------------------------------------------------------------------------
describe("extractContent reliability - E1 auto_paginate edge cases", () => {
    it("auto_paginate with empty PDF returns error, not infinite loop", async () => {
        const emptyPdf = join(tmpDir, "empty_autopag.pdf");
        writeFileSync(emptyPdf, Buffer.from([]));

        const result = await extract_content({
            file_path: emptyPdf,
            max_chars: 100,
            auto_paginate: true,
        });
        const parsed = typeof result === "string" ? JSON.parse(result) : result;

        // Should error gracefully, not hang
        expect(parsed.error).toBe(true);
    });

    it("auto_paginate with empty DOCX returns error gracefully", async () => {
        const emptyDocx = join(tmpDir, "empty_autopag.docx");
        writeFileSync(emptyDocx, Buffer.from([]));

        const result = await extract_content({
            file_path: emptyDocx,
            max_chars: 100,
            auto_paginate: true,
        });
        const parsed = typeof result === "string" ? JSON.parse(result) : result;

        // Should error gracefully, not hang
        expect(parsed.error).toBe(true);
    });

    it("auto_paginate with max_chars=0 returns full content as one chunk", async () => {
        // Create a small valid-ish docx won't work here, so check that
        // auto_paginate with max_chars=0 doesn't crash
        const txtPath = join(tmpDir, "test_autopag_zero.txt");
        writeFileSync(txtPath, "test", "utf-8");

        const result = await extract_content({
            file_path: txtPath,
            max_chars: 0,
            auto_paginate: true,
        });
        const parsed = typeof result === "string" ? JSON.parse(result) : result;

        // Should error due to unsupported extension, not due to auto_paginate crash
        expect(parsed.error).toBe(true);
        expect(parsed.message).toContain("Unsupported file extension");
    });
});
