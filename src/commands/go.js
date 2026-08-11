import { parseArgs } from "../utils/args.js";
import { exists, readJson } from "../utils/fs.js";
import { scanRepo } from "./repoScan.js";
import { planContext } from "./contextPlan.js";
import { createGraph } from "./graph.js";
import { createTask } from "./task.js";
import { createHandoff } from "./handoff.js";

export async function go(argv = []) {
  const args = parseArgs(argv);
  const task = args.task || args._?.join(" ");
  const graphFile = args.graph || "memory/feature_graph.json";
  const handoffFile = args.handoff || "memory/ai_handoff.json";
  const contextFile = args.context || "memory/context_package.json";

  if (!task) {
    await quiet(() => createHandoff(["--out", handoffFile, ...(args.worker ? ["--worker", args.worker] : [])]));
    return printGoResult({
      mode: "resume",
      task: currentTask(graphFile, contextFile),
      graphFile,
      handoffFile,
      contextFile,
      selectedFiles: selectedFiles(contextFile),
      created: ["memory/ai_handoff.json"],
      message: exists(graphFile) ? "Resume existing feature from handoff." : "No task provided; handoff was refreshed from current runtime state."
    });
  }

  const explicitFiles = args.files || args.file || args["code-targets"] || "";
  const workerArgs = args.worker ? ["--worker", args.worker] : [];
  const compactArgs = args.compact === false || args["no-compact"] ? [] : ["--compact"];
  const indexFile = args.index || ".chay-index/project_map.json";
  const maxNotes = args["max-notes"] || "5";

  await quiet(() => scanRepo(["--root", args.root || ".", "--out", indexFile]));
  await quiet(() => planContext(["--task", task, "--index", indexFile, "--out", contextFile, "--max-notes", maxNotes]));
  const plannedFiles = selectedFiles(contextFile);
  const files = explicitFiles || plannedFiles.join(",");

  await quiet(() => createGraph([
    task,
    "--out",
    graphFile,
    ...(files ? ["--files", files] : []),
    ...(args["require-existing"] ? ["--require-existing"] : [])
  ]));

  await quiet(() => createTask([
    "--from-graph",
    graphFile,
    "--context",
    contextFile,
    ...workerArgs,
    ...compactArgs
  ]));

  await quiet(() => createHandoff([
    "--out",
    handoffFile,
    ...workerArgs
  ]));

  printGoResult({
    mode: "new_feature",
    task,
    graphFile,
    handoffFile,
    contextFile,
    selectedFiles: files ? files.split(",").map((file) => file.trim()).filter(Boolean) : plannedFiles,
    created: [graphFile, contextFile, handoffFile],
    message: explicitFiles ? "Created feature contract from explicit files." : "Created feature contract from repo scan and context plan."
  });
}

function printGoResult({ mode, task, graphFile, handoffFile, contextFile, selectedFiles, created, message }) {
  console.log(JSON.stringify({
    ok: true,
    command: "go",
    mode,
    message,
    task,
    created,
    graph: graphFile,
    context: contextFile,
    handoff: handoffFile,
    selected_files: selectedFiles,
    read_order: [
      handoffFile,
      graphFile,
      "memory/task_note.json",
      contextFile
    ],
    next_prompt: `Read ${handoffFile} first. Follow the user_flow and sequence_diagram. Edit only selected/allowed files. Update the result_note JSON.`,
    next_commands: ["cr verify", "cr handoff"]
  }, null, 2));
}

function selectedFiles(contextFile) {
  if (!exists(contextFile)) return [];
  const context = readJson(contextFile);
  return Array.isArray(context.selected_files) ? context.selected_files.map((file) => file.path).filter(Boolean) : [];
}

function currentTask(graphFile, contextFile) {
  if (exists(graphFile)) return readJson(graphFile).goal || "";
  if (exists(contextFile)) return readJson(contextFile).task || "";
  return "";
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
