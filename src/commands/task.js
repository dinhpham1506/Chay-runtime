import { parseArgs } from "../utils/args.js";
import { exists, readJson } from "../utils/fs.js";
import { promptText } from "../utils/prompt.js";
import { scanRepo } from "./repoScan.js";
import { planContext } from "./contextPlan.js";
import { makeWorkpack } from "./workpack.js";
import { checkNote } from "./boundary.js";
import { defaultWorker as defaultHostWorker } from "../core/host.js";

export async function createTask(argv) {
  const args = parseArgs(argv);
  const task = args.task || args._?.join(" ") || await promptText("Task/feature/bug: ");
  if (!task) throw new Error("--task is required");
  const worker = args.worker || defaultWorker();

  await scanRepo(["--root", args.root || ".", "--out", args.index || ".chay-index/project_map.json"]);
  await planContext([
    "--task",
    task,
    "--index",
    args.index || ".chay-index/project_map.json",
    "--out",
    args.context || "memory/context_package.json",
    ...(args["max-notes"] ? ["--max-notes", args["max-notes"]] : [])
  ]);
  const allowedFiles = args["allowed-files"] || selectedFiles(args.context || "memory/context_package.json").join(",");
  await makeWorkpack([
    "--worker",
    worker,
    "--goal",
    task,
    "--out",
    args.out || `memory/${worker}_work_note.json`,
    ...(allowedFiles ? ["--allowed-files", allowedFiles] : []),
    ...(args.compact ? ["--compact"] : [])
  ]);
  await checkNote(["--file", args.out || `memory/${worker}_work_note.json`, "--kind", "work"]);

  console.log(JSON.stringify({
    ok: true,
    task,
    worker,
    context: args.context || "memory/context_package.json",
    work_note: args.out || `memory/${worker}_work_note.json`,
    next_action: `Run cr dispatch ${worker} or open cr ui serve`
  }, null, 2));
}

function selectedFiles(contextFile) {
  if (!exists(contextFile)) return [];
  const context = readJson(contextFile);
  return Array.isArray(context.selected_files)
    ? context.selected_files.map((file) => file.path).filter(Boolean)
    : [];
}

function defaultWorker() {
  return defaultHostWorker();
}
