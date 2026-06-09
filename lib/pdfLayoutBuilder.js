// ---------------------------------------------------------------------------
// pdfLayoutBuilder.js
//
// Position-aware PDF text layout reconstruction and table detection.
// Uses pdfjs-dist TextItem properties (transform, width, height, hasEOL)
// to reconstruct proper word spacing, line breaks, and Markdown tables.
// ---------------------------------------------------------------------------

/**
 * Group TextItems into lines based on Y-coordinate proximity.
 *
 * @param {Array<{str:string, transform:number[], width:number, height:number}>} items
 * @returns {Array<Array<object>>} Lines, each an array of items sorted by X.
 */
function groupIntoLines(items) {
    if (!items || items.length === 0) return [];

    // Compute median height for Y-tolerance
    const heights = items.map((i) => i.height).filter((h) => h > 0);
    const medianHeight =
        heights.length > 0
            ? heights.sort((a, b) => a - b)[Math.floor(heights.length / 2)]
            : 10;
    const yTolerance = medianHeight * 0.5;

    // Sort by Y descending (top→bottom in PDF coords), then X ascending
    const sorted = [...items].sort((a, b) => {
        const yDiff = b.transform[5] - a.transform[5];
        if (Math.abs(yDiff) > 1) return yDiff;
        return a.transform[4] - b.transform[4];
    });

    // Group consecutive items by Y proximity
    const lines = [];
    let currentLine = [sorted[0]];

    for (let i = 1; i < sorted.length; i++) {
        const prev = sorted[i - 1];
        const curr = sorted[i];
        const yDiff = Math.abs(curr.transform[5] - prev.transform[5]);

        if (yDiff > yTolerance) {
            lines.push(currentLine);
            currentLine = [curr];
        } else {
            currentLine.push(curr);
        }
    }
    lines.push(currentLine);

    // Sort items within each line by X ascending
    for (const line of lines) {
        line.sort((a, b) => a.transform[4] - b.transform[4]);
    }

    return lines;
}

/**
 * Determine whether a space should be inserted between two consecutive items
 * on the same line.
 *
 * @param {object} current  - The left (earlier) item.
 * @param {object} next     - The right (later) item.
 * @returns {boolean} True if a word-boundary space is needed.
 */
function isWordBoundary(current, next) {
    const charWidth = current.width / Math.max(1, current.str.length);
    const currentEndX = current.transform[4] + current.width;
    const nextStartX = next.transform[4];
    const gap = nextStartX - currentEndX;

    // For multi-character items we have a good estimate of char width;
    // for single characters we're more conservative about adding spaces.
    const threshold = current.str.length > 1 ? 0.5 : 0.35;
    return gap > charWidth * threshold;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Reconstruct position-aware plain text from pdfjs-dist TextItems.
 *
 * Groups items into lines by Y-coordinate, then within each line
 * uses X-gaps to decide same-word vs. word-boundary spacing.
 *
 * @param {Array<{str:string, transform:number[], width:number, height:number, hasEOL?:boolean}>} items
 * @returns {string} Reconstructed text with proper spacing and line breaks.
 */
export function reconstructText(items) {
    const textItems = (items || []).filter((i) => typeof i.str === "string");
    if (textItems.length === 0) return "";

    const lines = groupIntoLines(textItems);
    const lineTexts = [];

    for (let li = 0; li < lines.length; li++) {
        const line = lines[li];
        let text = "";

        for (let i = 0; i < line.length; i++) {
            text += line[i].str;

            if (i < line.length - 1) {
                if (isWordBoundary(line[i], line[i + 1])) {
                    text += " ";
                }
            }
        }

        lineTexts.push(text);
    }

    // Join lines. Use Y-gap to decide paragraph vs soft break.
    let result = "";
    for (let i = 0; i < lineTexts.length; i++) {
        result += lineTexts[i];
        if (i < lineTexts.length - 1) {
            // Compute Y-distance between this line and the next
            const thisLine = lines[i];
            const nextLine = lines[i + 1];
            const thisLastY = thisLine[thisLine.length - 1].transform[5];
            const nextFirstY = nextLine[0].transform[5];
            const yGap = thisLastY - nextFirstY; // positive = gap between lines

            // Use median height of both lines to determine if gap is paragraph-sized
            const allHeights = [...thisLine.map((i) => i.height), ...nextLine.map((i) => i.height)];
            const avgH = allHeights.reduce((s, h) => s + h, 0) / allHeights.length;

            if (yGap > avgH * 1.2) {
                result += "\n\n"; // paragraph break
            } else {
                result += "\n"; // soft line break
            }
        }
    }

    // Collapse 3+ consecutive newlines into 2
    result = result.replace(/\n{3,}/g, "\n\n");

    // Trim leading/trailing whitespace
    return result.trim();
}

/**
 * Detect table structure in TextItems and return a Markdown table string.
 *
 * Algorithm:
 * 1. Group items into lines by Y (same as reconstructText).
 * 2. Collect X-start positions across rows and cluster into columns.
 * 3. If a consistent grid is found (≥2 columns, ≥3 rows, ≥60% occupancy),
 *    output as Markdown with |-separated cells.
 * 4. Otherwise return null (no table detected).
 *
 * @param {Array<{str:string, transform:number[], width:number, height:number}>} items
 * @returns {string|null} Markdown table string, or null.
 */
export function buildTable(items) {
    const textItems = (items || []).filter((i) => typeof i.str === "string");
    if (textItems.length < 6) return { markdown: null, usedItems: new Set() };

    const lines = groupIntoLines(textItems);
    if (lines.length < 3) return { markdown: null, usedItems: new Set() };

    // ------------------------------------------------------------------
    // Step 1: Collect X-start positions across all lines that have ≥2 items
    // ------------------------------------------------------------------
    const multiItemLines = lines.filter((line) => line.length >= 2);
    if (multiItemLines.length < 2) return { markdown: null, usedItems: new Set() };

    // Build a map: X-start value → count of occurrences across all rows
    const xStartCounts = new Map();
    for (const line of multiItemLines) {
        const seenInThisRow = new Set();
        for (const item of line) {
            const x = Math.round(item.transform[4]);
            if (!seenInThisRow.has(x)) {
                seenInThisRow.add(x);
                xStartCounts.set(x, (xStartCounts.get(x) || 0) + 1);
            }
        }
    }

    // ------------------------------------------------------------------
    // Step 2: Cluster X-start values into columns
    // ------------------------------------------------------------------
    // Sort unique X-start values
    const uniqueX = [...xStartCounts.keys()].sort((a, b) => a - b);
    if (uniqueX.length < 2) return { markdown: null, usedItems: new Set() };

    // Compute average character width for clustering threshold
    const allWidths = textItems.map((i) => i.width / Math.max(1, i.str.length)).filter((w) => w > 0);
    const avgCharWidth =
        allWidths.length > 0
            ? allWidths.reduce((s, w) => s + w, 0) / allWidths.length
            : 5;
    const clusterThreshold = Math.max(avgCharWidth * 2, 10);

    // Cluster: nearby X values belong to the same column
    const clusters = [];
    let currentCluster = { x: uniqueX[0], values: [uniqueX[0]], count: xStartCounts.get(uniqueX[0]) };

    for (let i = 1; i < uniqueX.length; i++) {
        if (uniqueX[i] - currentCluster.x <= clusterThreshold) {
            currentCluster.values.push(uniqueX[i]);
            currentCluster.count += xStartCounts.get(uniqueX[i]);
            currentCluster.x = uniqueX[i]; // use rightmost for next comparison
        } else {
            clusters.push(currentCluster);
            currentCluster = { x: uniqueX[i], values: [uniqueX[i]], count: xStartCounts.get(uniqueX[i]) };
        }
    }
    clusters.push(currentCluster);

    // Filter clusters that appear in at least 2 rows
    const validClusters = clusters.filter((c) => c.count >= 2);
    if (validClusters.length < 2) return { markdown: null, usedItems: new Set() };

    // Sort clusters by their median X position
    validClusters.sort((a, b) => {
        const aMed = a.values.reduce((s, v) => s + v, 0) / a.values.length;
        const bMed = b.values.reduce((s, v) => s + v, 0) / b.values.length;
        return aMed - bMed;
    });

    const columnCount = validClusters.length;

    // ------------------------------------------------------------------
    // Step 3: Assign each item to a column
    // ------------------------------------------------------------------
    function findColumn(itemX) {
        for (let c = 0; c < validClusters.length; c++) {
            const cluster = validClusters[c];
            const minX = Math.min(...cluster.values);
            const maxX = Math.max(...cluster.values);
            if (itemX >= minX - clusterThreshold * 0.5 && itemX <= maxX + clusterThreshold * 0.5) {
                return c;
            }
        }
        return -1;
    }

    // Build grid: rows → columns → text
    const grid = [];
    const tableItems = []; // Track items used in table for dedup
    for (const line of lines) {
        const row = new Array(columnCount).fill("");
        let assignedCount = 0;
        for (const item of line) {
            const col = findColumn(Math.round(item.transform[4]));
            if (col >= 0) {
                row[col] += item.str;
                tableItems.push(item);
                assignedCount++;
            }
        }
        grid.push(row);
    }

    // ------------------------------------------------------------------
    // Step 4: Check column consistency
    // ------------------------------------------------------------------
    let rowsWithAllColumns = 0;
    for (const row of grid) {
        const nonEmpty = row.filter((cell) => cell.trim().length > 0).length;
        if (nonEmpty === columnCount) {
            rowsWithAllColumns++;
        }
    }

    const consistencyRatio = rowsWithAllColumns / grid.length;
    if (consistencyRatio < 0.6) return { markdown: null, usedItems: new Set() };

    // ------------------------------------------------------------------
    // Step 5: Render as Markdown table
    // ------------------------------------------------------------------
    const headerRow = grid[0];
    const separatorRow = new Array(columnCount).fill("---");
    const dataRows = grid.slice(1);

    // Trim each cell
    const trimRow = (row) => row.map((cell) => cell.trim());

    const mdRows = [
        `| ${trimRow(headerRow).join(" | ")} |`,
        `| ${separatorRow.join(" | ")} |`,
        ...dataRows.map((row) => `| ${trimRow(row).join(" | ")} |`),
    ];

    return { markdown: mdRows.join("\n"), usedItems: new Set(tableItems) };
}
