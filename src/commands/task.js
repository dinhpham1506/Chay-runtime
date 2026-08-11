import { parseArgs } from "../utils/args.js";
import { exists, readJson } from "../utils/fs.js";
import { promptText } from "../utils/prompt.js";
import { scanRepo } from "./repoScan.js";
import { planContext } from "./contextPlan.js";
import { makeWorkpack } from "./workpack.js";
import { checkNote } from "./boundary.js";
import { defaultWorker as defaultHostWorker } from "../core/host.js";
import { normalizeAgentName } from "../core/agents.js";
import { featureGraphCodeTargets } from "../core/featureGraph.js";

export async function createTask(argv) {
  const args = parseArgs(argv);
  const graph = graphFromArgs(args);
  const task = args.task || graph?.goal || args._?.join(" ") || await promptText("Task/feature/bug: ");
  if (!task) throw new Error("--task is required");
  const worker = normalizeAgentName(args.worker || args.agent || defaultWorker());

  await quiet(() => scanRepo(["--root", args.root || ".", "--out", args.index || ".chay/project_map.json"]));
  await quiet(() => planContext([
    "--task",
    task,
    "--index",
    args.index || ".chay/project_map.json",
    "--out",
    args.context || "memory/context_package.json",
    ...(args["max-notes"] ? ["--max-notes", args["max-notes"]] : [])
  ]));
  const graphFiles = graph ? featureGraphCodeTargets(graph).join(",") : "";
  const allowedFiles = args.files || args.file || args["allowed-files"] || graphFiles || selectedFiles(args.context || "memory/context_package.json").join(",");
  await quiet(() => makeWorkpack([
    "--worker",
    worker,
    "--goal",
    task,
    "--out",
    args.out || `memory/${worker}_work_note.json`,
    ...(args["from-graph"] || args.graph ? ["--from-graph", args["from-graph"] || args.graph] : []),
    ...(allowedFiles ? ["--allowed-files", allowedFiles] : []),
    ...(args.compact ? ["--compact"] : [])
  ]));
  await quiet(() => checkNote(["--file", args.out || `memory/${worker}_work_note.json`, "--kind", "work"]));

  console.log(JSON.stringify({
    ok: true,
    task,
    worker,
    graph: args["from-graph"] || args.graph || undefined,
    context: args.context || "memory/context_package.json",
    work_note: args.out || `memory/${worker}_work_note.json`,
    next_action: `Run cr run ${worker} or open cr ui serve`
  }, null, 2));
}

function selectedFiles(contextFile) {
  if (!exists(contextFile)) return [];
  const context = readJson(contextFile);
  return Array.isArray(context.selected_files)
    ? context.selected_files.map((file) => file.path).filter(Boolean)
    : [];
}

function graphFromArgs(args) {
  const file = args["from-graph"] || args.graph;
  if (!file) return null;
  if (!exists(file)) throw new Error(`feature graph not found: ${file}`);
  return readJson(file);
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

function defaultWorker() {
  return defaultHostWorker();
}
