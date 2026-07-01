import path from "node:path";
import fs from "node:fs";
import { parseArgs } from "../utils/args.js";
import { exists, readJson, walk, writeJson } from "../utils/fs.js";

const exts = new Set([".js", ".ts", ".tsx", ".jsx", ".java", ".kt", ".py", ".go", ".cs", ".sql", ".yml", ".yaml", ".json"]);
const generatedParts = new Set(["obj", "bin", "generated", ".chay", ".chay-index", "memory", "audit"]);

export async function scanRepo(argv) {
  const args = parseArgs(argv);
  const root = path.resolve(args.root || ".");
  const out = args.out || ".chay-index/project_map.json";
  const previous = previousIndex(out);

  const files = walk(root)
    .filter((file) => exts.has(path.extname(file)))
    .filter((file) => !isGeneratedPath(path.relative(root, file)))
    .map((file) => {
      const rel = path.relative(root, file);
      const stat = fs.statSync(file);
      const cached = previous.get(rel);
      if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
        return cached;
      }
      const text = fs.readFileSync(file, "utf8");
      return {
        path: rel,
        ext: path.extname(file),
        lines: text.split(/\r?\n/).length,
        mtimeMs: stat.mtimeMs,
        size: stat.size,
        role: inferRole(rel, text)
      };
    });

  const index = {
    generated_at: new Date().toISOString(),
    root,
    strategy: "mtime_size_incremental_v1",
    file_count: files.length,
    files
  };

  writeJson(out, index);
  console.log(JSON.stringify({ ok: true, out, file_count: files.length }, null, 2));
}

function previousIndex(file) {
  if (!exists(file)) return new Map();
  try {
    const index = readJson(file);
    return new Map((index.files || []).map((item) => [item.path, item]));
  } catch {
    return new Map();
  }
}

function isGeneratedPath(file) {
  return file.split(path.sep).some((part) => generatedParts.has(part));
}

function inferRole(file, text) {
  const name = file.toLowerCase();
  if (name.includes("controller") || text.includes("@RestController")) return "api_controller";
  if (name.includes("service")) return "service";
  if (name.includes("repository") || name.includes("dao")) return "repository";
  if (name.includes("entity") || name.includes("model")) return "model";
  if (name.includes("test") || name.includes("spec")) return "test";
  if (name.includes("route")) return "route";
  if (name.includes("schema") || name.includes("migration")) return "database";
  return "source";
}
