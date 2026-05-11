import { beforeAll, afterAll } from "vitest";
import { existsSync, mkdirSync, rmSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const tmpDir = join(__dirname, "tmp");

beforeAll(() => {
  // Ensure test/tmp/ exists before all tests
  if (!existsSync(tmpDir)) {
    mkdirSync(tmpDir, { recursive: true });
  }
});

afterAll(() => {
  // Clean test/tmp/ after all tests: remove contents, remove dir, recreate empty
  if (existsSync(tmpDir)) {
    rmSync(tmpDir, { recursive: true, force: true });
  }
  mkdirSync(tmpDir, { recursive: true });
});
