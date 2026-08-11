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
  const graphFile = args.graph || "chay-memory/feature_graph.json";
  const folderStructureFile = args["folder-structure-out"] || "chay-memory/folder_structure.md";
  const featureFlowFile = args["feature-flow-out"] || "chay-memory/feature_flow.md";
  const plantumlFlowFile = args["plantuml-flow-out"] || "chay-memory/user_flow.puml";
  const plantumlSequenceFile = args["plantuml-sequence-out"] || "chay-memory/sequence.puml";
  const handoffFile = args.handoff || "chay-memory/ai_handoff.json";
  const contextFile = args.context || "chay-memory/context_package.json";

  if (!task) {
    await quiet(() => createHandoff([
      "--out",
      handoffFile,
      "--folder-structure",
      folderStructureFile,
      "--feature-flow",
      featureFlowFile,
      "--plantuml-flow",
      plantumlFlowFile,
      "--plantuml-sequence",
      plantumlSequenceFile,
      ...(args.worker ? ["--worker", args.worker] : [])
    ]));
    return printGoResult({
      mode: "resume",
      task: currentTask(graphFile, contextFile),
      graphFile,
      featureFlowFile,
      plantumlFlowFile,
      plantumlSequenceFile,
      handoffFile,
      contextFile,
      selectedFiles: selectedFiles(contextFile),
      created: ["chay-memory/ai_handoff.json"],
      message: exists(graphFile) ? "Resume existing feature from handoff." : "No task provided; handoff was refreshed from current runtime state."
    });
  }

  const explicitFiles = args.files || args.file || args["code-targets"] || "";
  const workerArgs = args.worker ? ["--worker", args.worker] : [];
  const compactArgs = args.compact === false || args["no-compact"] ? [] : ["--compact"];
  const indexFile = args.index || ".chay/project_map.json";
  const maxFiles = args["max-files"] || args["max-notes"] || "3";

  await quiet(() => scanRepo(["--root", args.root || ".", "--out", indexFile]));
  await quiet(() => planContext([
    "--task",
    task,
    "--index",
    indexFile,
    "--out",
    contextFile,
    "--max-files",
    maxFiles,
    ...(args["include-database"] ? ["--include-database"] : [])
  ]));
  const plannedFiles = selectedFiles(contextFile);
  if (!explicitFiles && plannedFiles.length === 0) {
    console.log(JSON.stringify({
      ok: false,
      command: "go",
      mode: "needs_file_scope",
      task,
      context: contextFile,
      selected_files: [],
      error: "no_safe_code_targets_selected",
      message: "No non-database code targets matched the task. Database/migration files are skipped by default to avoid unsafe scope.",
      next_action: `Run cr go ${JSON.stringify(task)} --files path/to/file.js, or pass --include-database for migration/database tasks.`,
      examples: [
        `cr go ${JSON.stringify(task)} --files src/applyService.js`,
        `cr go ${JSON.stringify(task)} --include-database`
      ]
    }, null, 2));
    process.exitCode = 2;
    return;
  }
  const files = explicitFiles || plannedFiles.join(",");

  await quiet(() => createGraph([
    task,
    "--out",
    graphFile,
    "--folder-structure-out",
    folderStructureFile,
    "--feature-flow-out",
    featureFlowFile,
    "--plantuml-flow-out",
    plantumlFlowFile,
    "--plantuml-sequence-out",
    plantumlSequenceFile,
    "--context",
    contextFile,
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
    "--folder-structure",
    folderStructureFile,
    "--feature-flow",
    featureFlowFile,
    "--plantuml-flow",
    plantumlFlowFile,
    "--plantuml-sequence",
    plantumlSequenceFile,
    ...workerArgs
  ]));

  printGoResult({
    mode: "new_feature",
    task,
    graphFile,
    handoffFile,
    contextFile,
    selectedFiles: files ? files.split(",").map((file) => file.trim()).filter(Boolean) : plannedFiles,
    folderStructureFile,
    featureFlowFile,
    plantumlFlowFile,
    plantumlSequenceFile,
    created: [graphFile, featureFlowFile, folderStructureFile, plantumlFlowFile, plantumlSequenceFile, contextFile, handoffFile],
    message: explicitFiles ? "Created feature contract from explicit files." : "Created feature contract from repo scan and context plan."
  });
}

function printGoResult({
  mode,
  task,
  graphFile,
  folderStructureFile = "chay-memory/folder_structure.md",
  featureFlowFile = "chay-memory/feature_flow.md",
  plantumlFlowFile = "chay-memory/user_flow.puml",
  plantumlSequenceFile = "chay-memory/sequence.puml",
  handoffFile,
  contextFile,
  selectedFiles,
  created,
  message
}) {
  console.log(JSON.stringify({
    ok: true,
    command: "go",
    mode,
    message,
    task,
    created,
    graph: graphFile,
    feature_flow: featureFlowFile,
    folder_structure: folderStructureFile,
    plantuml_flow: plantumlFlowFile,
    plantuml_sequence: plantumlSequenceFile,
    context: contextFile,
    handoff: handoffFile,
    selected_files: selectedFiles,
    read_order: [
      handoffFile,
      featureFlowFile,
      folderStructureFile,
      plantumlFlowFile,
      plantumlSequenceFile,
      graphFile,
      "chay-memory/task_note.json",
      contextFile
    ],
    next_prompt: `Read ${handoffFile} first, then ${featureFlowFile} and ${folderStructureFile}. If selected files do not match the business goal, stop and ask for explicit --files. Edit only selected/allowed files. Update the result_note JSON.`,
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
