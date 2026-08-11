import { parseArgs } from "../utils/args.js";
import { exists, readJson, writeJson, writeText } from "../utils/fs.js";
import { loadPolicy } from "../core/policy.js";
import { apiGraphMarkdown, createFeatureGraph, featureFlowMarkdown, featureIdFromGoal, folderStructureMarkdown, validateFeatureGraph } from "../core/featureGraph.js";

export async function createGraph(argv) {
  const args = parseArgs(argv);
  const positional = splitTaskAndFiles(args._ || []);
  const goal = args.goal || positional.task;
  const featureId = featureIdFromGoal(args.id || args["feature-id"] || goal || "feature");
  const out = args.out || "chay-memory/feature_graph.json";
  const folderStructureOut = args["folder-structure-out"] || "chay-structure/folder_structure.md";
  const featureFlowOut = args["feature-flow-out"] || args["feature-md-out"] || `chay-structure/features/${featureId}.md`;
  const apiGraphOut = args["api-graph-out"] || "chay-structure/api_graph.md";
  const plantumlFlowOut = args["plantuml-flow-out"] || `chay-structure/diagrams/${featureId}-user-flow.puml`;
  const plantumlSequenceOut = args["plantuml-sequence-out"] || `chay-structure/diagrams/${featureId}-sequence.puml`;
  const plantumlApiGraphOut = args["plantuml-api-graph-out"] || `chay-structure/diagrams/${featureId}-api-graph.puml`;
  const policy = loadPolicy(args.policy);

  if (args.check) {
    const file = args.file || (typeof args.check === "string" ? args.check : out);
    return printGraphCheck(file, policy, args);
  }

  if (!goal) throw new Error("--goal is required");
  const files = listArg(args.files || args.file || args["code-targets"] || positional.files.join(","));
  const graph = createFeatureGraph({
    goal,
    files,
    out,
    featureId,
    fileMetadata: selectedFileMetadata(args.context || args["selection-context"], files),
    projectIndex: optionalJson(args.index || args["project-map"] || ".chay/project_map.json")
  });
  const result = validateFeatureGraph(graph, policy, { requireExistingFiles: Boolean(args["require-existing"]) });
  writeJson(out, graph);
  writeText(folderStructureOut, folderStructureMarkdown(graph));
  writeText(featureFlowOut, featureFlowMarkdown(graph, {
    graph: out,
    folderStructure: folderStructureOut,
    featureFlow: featureFlowOut,
    apiGraph: apiGraphOut,
    plantumlFlow: plantumlFlowOut,
    plantumlSequence: plantumlSequenceOut,
    plantumlApiGraph: plantumlApiGraphOut
  }));
  writeText(apiGraphOut, apiGraphMarkdown(graph, { plantumlApiGraph: plantumlApiGraphOut }));
  writeText(plantumlFlowOut, `${graph.plantuml_flow}\n`);
  writeText(plantumlSequenceOut, `${graph.plantuml_sequence}\n`);
  writeText(plantumlApiGraphOut, `${graph.plantuml_api_graph}\n`);

  console.log(JSON.stringify({
    ok: result.ok,
    out,
    graph: out,
    folder_structure: folderStructureOut,
    feature_md: featureFlowOut,
    feature_flow: featureFlowOut,
    api_graph: apiGraphOut,
    plantuml_flow: plantumlFlowOut,
    plantuml_sequence: plantumlSequenceOut,
    plantuml_api_graph: plantumlApiGraphOut,
    feature_id: graph.feature_id,
    code_targets: graph.code_targets,
    validation: result,
    next_action: result.ok ? `review ${out}, then run cr task --from-graph ${out}` : `fix ${out}, then run cr boundary check-graph --file ${out}`
  }, null, 2));

  if (!result.ok) process.exitCode = 2;
}

export function printGraphCheck(file, policy, args = {}) {
  if (!exists(file)) throw new Error(`feature graph not found: ${file}`);
  const result = validateFeatureGraph(readJson(file), policy, {
    requireExistingFiles: Boolean(args["require-existing"]),
    root: args.root || process.cwd()
  });
  console.log(JSON.stringify({
    ok: result.ok,
    kind: "feature_graph",
    file,
    ...result,
    next_action: result.ok ? "use_graph_as_feature_contract" : "fix_graph_contract"
  }, null, 2));
  if (!result.ok) process.exitCode = 2;
}

function listArg(value) {
  if (Array.isArray(value)) return value;
  return String(value || "").split(",").map((item) => item.trim()).filter(Boolean);
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

function selectedFileMetadata(contextFile, files) {
  if (!contextFile || !exists(contextFile)) return files.map((file) => ({ path: file }));
  try {
    const context = readJson(contextFile);
    const selected = Array.isArray(context.selected_files) ? context.selected_files : [];
    const byPath = new Map(selected.map((file) => [file.path, file]));
    return files.map((file) => byPath.get(file) || { path: file });
  } catch {
    return files.map((file) => ({ path: file }));
  }
}

function optionalJson(file) {
  try {
    return file && exists(file) ? readJson(file) : null;
  } catch {
    return null;
  }
}
