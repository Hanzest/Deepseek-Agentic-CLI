import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "..");

// ---------------------------------------------------------------------------
// Directory constants (relative to project root)
// ---------------------------------------------------------------------------
export const ACTIVE_DIR = "artifacts/active";
export const HISTORY_DIR = "artifacts/history";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function pad(n) {
    return String(n).padStart(2, "0");
}

function resolveActive() {
    return path.resolve(PROJECT_ROOT, ACTIVE_DIR);
}

function resolveHistory() {
    return path.resolve(PROJECT_ROOT, HISTORY_DIR);
}

// ---------------------------------------------------------------------------
// ensureActiveDir()
// Creates artifacts/active/ if it does not exist. Idempotent.
// Returns the resolved absolute path.
// ---------------------------------------------------------------------------
export function ensureActiveDir() {
    const activePath = resolveActive();
    if (!fs.existsSync(activePath)) {
        fs.mkdirSync(activePath, { recursive: true });
    }
    return activePath;
}

// ---------------------------------------------------------------------------
// archiveActiveToHistory(taskName)
// Moves all files from artifacts/active/ into:
//   artifacts/history/{taskName}/{YYYY-MM-DD_HH.MM.SS}/
// If active/ is empty or does not exist, no-op.
// Returns the archive destination path (or null if no-op).
// ---------------------------------------------------------------------------
export function archiveActiveToHistory(taskName) {
    const activePath = resolveActive();

    // No-op if active directory does not exist or is empty
    if (!fs.existsSync(activePath)) {
        return null;
    }
    const files = fs.readdirSync(activePath);
    if (files.length === 0) {
        return null;
    }

    // Build timestamped archive destination
    const now = new Date();
    const ts =
        now.getFullYear() +
        "-" + pad(now.getMonth() + 1) +
        "-" + pad(now.getDate()) +
        "_" + pad(now.getHours()) +
        "." + pad(now.getMinutes()) +
        "." + pad(now.getSeconds());

    const safeName = (taskName || "unnamed").replace(/[^a-zA-Z0-9._-]/g, "-").substring(0, 80);
    const archiveDir = path.join(resolveHistory(), safeName, ts);

    fs.mkdirSync(archiveDir, { recursive: true });

    // Move each file from active to archive
    for (const file of files) {
        const src = path.join(activePath, file);
        const dst = path.join(archiveDir, file);
        fs.renameSync(src, dst);
    }

    return archiveDir;
}

// ---------------------------------------------------------------------------
// isPlanFile(filePath)
// Returns true if the resolved filePath is inside artifacts/active/ AND
// its basename matches plan-orchestrator-*.md
// ---------------------------------------------------------------------------
export function isPlanFile(filePath) {
    const resolved = path.resolve(filePath);
    const activePath = resolveActive();
    const normalizedActive = activePath + path.sep;

    if (!resolved.startsWith(normalizedActive)) {
        return false;
    }

    const basename = path.basename(resolved);
    // Match: optional timestamp prefix, then "plan-orchestrator-" + name + ".md"
    return /^(?:\d{4}-\d{2}-\d{2}_\d{2}\.\d{2}\.\d{2}_)?plan-orchestrator-.+\.md$/.test(basename);
}

// ---------------------------------------------------------------------------
// timestampedFilename(baseFilename)
// Prepends YYYY-MM-DD_HH.MM.SS_ to the base filename.
// ---------------------------------------------------------------------------
export function timestampedFilename(baseFilename) {
    const now = new Date();
    const ts =
        now.getFullYear() +
        "-" + pad(now.getMonth() + 1) +
        "-" + pad(now.getDate()) +
        "_" + pad(now.getHours()) +
        "." + pad(now.getMinutes()) +
        "." + pad(now.getSeconds());
    return ts + "_" + baseFilename;
}

// ---------------------------------------------------------------------------
// extractTaskName(filePath)
// Given a path like:
//   artifacts/active/2026-01-15_14.30.00_plan-orchestrator-foo-bar.md
// extracts "foo-bar".
// Returns empty string if no match.
// ---------------------------------------------------------------------------
export function extractTaskName(filePath) {
    const basename = path.basename(filePath);
    // Strip optional timestamp prefix, then match plan-orchestrator-{name}.md
    const match = basename.match(/(?:\d{4}-\d{2}-\d{2}_\d{2}\.\d{2}\.\d{2}_)?plan-orchestrator-(.+)\.md$/);
    if (!match) {
        return "";
    }
    return match[1];
}
