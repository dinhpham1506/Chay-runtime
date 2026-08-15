import path from "node:path";
import fs from "node:fs";
import { parseArgs } from "../utils/args.js";
import { exists, readJson, walk, writeJson } from "../utils/fs.js";

const exts = new Set([".js", ".ts", ".tsx", ".jsx", ".java", ".kt", ".py", ".go", ".cs", ".sql", ".yml", ".yaml", ".json"]);
const generatedParts = new Set(["obj", "bin", "generated", ".chay", ".chay-index", "chay-memory", "chay-structure", "memory", "audit", "backup", "backups", ".cache"]);
const ignoredFileNames = new Set(["package-lock.json", "pnpm-lock.yaml", "yarn.lock", "bun.lockb"]);
const defaultMaxFileBytes = 250_000;
const scanVersion = "repo_scan_v3_api_imports";

export async function scanRepo(argv) {
  const args = parseArgs(argv);
  const root = path.resolve(args.root || ".");
  const out = args.out || ".chay/project_map.json";
  const previous = previousIndex(out);
  const maxFileBytes = Number(args["max-file-bytes"] || defaultMaxFileBytes);
  const includeLarge = Boolean(args["include-large"]);

  const files = walk(root)
    .filter((file) => exts.has(path.extname(file)))
    .filter((file) => {
      const rel = path.relative(root, file);
      if (isGeneratedPath(rel)) return false;
      const stat = fs.statSync(file);
      return !isIgnoredFile(rel, stat, { includeLarge, maxFileBytes });
    })
    .map((file) => {
      const rel = path.relative(root, file);
      const stat = fs.statSync(file);
      const cached = previous.get(rel);
      if (cached && cached.scanVersion === scanVersion && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
        return cached;
      }
      const text = fs.readFileSync(file, "utf8");
      return {
        scanVersion,
        path: rel,
        ext: path.extname(file),
        lines: text.split(/\r?\n/).length,
        mtimeMs: stat.mtimeMs,
        size: stat.size,
        role: inferRole(rel, text),
        imports: extractImports(rel, text),
        api_routes: inferApiRoutes(rel, text)
      };
    });

  const index = {
    generated_at: new Date().toISOString(),
    root,
    strategy: "mtime_size_incremental_v3_api_imports_skip_generated_lock_backups_large",
    selection_limits: {
      include_large: includeLarge,
      max_file_bytes: includeLarge ? null : maxFileBytes,
      skipped_lockfiles: [...ignoredFileNames]
    },
    file_count: files.length,
    files
  };

  writeJson(out, index);
  if (!args.quiet) console.log(JSON.stringify({ ok: true, out, file_count: files.length }, null, 2));
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

function isIgnoredFile(file, stat, options) {
  const name = path.basename(file);
  if (ignoredFileNames.has(name)) return true;
  if (!options.includeLarge && stat.size > options.maxFileBytes) return true;
  return false;
}

function inferRole(file, text) {
  const name = file.toLowerCase();
  if (isApiPath(name, text)) return "api_controller";
  if (name.includes("controller") || text.includes("@RestController")) return "api_controller";
  if (name.includes("service")) return "service";
  if (name.includes("repository") || name.includes("dao")) return "repository";
  if (name.includes("entity") || name.includes("model")) return "model";
  if (name.includes("test") || name.includes("spec")) return "test";
  if (name.includes("route")) return "route";
  if (name.includes("schema") || name.includes("migration")) return "database";
  return "source";
}

function isApiPath(name, text) {
  return name.includes("netlify/functions/") ||
    name.includes("/api/") ||
    name.includes("\\api\\") ||
    name.includes("routes/") ||
    name.includes("route.") ||
    text.includes("app.get(") ||
    text.includes("app.post(") ||
    text.includes("router.get(") ||
    text.includes("router.post(") ||
    text.includes("export const handler") ||
    text.includes("export async function handler");
}

function inferApiRoutes(file, text) {
  const normalized = file.replace(/\\/g, "/");
  const routes = [];

  const netlify = normalized.match(/(?:^|\/)netlify\/functions\/(.+?)\.[^.]+$/);
  if (netlify) routes.push(`/.netlify/functions/${netlify[1]}`);

  const serverApi = normalized.match(/(?:^|\/)(?:src\/)?api\/(.+?)\.[^.]+$/);
  if (serverApi) routes.push(`/api/${serverApi[1].replace(/\/index$/, "")}`);

  const pagesApi = normalized.match(/(?:^|\/)pages\/api\/(.+?)\.[^.]+$/);
  if (pagesApi) routes.push(`/api/${pagesApi[1].replace(/\/index$/, "")}`);

  const routeMatches = text.matchAll(/(?:app|router)\.(get|post|put|patch|delete)\(\s*["'`]([^"'`]+)["'`]/g);
  for (const match of routeMatches) routes.push(`${match[1].toUpperCase()} ${match[2]}`);

  return [...new Set(routes)];
}

function extractImports(file, text) {
  if (!/\.[cm]?[jt]sx?$/.test(file)) return [];
  const imports = [];
  const importMatches = text.matchAll(/\bimport\s+(?:[^"'`]*?\s+from\s+)?["'`]([^"'`]+)["'`]/g);
  for (const match of importMatches) imports.push(match[1]);
  const requireMatches = text.matchAll(/\brequire\(\s*["'`]([^"'`]+)["'`]\s*\)/g);
  for (const match of requireMatches) imports.push(match[1]);
  return [...new Set(imports)].filter((item) => item.startsWith(".") || item.startsWith("/"));
}
