import { parseArgs } from "../utils/args.js";
import { readJson, writeJson } from "../utils/fs.js";
import { promptText } from "../utils/prompt.js";

export async function planContext(argv) {
  const args = parseArgs(argv);
  const task = args.task || args._?.join(" ") || await promptText("Task/feature/bug: ");
  if (!task) throw new Error("--task is required");
  const indexFile = args.index || ".chay-index/project_map.json";
  const out = args.out || "memory/context_package.json";
  const maxNotes = Number(args["max-notes"] || 5);

  const index = readJson(indexFile);
  const taskWords = normalize(task).split(" ").filter(Boolean);

  const scored = index.files.map((file) => ({
    ...file,
    score: scoreFile(file, taskWords)
  }))
  .filter((file) => file.score > 0 && !isGeneratedPath(file.path))
  .sort((a, b) => b.score - a.score)
  .slice(0, maxNotes);

  const contextPackage = {
    task,
    generated_at: new Date().toISOString(),
    strategy: "keyword_role_score_v1_compact",
    selected_files: scored.map((file) => ({
      path: file.path,
      role: file.role,
      lines: file.lines,
      score: file.score
    })),
    rules: [
      "Read selected files only.",
      "Return result_note JSON only.",
      "Do not read audit markdown."
    ]
  };

  writeJson(out, contextPackage);
  console.log(JSON.stringify({ ok: true, out, selected_count: scored.length }, null, 2));
}

function normalize(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9_/. -]/g, " ");
}

function scoreFile(file, words) {
  const path = normalize(file.path);
  let score = 0;

  for (const word of words) {
    if (word.length < 3) continue;
    if (path.includes(word)) score += 3;
  }

  if (file.role === "api_controller") score += 2;
  if (file.role === "service") score += 2;
  if (file.role === "repository") score += 1;
  if (file.lines > 800) score -= 2;

  return score;
}

function isGeneratedPath(file) {
  return String(file).split(/[\\/]/).some((part) => ["obj", "bin", "generated", ".chay", ".chay-index", "memory", "audit"].includes(part));
}
