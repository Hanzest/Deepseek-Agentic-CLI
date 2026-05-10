import fs from "fs";
import path from "path";
import { C, colorize } from "./colors.js";

function pad(n) {
    return String(n).padStart(2, "0");
}

/**
 * Saves the full conversation messages array to a date-stamped JSON file.
 * Triggered after every complete user-assistant round-trip in the main agent loop.
 * Sub-agents never call this.
 *
 * @param {Array} messages - The full conversation messages array.
 * @param {string} modelName - The model name in use for metadata.
 */
export async function saveChatHistory(messages, modelName) {
    const now = new Date();

    const dateFolder = `${pad(now.getDate())}.${pad(now.getMonth() + 1)}.${now.getFullYear()}`;
    const fileName = `${pad(now.getHours())}.${pad(now.getMinutes())}.${pad(now.getSeconds())}.json`;

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
}
