import fs from "fs";
import path from "path";
import { C, colorize } from "./colors.js";

// Reuse pad from internal scope; kept as a local function
function pad(n) {
    return String(n).padStart(2, "0");
}

/**
 * Sanitizes a string for use in a Windows filename.
 * - Replaces characters illegal on Windows (`<>:"/\|?*`) with hyphens.
 * - Collapses consecutive hyphens/spaces.
 * - Trims to maxLen and removes trailing hyphens/dots.
 *
 * @param {string} raw - The raw title string.
 * @param {number} maxLen - Maximum length (default 50).
 * @returns {string} Sanitized filename-safe string, or "" if empty after sanitization.
 */
export function sanitizeFilename(raw, maxLen = 50) {
    if (!raw || typeof raw !== "string") return "";
    let cleaned = raw
        .replace(/[<>:"/\\|?*]/g, "-")   // replace Windows-illegal chars
        .replace(/\s+/g, " ")             // collapse whitespace
        .replace(/-+/g, "-")              // collapse consecutive hyphens
        .replace(/^[.\s-]+|[.\s-]+$/g, "") // trim leading/trailing dots, spaces, hyphens
        .trim();

    if (cleaned.length > maxLen) {
        // truncate at last word boundary if possible
        cleaned = cleaned.substring(0, maxLen).replace(/[.\s-]+$/, "");
    }

    return cleaned;
}

/**
 * Saves the full conversation messages array to a date-stamped JSON file.
 * Triggered after every complete user-assistant round-trip in the main agent loop.
 * Sub-agents never call this.
 *
 * @param {Array} messages - The full conversation messages array.
 * @param {string} modelName - The model name in use for metadata.
 * @param {string} [title] - Optional short title for the chat (sanitized; appended to filename).
 */
export async function saveChatHistory(messages, modelName, title) {
    const now = new Date();

    const dateFolder = `${pad(now.getDate())}.${pad(now.getMonth() + 1)}.${now.getFullYear()}`;
    const timestamp = `${pad(now.getHours())}.${pad(now.getMinutes())}.${pad(now.getSeconds())}`;

    let fileName;
    if (title) {
        fileName = `${timestamp} - ${title}.json`;
    } else {
        fileName = `${timestamp}.json`;
    }

    const dirPath = path.join(process.cwd(), "chat_history", dateFolder);
    const filePath = path.join(dirPath, fileName);

    fs.mkdirSync(dirPath, { recursive: true });

    // Strip reasoning_content from messages to keep files lean
    const cleanMessages = messages.map((msg) => {
        const { reasoning_content, ...rest } = msg;
        return rest;
    });

    const payload = {
        saved_at: now.toISOString(),
        model_name: modelName,
        message_count: cleanMessages.length,
        messages: cleanMessages,
    };

    fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), "utf-8");

    console.log(
        colorize(`[Chat History] Saved ${cleanMessages.length} messages → chat_history/${dateFolder}/${fileName}`, C.success)
    );
    return timestamp;
}

/**
 * Saves the audit telemetry data to a JSON file alongside the chat history.
 * Uses the same timestamp and title as the conversation save, with an
 * (AUDIT) prefix before the title in the filename.
 *
 * @param {string} timestamp - The HH.MM.SS timestamp from the conversation save.
 * @param {string} title - The sanitized chat title.
 * @param {string} modelName - The model name in use for metadata.
 * @param {object} auditData - Structured audit data from getAuditData().
 */
export async function saveAuditHistory(timestamp, title, modelName, auditData) {
    const now = new Date();
    const dateFolder = `${pad(now.getDate())}.${pad(now.getMonth() + 1)}.${now.getFullYear()}`;

    let fileName;
    if (title) {
        fileName = `${timestamp} - (AUDIT) ${title}.json`;
    } else {
        fileName = `${timestamp} - (AUDIT).json`;
    }

    const dirPath = path.join(process.cwd(), "chat_history", dateFolder);
    const filePath = path.join(dirPath, fileName);

    fs.mkdirSync(dirPath, { recursive: true });

    const payload = {
        saved_at: now.toISOString(),
        model_name: modelName,
        ...auditData,
    };

    fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), "utf-8");

    console.log(
        colorize(`[Chat History] Audit saved → chat_history/${dateFolder}/${fileName}`, C.success)
    );
}


