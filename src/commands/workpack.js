import { parseArgs } from "../utils/args.js";
import { exists, readJson, writeJson } from "../utils/fs.js";
import { loadPolicy } from "../core/policy.js";
import { promptText } from "../utils/prompt.js";

export async function makeWorkpack(argv) {
  const args = parseArgs(argv);
  const worker = args.worker || await promptText("Worker agent [codex]: ") || "codex";
  const goal = args.goal || args._?.join(" ") || await promptText("Goal/task: ");
  if (!goal) throw new Error("--goal is required");

  const policy = loadPolicy(args.policy);
  const host = loadHostConfig();
  const hostWorker = findHostWorker(host, worker);
  const out = args.out || `memory/${worker}_work_note.json`;
  const skills = listArg(args.skills || args["worker-skills"] || hostWorker?.skills || policy.agentSkills || []);
  const compact = Boolean(args.compact);

  const work = {
    work_id: args.work_id || `work_${Date.now()}`,
    controller: {
      agent: args.controller || host?.main?.agent || "chay-main",
      llm: args["controller-llm"] || args.llm || host?.main?.llm || "user-selected"
    },
    assigned_to: worker,
    worker: {
      agent: worker,
      llm: args["worker-llm"] || hostWorker?.llm || "user-selected",
      skills
    },
    goal,
    context_summary: args.context || "Use memory/task_note.json + memory/context_package.json.",
    inputs: [
      "memory/task_note.json",
      "memory/context_package.json",
      ...(compact ? ["memory/plan_ledger.json"] : [])
    ],
    architecture_rules: compact ? ["Follow policy_ref architectureRules."] : policy.architectureRules || [],
    minimal_patch_rules: compact ? ["Follow policy_ref minimalPatchRules before editing."] : ["Follow runtime policy minimalPatchRules before editing."],
    skills,
    skill_refs: compact ? [
      "skills are procedural hints; use only names listed in skills",
      "do not expand skill instructions unless needed for the touched files"
    ] : undefined,
    output_contract: {
      format: "json_only",
      required: ["work_id", "worker", "status", "summary", "findings"],
      status: ["completed", "failed", "blocked", "partial"],
      retry_until_valid: true
    },
    allowed_files: args["allowed-files"] ? args["allowed-files"].split(",").map((x) => x.trim()) : [],
    allowed_tools: args["allowed-tools"] ? args["allowed-tools"].split(",").map((x) => x.trim()) : [
      "repo_reader",
      "code_search",
      "test_runner"
    ],
    forbidden: compact ? [
      "Follow policy_ref forbiddenPatterns and forbiddenNotePaths.",
      "Do not read audit markdown or rewrite unrelated files."
    ] : [
      "read audit markdown",
      "rewrite unrelated files",
      "split files only to satisfy a line-count target",
      "introduce god objects or mixed responsibilities",
      "run commands over budget",
      "return free-form long explanation"
    ],
    policy_ref: compact ? (args.policy || "policies/chay_policy.json") : undefined,
    experience_compression: compact ? {
      framework: "experience_compression_spectrum_v1",
      memory_refs: [
        "memory/task_note.json",
        "memory/context_package.json",
        "memory/plan_ledger.json",
        `memory/${worker}_result_note.json`
      ],
      skills_ref: "skills",
      rules_ref: "policy_ref",
      rule: "Prefer references over copying raw history, full prompts, logs, or long policy text."
    } : undefined,
    output_schema: "schemas/result_note.schema.json",
    max_output_tokens: Number(args["max-output-tokens"] || policy.maxResultTokens || 900)
  };

  writeJson(out, work);
  console.log(JSON.stringify({ ok: true, out, work_id: work.work_id }, null, 2));
}

function listArg(value) {
  if (Array.isArray(value)) return value;
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function loadHostConfig() {
  return exists("memory/host_config.json") ? readJson("memory/host_config.json") : null;
}

function findHostWorker(host, worker) {
  return host?.workers?.find((item) => item.agent === worker);
}
