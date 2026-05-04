import fs from "fs";
import path from "path";

/**
 * Pads a number to 2 digits with a leading zero.
 * @param {number} n
 * @returns {string}
 */
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

    // Date folder: DD.MM.YYYY
    const dateFolder = `${pad(now.getDate())}.${pad(now.getMonth() + 1)}.${now.getFullYear()}`;
    // Filename: HH.MM.SS
    const fileName = `${pad(now.getHours())}.${pad(now.getMinutes())}.${pad(now.getSeconds())}.json`;

    const dirPath = path.join(process.cwd(), "chat_history", dateFolder);
    const filePath = path.join(dirPath, fileName);

    // Ensure the date folder exists
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
        `\x1b[32m[Chat History] Saved ${cleanMessages.length} messages → chat_history/${dateFolder}/${fileName}\x1b[0m`
    );
}
