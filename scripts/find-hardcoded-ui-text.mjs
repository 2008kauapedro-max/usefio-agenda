import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(process.argv[2] ?? "src");
const EXTENSIONS = new Set([".tsx", ".jsx"]);
const IGNORE_DIRS = new Set([
  "node_modules",
  ".next",
  "dist",
  "build",
  ".git",
]);

const probableText =
  />\s*([A-Za-zÀ-ÿ][^<{>\n]{2,})\s*</g;

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (IGNORE_DIRS.has(entry.name)) continue;

    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      walk(fullPath);
      continue;
    }

    if (!EXTENSIONS.has(path.extname(entry.name))) continue;

    const source = fs.readFileSync(fullPath, "utf8");
    const lines = source.split(/\r?\n/);

    lines.forEach((line, index) => {
      probableText.lastIndex = 0;
      let match;

      while ((match = probableText.exec(line))) {
        const text = match[1].trim();

        if (
          text.length >= 3 &&
          !text.startsWith("http") &&
          !/^[\d\s.,:;!?%+-]+$/.test(text)
        ) {
          console.log(
            `${path.relative(process.cwd(), fullPath)}:${index + 1}  ${text}`
          );
        }
      }
    });
  }
}

if (!fs.existsSync(ROOT)) {
  console.error(`Pasta não encontrada: ${ROOT}`);
  process.exit(1);
}

walk(ROOT);
