import path from "node:path";
import { parseArgs } from "../utils/args.js";
import { exists, readJson, writeJson, writeText } from "../utils/fs.js";
import { scanRepo } from "./repoScan.js";

export async function createSystemMap(argv = []) {
  const args = parseArgs(argv);
  const root = args.root || ".";
  const indexFile = args.index || args["project-map"] || ".chay/project_map.json";
  const out = args.out || "chay-memory/system_map.json";
  const overviewOut = args["overview-out"] || "chay-structure/system_overview.md";
  const apiOut = args["api-out"] || "chay-structure/api_inventory.md";
  const folderOut = args["folder-out"] || "chay-structure/system_folder_map.md";
  const plantumlOverviewOut = args["plantuml-overview-out"] || "chay-structure/diagrams/system-overview.puml";
  const plantumlApiOut = args["plantuml-api-out"] || "chay-structure/diagrams/api-inventory.puml";

  if (args.scan || !exists(indexFile)) {
    await quiet(() => scanRepo(["--root", root, "--out", indexFile, "--quiet"]));
  }

  if (!exists(indexFile)) throw new Error(`project map not found: ${indexFile}`);
  const index = readJson(indexFile);
  const map = buildSystemMap(index);

  writeJson(out, map);
  writeText(overviewOut, systemOverviewMarkdown(map));
  writeText(apiOut, apiInventoryMarkdown(map));
  writeText(folderOut, folderMapMarkdown(map));
  writeText(plantumlOverviewOut, `${plantumlSystemOverview(map)}\n`);
  writeText(plantumlApiOut, `${plantumlApiInventory(map)}\n`);

  console.log(JSON.stringify({
    ok: true,
    command: "system map",
    index: indexFile,
    out,
    overview: overviewOut,
    api_inventory: apiOut,
    folder_map: folderOut,
    plantuml_overview: plantumlOverviewOut,
    plantuml_api: plantumlApiOut,
    api_count: map.api_entries.length,
    feature_candidate_count: map.feature_candidates.length,
    next_action: "Review chay-structure/system_overview.md, then run cr go \"Feature name\" with the matching files."
  }, null, 2));
}

export function buildSystemMap(index) {
  const files = Array.isArray(index?.files) ? index.files : [];
  const byPath = new Map(files.map((file) => [normalizePath(file.path), { ...file, path: normalizePath(file.path) }]));
  const apiEntries = files
    .filter((file) => Array.isArray(file.api_routes) && file.api_routes.length > 0)
    .map((file) => apiEntry(file, byPath))
    .sort((a, b) => a.file.localeCompare(b.file));
  const folders = folderGroups(files);
  const role_counts = roleCounts(files);
  const feature_candidates = featureCandidates(apiEntries);

  return {
    generated_at: new Date().toISOString(),
    source: {
      root: index?.root || "",
      project_map_strategy: index?.strategy || "",
      project_file_count: files.length
    },
    role_counts,
    layers: layerSummary(files),
    folders,
    api_entries: apiEntries,
    feature_candidates
  };
}

function apiEntry(file, byPath) {
  const normalized = normalizePath(file.path);
  const resolvedImports = resolveImports(file, byPath);
  return {
    file: normalized,
    role: file.role || "source",
    routes: file.api_routes || [],
    imports: file.imports || [],
    linked_files: resolvedImports.map((item) => item.path),
    linked_roles: [...new Set(resolvedImports.map((item) => item.role || "source"))]
  };
}

function resolveImports(file, byPath) {
  const from = normalizePath(file.path);
  const fromDir = from.includes("/") ? from.split("/").slice(0, -1).join("/") : ".";
  const out = [];
  for (const spec of file.imports || []) {
    const target = resolveImport(fromDir, spec, byPath);
    if (target) out.push(target);
  }
  return out;
}

function resolveImport(fromDir, spec, byPath) {
  const raw = String(spec || "");
  if (!raw.startsWith(".") && !raw.startsWith("/")) return null;
  const base = normalizePath(path.posix.normalize(path.posix.join(fromDir, raw)));
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.js`,
    `${base}.jsx`,
    `${base}/index.ts`,
    `${base}/index.tsx`,
    `${base}/index.js`,
    `${base}/index.jsx`
  ];
  return candidates.map((item) => byPath.get(item)).find(Boolean) || null;
}

function folderGroups(files) {
  const groups = new Map();
  for (const file of files) {
    const normalized = normalizePath(file.path);
    const folder = normalized.includes("/") ? normalized.split("/").slice(0, -1).join("/") : ".";
    if (!groups.has(folder)) groups.set(folder, { folder, file_count: 0, roles: new Map(), examples: [] });
    const group = groups.get(folder);
    group.file_count += 1;
    group.roles.set(file.role || "source", (group.roles.get(file.role || "source") || 0) + 1);
    if (group.examples.length < 4) group.examples.push(normalized);
  }
  return [...groups.values()]
    .sort((a, b) => b.file_count - a.file_count || a.folder.localeCompare(b.folder))
    .map((group) => ({
      folder: group.folder,
      file_count: group.file_count,
      roles: [...group.roles.entries()].sort((a, b) => b[1] - a[1]).map(([role, count]) => ({ role, count })),
      examples: group.examples
    }));
}

function roleCounts(files) {
  const counts = {};
  for (const file of files) counts[file.role || "source"] = (counts[file.role || "source"] || 0) + 1;
  return Object.fromEntries(Object.entries(counts).sort((a, b) => b[1] - a[1]));
}

function layerSummary(files) {
  return [
    { layer: "client/ui", files: files.filter((file) => isClient(file.path)).length },
    { layer: "api", files: files.filter((file) => file.role === "api_controller" || routeCount(file) > 0).length },
    { layer: "service", files: files.filter((file) => file.role === "service").length },
    { layer: "repository/model", files: files.filter((file) => ["repository", "model"].includes(file.role)).length },
    { layer: "database", files: files.filter((file) => file.role === "database").length },
    { layer: "test", files: files.filter((file) => file.role === "test").length }
  ];
}

function featureCandidates(apiEntries) {
  const groups = new Map();
  for (const entry of apiEntries) {
    for (const route of entry.routes) {
      const key = featureKey(route, entry.file);
      if (!groups.has(key)) groups.set(key, { feature_id: key, routes: [], files: new Set(), linked_files: new Set() });
      const group = groups.get(key);
      group.routes.push(route);
      group.files.add(entry.file);
      for (const linked of entry.linked_files) group.linked_files.add(linked);
    }
  }
  return [...groups.values()]
    .map((group) => ({
      feature_id: group.feature_id,
      route_count: group.routes.length,
      routes: [...new Set(group.routes)].sort(),
      files: [...group.files].sort(),
      linked_files: [...group.linked_files].sort()
    }))
    .sort((a, b) => b.route_count - a.route_count || a.feature_id.localeCompare(b.feature_id));
}

function featureKey(route, file) {
  const text = String(route || file || "")
    .replace(/^(GET|POST|PUT|PATCH|DELETE)\s+/i, "")
    .replace(/^\/\.netlify\/functions\//, "/")
    .replace(/^\/api\//, "/")
    .replace(/:[a-zA-Z0-9_]+/g, "")
    .split("?")[0];
  const parts = text.split("/").map((part) => part.trim()).filter(Boolean);
  const useful = parts.slice(0, 2).join("_") || path.basename(file || "feature").replace(/\.[^.]+$/, "");
  return slug(useful);
}

function systemOverviewMarkdown(map) {
  const lines = [
    "# System Overview",
    "",
    "This is the initial system baseline generated from the whole repository scan. Use it to understand existing APIs and likely feature areas before creating one per-feature contract.",
    "",
    `Generated: ${map.generated_at}`,
    `Project root: ${map.source.root}`,
    `Scanned files: ${map.source.project_file_count}`,
    "",
    "## Layers",
    "",
    "| Layer | Files |",
    "| --- | ---: |"
  ];
  for (const layer of map.layers) lines.push(`| ${layer.layer} | ${layer.files} |`);

  lines.push("", "## Role Counts", "", "| Role | Files |", "| --- | ---: |");
  for (const [role, count] of Object.entries(map.role_counts)) lines.push(`| ${role} | ${count} |`);

  lines.push("", "## API Feature Candidates", "", "| Candidate | Routes | Entry files |", "| --- | ---: | --- |");
  for (const candidate of map.feature_candidates) {
    lines.push(`| ${candidate.feature_id} | ${candidate.route_count} | ${candidate.files.slice(0, 4).join(", ")} |`);
  }

  lines.push("", "## Next Step", "");
  lines.push("Pick one candidate and create a feature contract:");
  lines.push("");
  lines.push("```bash");
  lines.push("cr go \"Admin changes user role\" --files client/src/components/AdminDashboard.tsx,netlify/functions/admin-users-role.ts,server/src/api/admin.ts");
  lines.push("```");
  lines.push("");
  lines.push("Do not treat this system baseline as a feature contract. It is a project map used before selecting a feature.");
  return `${lines.join("\n")}\n`;
}

function apiInventoryMarkdown(map) {
  const lines = [
    "# API Inventory",
    "",
    "All API entry points detected from the project scan.",
    "",
    "| Route | File | Linked files |",
    "| --- | --- | --- |"
  ];
  for (const entry of map.api_entries) {
    for (const route of entry.routes) {
      lines.push(`| ${escapeMd(route)} | ${escapeMd(entry.file)} | ${escapeMd(entry.linked_files.join(", "))} |`);
    }
  }
  if (map.api_entries.length === 0) lines.push("| none | none | none |");
  return `${lines.join("\n")}\n`;
}

function folderMapMarkdown(map) {
  const lines = [
    "# System Folder Map",
    "",
    "Folders discovered by the whole-project scan.",
    "",
    "| Folder | Files | Roles | Examples |",
    "| --- | ---: | --- | --- |"
  ];
  for (const folder of map.folders) {
    const roles = folder.roles.map((item) => `${item.role}:${item.count}`).join(", ");
    lines.push(`| ${escapeMd(folder.folder)} | ${folder.file_count} | ${escapeMd(roles)} | ${escapeMd(folder.examples.join(", "))} |`);
  }
  return `${lines.join("\n")}\n`;
}

function plantumlSystemOverview(map) {
  const apiCount = map.layers.find((item) => item.layer === "api")?.files || 0;
  const serviceCount = map.layers.find((item) => item.layer === "service")?.files || 0;
  const databaseCount = map.layers.find((item) => item.layer === "database")?.files || 0;
  return [
    "@startuml",
    "left to right direction",
    "skinparam componentStyle rectangle",
    "actor User",
    `component "Client/UI\\n${map.layers.find((item) => item.layer === "client/ui")?.files || 0} files" as UI`,
    `component "API\\n${apiCount} files" as API`,
    `component "Services\\n${serviceCount} files" as Service`,
    `database "Database/Migrations\\n${databaseCount} files" as DB`,
    "User --> UI",
    "UI --> API",
    apiCount > 0 && serviceCount > 0 ? "API --> Service" : null,
    databaseCount > 0 ? "API --> DB" : null,
    serviceCount > 0 && databaseCount > 0 ? "Service --> DB" : null,
    "@enduml"
  ].filter(Boolean).join("\n");
}

function plantumlApiInventory(map) {
  const lines = [
    "@startuml",
    "left to right direction",
    "skinparam componentStyle rectangle",
    "actor Client"
  ];
  for (const entry of map.api_entries.slice(0, 80)) {
    const id = plantId(entry.file);
    lines.push(`component "${entry.file}" as ${id}`);
    for (const route of entry.routes.slice(0, 8)) lines.push(`Client --> ${id} : ${route}`);
    for (const linked of entry.linked_files.slice(0, 4)) {
      const linkedId = plantId(linked);
      lines.push(`component "${linked}" as ${linkedId}`);
      lines.push(`${id} --> ${linkedId}`);
    }
  }
  if (map.api_entries.length > 80) lines.push(`note right: ${map.api_entries.length - 80} API files omitted from diagram`);
  lines.push("@enduml");
  return lines.join("\n");
}

function routeCount(file) {
  return Array.isArray(file.api_routes) ? file.api_routes.length : 0;
}

function isClient(file) {
  const value = normalizePath(file).toLowerCase();
  return value.startsWith("client/") || value.includes("/components/") || value.includes("/pages/");
}

function normalizePath(value) {
  return String(value || "").replace(/\\/g, "/");
}

function slug(value) {
  return String(value || "feature")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "feature";
}

function plantId(value) {
  return `N_${slug(value).slice(0, 48)}`;
}

function escapeMd(value) {
  return String(value || "").replace(/\|/g, "\\|");
}

async function quiet(fn) {
  const original = console.log;
  console.log = () => {};
  try {
    return await fn();
  } finally {
    console.log = original;
  }
}
