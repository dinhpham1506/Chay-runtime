import { parseArgs } from "../utils/args.js";
import { exists, readJson, writeJson, writeText } from "../utils/fs.js";
import { loadPolicy } from "../core/policy.js";
import { createFeatureGraph, featureFlowMarkdown, folderStructureMarkdown, validateFeatureGraph } from "../core/featureGraph.js";

export async function createGraph(argv) {
  const args = parseArgs(argv);
  const goal = args.goal || args._?.join(" ");
  const out = args.out || "chay-memory/feature_graph.json";
  const folderStructureOut = args["folder-structure-out"] || "chay-memory/folder_structure.md";
  const featureFlowOut = args["feature-flow-out"] || "chay-memory/feature_flow.md";
  const plantumlFlowOut = args["plantuml-flow-out"] || "chay-memory/user_flow.puml";
  const plantumlSequenceOut = args["plantuml-sequence-out"] || "chay-memory/sequence.puml";
  const policy = loadPolicy(args.policy);

  if (args.check) {
    const file = args.file || (typeof args.check === "string" ? args.check : out);
    return printGraphCheck(file, policy, args);
  }

  if (!goal) throw new Error("--goal is required");
  const files = listArg(args.files || args.file || args["code-targets"]);
  const graph = createFeatureGraph({
    goal,
    files,
    out,
    featureId: args.id || args["feature-id"],
    fileMetadata: selectedFileMetadata(args.context || args["selection-context"], files)
  });
  const result = validateFeatureGraph(graph, policy, { requireExistingFiles: Boolean(args["require-existing"]) });
  writeJson(out, graph);
  writeText(folderStructureOut, folderStructureMarkdown(graph));
  writeText(featureFlowOut, featureFlowMarkdown(graph, {
    graph: out,
    folderStructure: folderStructureOut,
    featureFlow: featureFlowOut,
    plantumlFlow: plantumlFlowOut,
    plantumlSequence: plantumlSequenceOut
  }));
  writeText(plantumlFlowOut, `${graph.plantuml_flow}\n`);
  writeText(plantumlSequenceOut, `${graph.plantuml_sequence}\n`);

  console.log(JSON.stringify({
    ok: result.ok,
    out,
    graph: out,
    folder_structure: folderStructureOut,
    feature_flow: featureFlowOut,
    plantuml_flow: plantumlFlowOut,
    plantuml_sequence: plantumlSequenceOut,
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
