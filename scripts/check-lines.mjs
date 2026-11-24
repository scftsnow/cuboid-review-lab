import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MAX_LINES = 250;
const SOURCE_EXTENSIONS = new Set([
  ".js",
  ".mjs",
  ".cjs",
  ".jsx",
  ".ts",
  ".tsx",
  ".css",
  ".html",
]);
const EXCLUDED_DIRECTORIES = new Set([
  ".git",
  ".cache",
  ".next",
  ".nuxt",
  ".svelte-kit",
  ".turbo",
  ".vite",
  "build",
  "coverage",
  "dist",
  "node_modules",
]);

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDirectory, "..");

async function collectFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      if (!EXCLUDED_DIRECTORIES.has(entry.name)) {
        files.push(...(await collectFiles(entryPath)));
      }
      continue;
    }

    if (
      entry.isFile() &&
      SOURCE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())
    ) {
      files.push(entryPath);
    }
  }

  return files;
}

function countLines(content) {
  if (content.length === 0) return 0;
  const normalized = content.replace(/\r\n?/g, "\n");
  const lineCount = normalized.split("\n").length;
  return normalized.endsWith("\n") ? lineCount - 1 : lineCount;
}

function relativePath(filePath) {
  return path.relative(repoRoot, filePath).split(path.sep).join("/");
}

const files = await collectFiles(repoRoot);
const checkedFiles = files.map(relativePath).sort();
const failures = [];
let readErrorCount = 0;

for (const relative of checkedFiles) {
  try {
    const content = await readFile(path.join(repoRoot, relative), "utf8");
    const lineCount = countLines(content);
    if (lineCount > MAX_LINES) failures.push({ relative, lineCount });
  } catch (error) {
    readErrorCount += 1;
    const message = error instanceof Error ? error.message : String(error);
    console.error(`READ ERROR ${relative}: ${message}`);
  }
}

console.log(`Checked files: ${checkedFiles.length}`);
console.log(`Failed files: ${failures.length}`);
for (const failure of failures) {
  console.log(`${failure.relative}: ${failure.lineCount} lines`);
}

if (failures.length > 0 || readErrorCount > 0) process.exitCode = 1;
