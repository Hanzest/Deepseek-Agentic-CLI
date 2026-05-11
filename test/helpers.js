import { join, dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const testRoot = __dirname;
const tmpRoot = join(testRoot, "tmp");
const fixturesRoot = join(testRoot, "fixtures");

/**
 * Resolve a path under test/tmp/
 * @param  {...string} segments
 * @returns {string}
 */
export function tmpPath(...segments) {
  return join(tmpRoot, ...segments);
}

/**
 * Resolve a path under test/fixtures/
 * @param  {...string} segments
 * @returns {string}
 */
export function fixturePath(...segments) {
  return join(fixturesRoot, ...segments);
}

/**
 * Create a named subdirectory under test/tmp/
 * @param {string} name
 * @returns {string} path to the created directory
 */
export function createTempDir(name) {
  const dirPath = join(tmpRoot, name);
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true });
  }
  return dirPath;
}

/**
 * Create a file under test/tmp/ with the given content
 * @param {string} name - file name (may include subdirectory segments)
 * @param {string} content
 * @returns {string} path to the created file
 */
export function createTempFile(name, content) {
  const filePath = join(tmpRoot, name);
  const parent = dirname(filePath);
  if (!existsSync(parent)) {
    mkdirSync(parent, { recursive: true });
  }
  writeFileSync(filePath, content, "utf-8");
  return filePath;
}

/**
 * Remove a named subdirectory under test/tmp/
 * @param {string} name
 */
export function cleanupTempDir(name) {
  const dirPath = join(tmpRoot, name);
  if (existsSync(dirPath)) {
    rmSync(dirPath, { recursive: true, force: true });
  }
}

/**
 * Read a file and return its content as a string
 * @param {string} path
 * @returns {string}
 */
export function readFile(path) {
  return readFileSync(path, "utf-8");
}
