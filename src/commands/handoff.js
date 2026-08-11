import { parseArgs } from "../utils/args.js";
import { exists, readJson, readText, writeJson } from "../utils/fs.js";
import { loadPolicy } from "../core/policy.js";
import { analyzeDiff, validateDiff } from "../core/diff.js";
import { buildEvalReport } from "../core/evalReport.js";
import { defaultWorker, resultNotePath, workNotePath } from "../core/host.js";
import { owaspChecklist } from "../core/owaspApi.js";

export async function createHandoff(argv = []) {
  const args = parseArgs(argv);
  const worker = args.worker || defaultWorker();
  const out = args.out || "memory/ai_handoff.json";
  const policy = loadPolicy(args.policy);
  const workFile = args.work || workNotePath(worker);
  const resultFile = args.result || resultNotePath(worker);
  const graphFile = args.graph || "memory/feature_graph.json";
  const contextFile = args.context || "memory/context_package.json";
  const diffFile = args.diff || ".chay/tmp/current.diff";

  const work = optionalJson(workFile);
  const result = optionalJson(resultFile);
  const graph = optionalJson(graphFile);
  const context = optionalJson(contextFile);
  const patch = patchSummary(diffFile, work, policy);
  const evalReport = buildEvalReport(policy, { worker, workFile, resultFile });

  const handoff = {
    generated_at: new Date().toISOString(),
    purpose: "Fast resume context for a new IDE AI session. Read this first before scanning source.",
    read_order: [
      out,
      graph ? graphFile : null,
      "memory/task_note.json",
      context ? contextFile : null,
      work ? workFile : null,
      result ? resultFile : null
    ].filter(Boolean),
    worker,
    status: {
      task_status: result?.status || "not_finished",
      next_action: evalReport.next_action,
      unfinished: result?.status !== "completed",
      current_violations: evalReport.violations.map((item) => item.type)
    },
    source_of_truth: {
      feature_graph: graph ? graphFile : null,
      feature_id: graph?.feature_id || work?.feature_graph?.feature_id || null,
      goal: graph?.goal || work?.goal || context?.task || "",
      user_flow: graph?.user_flow || graph?.mermaid || "",
      sequence_diagram: graph?.sequence_diagram || "",
      plantuml_flow: graph?.plantuml_flow || "",
      plantuml_sequence: graph?.plantuml_sequence || "",
      rule: "Implement the human-confirmed graph/spec. Do not invent product behavior from source code."
    },
    relevant_files: {
      allowed_files: work?.allowed_files || [],
      graph_code_targets: graph?.code_targets || work?.feature_graph?.code_targets || [],
      context_selected_files: (context?.selected_files || []).map((file) => file.path).filter(Boolean),
      changed_files: patch.analysis.changedFiles
    },
    guardrails: [
      "Do not delete existing behavior unless the graph/spec explicitly requires it.",
      "Do not edit human-owned docs unless human_approved_files/human_approved_paths allows it.",
      "Do not read or change secrets, credentials, private keys, .env files, audit markdown, raw logs, or full prompts.",
      "Follow existing design patterns and local helpers before adding abstractions or dependencies.",
      "Preserve validation, error handling, security checks, accessibility, and tests.",
      "Return/update result_note JSON only; keep it compact."
    ],
    owasp_api_review: owaspChecklist(),
    patch,
    last_result: result ? {
      status: result.status,
      summary: result.summary || "",
      findings: result.findings || [],
      risks: result.risks || [],
      next_recommendation: result.next_recommendation || ""
    } : null,
    output_contract: {
      result_note: resultFile,
      required_fields: ["work_id", "worker", "status", "summary", "findings"],
      status_values: ["completed", "failed", "blocked", "partial"]
    }
  };

  writeJson(out, handoff);
  console.log(JSON.stringify({
    ok: true,
    out,
    worker,
    status: handoff.status,
    read_order: handoff.read_order,
    relevant_files: handoff.relevant_files
  }, null, 2));
}

function patchSummary(diffFile, work, policy) {
  if (!exists(diffFile)) {
    return {
      ok: false,
      diff: diffFile,
      analysis: { changedFiles: [], changedFileCount: 0, addedLines: 0, deletedLines: 0, totalDiffLines: 0 },
      violations: [{ type: "diff_missing" }]
    };
  }
  const diffText = readText(diffFile);
  const analysis = analyzeDiff(diffText);
  const result = work ? validateDiff(analysis, work, policy, diffText) : { ok: false, violations: [{ type: "work_note_missing" }] };
  return {
    ok: result.ok,
    diff: diffFile,
    analysis,
    violations: result.violations
  };
}

function optionalJson(file) {
  try {
    return exists(file) ? readJson(file) : null;
  } catch {
    return null;
  }
}
