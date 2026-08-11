import { parseArgs } from "../utils/args.js";
import { readJson, writeJson } from "../utils/fs.js";
import { promptText } from "../utils/prompt.js";

export async function planContext(argv) {
  const args = parseArgs(argv);
  const positional = splitTaskAndFiles(args._ || []);
  const task = args.task || positional.task || await promptText("Task/feature/bug: ");
  if (!task) throw new Error("--task is required");
  const indexFile = args.index || ".chay/project_map.json";
  const out = args.out || "chay-memory/context_package.json";
  const maxNotes = Number(args["max-notes"] || args["max-files"] || 3);

  const index = readJson(indexFile);
  const taskWords = normalize(task).split(" ").filter(Boolean);
  const taskSignals = taskSignalWords(taskWords);
  const includeDatabase = Boolean(args["include-database"] || hasDatabaseIntent(taskWords));

  const scored = index.files.map((file) => {
    const score = scoreFile(file, taskWords, { includeDatabase, taskSignals });
    return {
      ...file,
      score: score.score,
      matched_terms: score.matchedTerms,
      reason: score.reason
    };
  })
  .filter((file) => file.score > 0 && !isGeneratedPath(file.path) && (includeDatabase || !isDatabasePath(file)))
  .sort((a, b) => b.score - a.score)
  .slice(0, maxNotes);
  const selected = mergeSelected(scored, [
    ...positional.files.map((file) => ({
      path: file,
      role: "source",
      lines: 0,
      score: 100,
      matched_terms: [],
      reason: "Explicit positional file target."
    })),
    ...inferredFeatureTargets(index, taskWords, { includeDatabase })
  ], maxNotes);

  const contextPackage = {
    task,
    generated_at: new Date().toISOString(),
    strategy: "keyword_role_score_v3_compact_avoid_database_scripts_generated_by_default",
    selection_policy: {
      max_files: maxNotes,
      include_database: includeDatabase,
      database_hint: "Database and migration files are skipped unless the task mentions migration/sql/database/schema/policy/rls or --include-database is passed."
    },
    selected_files: selected.map((file) => ({
      path: file.path,
      role: file.role,
      lines: file.lines,
      score: file.score,
      matched_terms: file.matched_terms,
      reason: file.reason
    })),
    rules: [
      "Read selected files only.",
      "Return result_note JSON only.",
      "Read chay-structure/features/<feature_id>.md, chay-structure/folder_structure.md, and chay-structure/api_graph.md before editing."
    ]
  };

  writeJson(out, contextPackage);
  console.log(JSON.stringify({ ok: true, out, selected_count: selected.length }, null, 2));
}

function normalize(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9_/. -]/g, " ");
}

function scoreFile(file, words, options = {}) {
  const path = normalize(file.path);
  let score = 0;
  const matchedTerms = [];
  const reasons = [];

  for (const word of words) {
    const term = normalizeTaskWord(word);
    if (term.length < 3) continue;
    if (path.includes(term)) {
      score += options.taskSignals?.has(term) ? 5 : 2;
      matchedTerms.push(term);
    }
  }

  const matchedSignal = matchedTerms.some((term) => options.taskSignals?.has(term));
  if ((options.taskSignals?.size || 0) > 0 && !matchedSignal) {
    return {
      score: 0,
      matchedTerms,
      reason: "Skipped: path did not match a specific task keyword."
    };
  }

  if (matchedTerms.length > 0) reasons.push(`Matched task terms: ${matchedTerms.join(", ")}`);
  if (file.role === "api_controller") { score += 3; reasons.push("API/controller role."); }
  if (file.role === "service") { score += 3; reasons.push("Service/business logic role."); }
  if (file.role === "route") { score += 2; reasons.push("Route role."); }
  if (file.role === "model") { score += 1; reasons.push("Model role."); }
  if (file.role === "repository") { score += 1; reasons.push("Repository/data access role."); }
  if (isDatabasePath(file) && !options.includeDatabase) { score -= 12; reasons.push("Database path skipped unless database intent is explicit."); }
  if (isScriptPath(file.path) && !hasScriptIntent(words)) { score -= 8; reasons.push("Script/import utility penalty; task did not ask for scripts."); }
  if (file.lines > 800) { score -= 2; reasons.push("Large file penalty; prefer narrower targets."); }

  return {
    score,
    matchedTerms,
    reason: reasons.join(" ") || "Selected by repository role and task score."
  };
}

function isGeneratedPath(file) {
  return String(file).split(/[\\/]/).some((part) => ["obj", "bin", "generated", ".chay", ".chay-index", "memory", "chay-memory", "chay-structure", "audit"].includes(part));
}

function isDatabasePath(file) {
  const value = typeof file === "string" ? file : file.path;
  const normalized = normalize(value);
  return file.role === "database" ||
    normalized.endsWith(".sql") ||
    normalized.includes("/migrations/") ||
    normalized.startsWith("migrations/") ||
    normalized.includes("/supabase/");
}

function hasDatabaseIntent(words) {
  return words.some((word) => ["migration", "migrations", "sql", "database", "schema", "table", "policy", "policies", "rls", "supabase", "postgres", "postgresql"].includes(word));
}

function hasScriptIntent(words) {
  return words.some((word) => ["script", "scripts", "import", "etl", "migration", "seed", "backup", "restore"].includes(word));
}

function isScriptPath(file) {
  const normalized = normalize(file);
  return normalized.includes("/scripts/") || normalized.includes("\\scripts\\") || normalized.includes("scripts/");
}

function splitTaskAndFiles(items) {
  const taskParts = [];
  const files = [];
  for (const item of items) {
    if (looksLikeFilePath(item)) files.push(item);
    else taskParts.push(item);
  }
  return { task: taskParts.join(" ").trim(), files };
}

function looksLikeFilePath(value) {
  const item = String(value || "");
  return /[\\/]/.test(item) || /\.[a-z0-9]{1,8}$/i.test(item);
}

function mergeSelected(scored, inferred, maxNotes) {
  const byPath = new Map();
  for (const file of [...inferred, ...scored]) {
    if (!file.path || byPath.has(file.path)) continue;
    byPath.set(file.path, file);
  }
  const forced = [...inferred].filter((file) => file.path);
  const rest = [...scored].filter((file) => file.path && !forced.some((forcedFile) => forcedFile.path === file.path));
  return [...new Map([...forced, ...rest].map((file) => [file.path, file])).values()].slice(0, Math.max(maxNotes, forced.length));
}

function inferredFeatureTargets(index, taskWords, options = {}) {
  if (!isApplyJobIntent(taskWords)) return [];
  const files = Array.isArray(index.files) ? index.files : [];
  const paths = new Set(files.map((file) => file.path));
  const targets = [];

  addExisting(targets, files, "client/src/lib/api.ts", "API client likely needs an apply-job method.");

  const existingBackend = files.find((file) => /(?:^|\/)(job-application|job-applications|applications|apply-job|jobs)\.[cm]?[jt]sx?$/i.test(file.path) && !isScriptPath(file.path));
  if (existingBackend) {
    addExisting(targets, files, existingBackend.path, "Existing job/application backend or service matched apply-job intent.");
  } else if (hasFolder(paths, "netlify/functions")) {
    targets.push({
      path: "netlify/functions/job-applications.ts",
      role: "api_controller",
      lines: 0,
      score: 95,
      matched_terms: ["job", "apply", "application"],
      reason: "Proposed new Netlify function because repo uses flat netlify/functions and no apply-job function exists."
    });
  }

  if (options.includeDatabase) {
    const migration = applyJobDatabaseTarget(files, paths);
    if (migration.existing) {
      addExisting(targets, files, migration.path, "Database file included because it matches job/application schema intent.");
    } else if (migration.path) {
      targets.push({
        path: migration.path,
        role: "database",
        lines: 0,
        score: 90,
        matched_terms: ["job", "application", "schema"],
        reason: "Proposed new migration for job applications because no existing job/application schema migration was found."
      });
    }
  }

  return targets;
}

function applyJobDatabaseTarget(files, paths) {
  const databaseFiles = files.filter((file) => isDatabasePath(file));
  const normalized = (file) => normalize(file.path || file);
  const exact = databaseFiles.find((file) => {
    const value = normalized(file);
    return value.includes("job") && value.includes("application");
  });
  if (exact) return { existing: true, path: exact.path };

  const jobOnly = databaseFiles.find((file) => {
    const value = normalized(file);
    return value.includes("job") && !value.includes("user-status") && !value.includes("teams");
  });
  if (jobOnly) return { existing: true, path: jobOnly.path };

  if (hasFolder(paths, "migrations")) return { existing: false, path: "migrations/create-job-applications.sql" };
  if (paths.has("supabase-schema.sql")) return { existing: true, path: "supabase-schema.sql" };
  return { existing: false, path: "" };
}

function addExisting(targets, files, pathValue, reason) {
  const file = files.find((item) => item.path === pathValue);
  if (!file) return;
  targets.push({
    ...file,
    score: 100,
    matched_terms: ["job", "apply"],
    reason
  });
}

function hasFolder(paths, folder) {
  const prefix = `${folder.replace(/\\/g, "/")}/`;
  return [...paths].some((item) => String(item).replace(/\\/g, "/").startsWith(prefix));
}

function isApplyJobIntent(words) {
  const normalized = new Set(words.map((word) => normalizeTaskWord(word)));
  return normalized.has("job") && (normalized.has("apply") || normalized.has("application"));
}

function taskSignalWords(words) {
  return new Set(words
    .map((word) => normalizeTaskWord(word))
    .filter((word) => word.length >= 3 && !genericTaskWords.has(word)));
}

function normalizeTaskWord(word) {
  const value = String(word || "").toLowerCase();
  if (value === "applies" || value === "applied" || value === "applying") return "apply";
  if (value === "applications") return "application";
  if (value === "jobs") return "job";
  if (value === "users") return "user";
  return value;
}

const genericTaskWords = new Set([
  "add",
  "bug",
  "build",
  "change",
  "create",
  "edit",
  "feature",
  "fix",
  "flow",
  "implement",
  "make",
  "new",
  "page",
  "screen",
  "task",
  "update",
  "user"
]);
