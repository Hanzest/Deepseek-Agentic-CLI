// ---------------------------------------------------------------------------
// Shared file-reading utility.
//
// Centralises fs.readFileSync with consistent \r\n → \n normalisation so that
// all tools operate on the same line-ending representation.  Without this
// normalisation, tools that strip \r before display (read_file_chunk) produce
// output that does not match the raw file content used by mutation tools
// (patch_file, write_or_create_file), causing invisible search-string
// mismatches on Windows.
// ---------------------------------------------------------------------------

import fs from "fs";

/**
 * Read a UTF-8 text file and normalise Windows-style line endings (\r\n → \n).
 *
 * On Linux/macOS the replacement is a no-op (\r\n sequences don't appear in
 * native text files), so this is safe everywhere.
 *
 * @param {string} filePath - Absolute or relative path to the file.
 * @returns {string} Normalised file content.
 * @throws {Error} Re-throws any fs.readFileSync error (ENOENT, EACCES, etc.).
 */
export function readFileUtf8Normalized(filePath) {
    return fs.readFileSync(filePath, "utf-8").replace(/\r\n/g, "\n");
}
