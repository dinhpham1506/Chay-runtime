import { parseArgs } from "../utils/args.js";
import { exists, readJson, writeJson } from "../utils/fs.js";
import { loadPolicy } from "../core/policy.js";
import { createFeatureGraph, validateFeatureGraph } from "../core/featureGraph.js";

export async function createGraph(argv) {
  const args = parseArgs(argv);
  const goal = args.goal || args._?.join(" ");
  const out = args.out || "memory/feature_graph.json";
  const policy = loadPolicy(args.policy);

  if (args.check) {
    const file = args.file || (typeof args.check === "string" ? args.check : out);
    return printGraphCheck(file, policy, args);
  }

  if (!goal) throw new Error("--goal is required");
  const graph = createFeatureGraph({
    goal,
    files: listArg(args.files || args.file || args["code-targets"]),
    out,
    featureId: args.id || args["feature-id"]
  });
  const result = validateFeatureGraph(graph, policy, { requireExistingFiles: Boolean(args["require-existing"]) });
  writeJson(out, graph);

  console.log(JSON.stringify({
    ok: result.ok,
    out,
    graph: out,
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
