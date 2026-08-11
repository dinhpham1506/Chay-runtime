import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { commandForAgent } from "../src/core/engineAdapters.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cli = path.join(repoRoot, "bin", "cr.js");
const project = fs.mkdtempSync(path.join(os.tmpdir(), "chay-runtime-smoke-"));

assert.deepEqual(commandForAgent("codex", { prompt: "hi", model: "gpt-5" }).args, ["exec", "--model", "gpt-5", "hi"]);
assert.deepEqual(commandForAgent("claude", { prompt: "hi", worker: "codex", model: "sonnet" }).args, ["-p", "hi", "--agent", "chay-codex-worker", "--model", "sonnet"]);
assert.equal(commandForAgent("anti", { promptFile: "prompt.txt", model: "gemini-pro" }), null);

assert.ok(fs.existsSync(path.join(repoRoot, "site", "console.html")));
assert.ok(!fs.readFileSync(path.join(repoRoot, "src", "commands", "ui.js"), "utf8").includes("function html()"));

fs.mkdirSync(path.join(project, "src"), { recursive: true });
fs.writeFileSync(path.join(project, "src", "applyService.js"), [
  "export function canApply(userId, jobId) {",
  "  return Boolean(userId && jobId);",
  "}",
  ""
].join("\n"));

const genericProject = fs.mkdtempSync(path.join(os.tmpdir(), "chay-runtime-generic-"));
fs.mkdirSync(path.join(genericProject, "src"), { recursive: true });
fs.writeFileSync(path.join(genericProject, "src", "genericService.js"), "export const generic = true;\n");
runIn(genericProject, "setup", "--agents", "claude,antigravity", "--main", "antigravity", "--workers", "claude");
runIn(genericProject, "workpack", "make", "--goal", "Generic worker task", "--allowed-files", "src/genericService.js");
const genericHost = JSON.parse(fs.readFileSync(path.join(genericProject, "memory", "host_config.json"), "utf8"));
const genericWork = JSON.parse(fs.readFileSync(path.join(genericProject, "memory", "claude_work_note.json"), "utf8"));
assert.deepEqual(genericHost.main, { agent: "antigravity", llm: "user-selected" });
assert.equal(genericHost.workers[0].agent, "claude");
assert.equal(genericWork.assigned_to, "claude");
assert.ok(fs.existsSync(path.join(genericProject, ".claude", "agents", "chay-claude-worker.md")));
assert.ok(fs.readFileSync(path.join(genericProject, ".claude", "agents", "chay-main.md"), "utf8").includes("chay-claude-worker"));

const aliasProject = fs.mkdtempSync(path.join(os.tmpdir(), "chay-runtime-alias-"));
runIn(aliasProject, "setup", "--agents", "codex,anti", "--main", "anti");
const aliasHost = JSON.parse(fs.readFileSync(path.join(aliasProject, "memory", "host_config.json"), "utf8"));
assert.deepEqual(aliasHost.enabled_agents, ["codex", "antigravity"]);
assert.deepEqual(aliasHost.main, { agent: "antigravity", llm: "user-selected" });
assert.equal(aliasHost.workers[0].agent, "codex");
const startProject = fs.mkdtempSync(path.join(os.tmpdir(), "chay-runtime-start-"));
const started = runIn(startProject, "start", "--agent", "codex,anti", "--main", "codex", "--skip-login");
assert.equal(started.message, "Chạy Runtime started");
assert.equal(started.mode, "external_ide_ai");
assert.deepEqual(started.targets, ["codex", "antigravity"]);
assert.ok(Array.isArray(started.available_cli_agents));
assert.ok(fs.existsSync(path.join(startProject, "memory", "ide_config.json")));
assert.ok(!fs.existsSync(path.join(startProject, "memory", "host_config.json")));
runIn(startProject, "integration", "install", "--target", "anti");
assert.ok(fs.existsSync(path.join(startProject, "CHAY_ANTIGRAVITY_INSTRUCTIONS.md")));
const graphProject = fs.mkdtempSync(path.join(os.tmpdir(), "chay-runtime-graph-"));
fs.mkdirSync(path.join(graphProject, "src"), { recursive: true });
fs.writeFileSync(path.join(graphProject, "src", "applyService.js"), "export const apply = true;\n");
runIn(graphProject, "setup", "--agents", "codex,anti", "--main", "codex");
const graphCreated = runIn(graphProject, "graph", "Fix duplicate apply service", "--files", "src/applyService.js", "--require-existing");
assert.equal(graphCreated.ok, true);
runIn(graphProject, "boundary", "check-graph", "--file", "memory/feature_graph.json", "--require-existing");
const featureGraph = JSON.parse(fs.readFileSync(path.join(graphProject, "memory", "feature_graph.json"), "utf8"));
assert.ok(featureGraph.plantuml_flow.includes("@startuml"));
assert.ok(featureGraph.plantuml_sequence.includes("@startuml"));
assert.deepEqual(featureGraph.folder_structure[0].code_targets, ["src/applyService.js"]);
assert.ok(fs.readFileSync(path.join(graphProject, "memory", "folder_structure.md"), "utf8").includes("src/applyService.js"));
runIn(graphProject, "task", "--from-graph", "memory/feature_graph.json", "--compact");
const graphWork = JSON.parse(fs.readFileSync(path.join(graphProject, "memory", "antigravity_work_note.json"), "utf8"));
assert.equal(graphWork.feature_graph.source_of_truth, true);
assert.deepEqual(graphWork.feature_graph.code_targets, ["src/applyService.js"]);
assert.deepEqual(graphWork.allowed_files, ["src/applyService.js"]);
const handoff = runIn(graphProject, "handoff", "--worker", "antigravity");
assert.equal(handoff.ok, true);
assert.ok(handoff.read_order.includes("memory/ai_handoff.json"));
assert.deepEqual(handoff.relevant_files.graph_code_targets, ["src/applyService.js"]);
const handoffFile = JSON.parse(fs.readFileSync(path.join(graphProject, "memory", "ai_handoff.json"), "utf8"));
assert.ok(handoffFile.read_order.includes("memory/folder_structure.md"));
assert.ok(handoffFile.guardrails.some((item) => item.includes("Do not delete existing behavior")));
assert.equal(handoffFile.owasp_api_review.length, 10);
assert.ok(handoffFile.source_of_truth.plantuml_sequence.includes("@startuml"));
assert.ok(handoffFile.source_of_truth.implementation_order[0].includes("folder_structure"));
const goProject = fs.mkdtempSync(path.join(os.tmpdir(), "chay-runtime-go-"));
fs.mkdirSync(path.join(goProject, "src"), { recursive: true });
fs.writeFileSync(path.join(goProject, "src", "applyService.js"), "export const apply = true;\n");
runIn(goProject, "setup", "--agents", "codex,anti", "--main", "codex");
const ideConfig = runIn(goProject, "config", "codex,claude,anti,github-copilot,cursor,kiro");
assert.equal(ideConfig.mode, "external_ide_ai");
assert.ok(fs.existsSync(path.join(goProject, ".chay", "ide", "CHAY_IDE_INSTRUCTIONS.md")));
assert.deepEqual(ideConfig.targets, ["codex", "claude", "antigravity", "github-copilot", "cursor", "kiro"]);
const ideCheck = runIn(goProject, "config", "check");
assert.equal(ideCheck.configured.configured, true);
const goResult = runIn(goProject, "go", "Fix duplicate apply service", "--files", "src/applyService.js");
assert.equal(goResult.ok, true);
assert.ok(fs.existsSync(path.join(goProject, "memory", "feature_graph.json")));
assert.ok(fs.existsSync(path.join(goProject, "memory", "folder_structure.md")));
assert.ok(fs.existsSync(path.join(goProject, "memory", "ai_handoff.json")));
assert.equal(goResult.folder_structure, "memory/folder_structure.md");
assert.equal(JSON.parse(fs.readFileSync(path.join(goProject, "memory", "antigravity_work_note.json"), "utf8")).allowed_files[0], "src/applyService.js");
const duplicateAgents = runIn(aliasProject, "setup", "--agents", "codex,codex", "--main", "anti", { expectCode: 1 });
assert.equal(duplicateAgents.ok, false);
assert.ok(duplicateAgents.error.includes("2 distinct agents"));
assert.ok(!duplicateAgents.error.includes("claude,codex"));

run("doctor");
run("check");
run("setup", "--agents", "claude,codex", "--main", "claude", "--main-llm", "sonnet", "--workers", "codex", "--worker-llms", "codex:gpt-5", "--skills", "repo_search,solid_refactor,test_runner,minimal_patch");
run("scan", "--root", ".", "--out", ".chay-index/alias_project_map.json");
run("plan", "Fix duplicate apply service", "--index", ".chay-index/alias_project_map.json", "--out", "memory/alias_context_package.json");
run("pack", "Fix duplicate apply service", "--worker", "codex", "--files", "src/applyService.js", "--out", "memory/alias_codex_work_note.json");
run("repo", "scan", "--root", ".", "--out", ".chay-index/project_map.json");
const projectMap = JSON.parse(fs.readFileSync(path.join(project, ".chay-index", "project_map.json"), "utf8"));
assert.equal(projectMap.strategy, "mtime_size_incremental_v1");
assert.ok(projectMap.files.every((file) => typeof file.mtimeMs === "number" && typeof file.size === "number"));
run("context", "plan", "--task", "Fix duplicate apply service", "--index", ".chay-index/project_map.json", "--out", "memory/context_package.json");
run("workpack", "make", "--worker", "codex", "--goal", "Fix duplicate apply service", "--allowed-files", "src/applyService.js", "--out", "memory/codex_work_note.json");
run("workpack", "make", "--worker", "codex", "--goal", "Fix duplicate apply service", "--allowed-files", "src/applyService.js", "--compact", "--out", "memory/codex_compact_work_note.json");
run("boundary", "check-note", "--file", "memory/task_note.json", "--kind", "task");
run("boundary", "check-note", "--file", "memory/codex_work_note.json", "--kind", "work");
run("boundary", "check-note", "--file", "memory/codex_compact_work_note.json", "--kind", "work");
run("note", "compile", "--json", "memory/task_note.json", "--out", "audit/task_note.md");

const work = JSON.parse(fs.readFileSync(path.join(project, "memory", "codex_work_note.json"), "utf8"));
const compactWork = JSON.parse(fs.readFileSync(path.join(project, "memory", "codex_compact_work_note.json"), "utf8"));
const host = JSON.parse(fs.readFileSync(path.join(project, "memory", "host_config.json"), "utf8"));
assert.deepEqual(host.main, { agent: "claude", llm: "sonnet" });
assert.equal(work.assigned_to, "codex");
assert.deepEqual(work.controller, { agent: "claude", llm: "sonnet" });
assert.equal(work.worker.agent, "codex");
assert.equal(work.worker.llm, "gpt-5");
assert.deepEqual(work.skills, ["repo_search", "solid_refactor", "test_runner", "minimal_patch"]);
assert.equal(work.output_contract.format, "json_only");
assert.equal(work.output_contract.retry_until_valid, true);
assert.ok(work.architecture_rules.some((rule) => rule.includes("SOLID")));
assert.ok(work.minimal_patch_rules.some((rule) => rule.includes("minimalPatchRules")));
assert.deepEqual(work.inputs, ["memory/task_note.json", "memory/context_package.json"]);
assert.equal(compactWork.policy_ref, "policies/chay_policy.json");
assert.equal(compactWork.experience_compression.framework, "experience_compression_spectrum_v1");
assert.ok(compactWork.inputs.includes("memory/plan_ledger.json"));
assert.ok(compactWork.minimal_patch_rules.some((rule) => rule.includes("minimalPatchRules")));

writeDiff("src/applyService.js", "+export const APPLY_POLICY = 'single_responsibility';\n");
run("patch", "check", "--diff", ".chay/tmp/current.diff", "--work", "memory/codex_work_note.json");
fs.mkdirSync(path.join(project, ".chay", "locks"), { recursive: true });
fs.writeFileSync(path.join(project, ".chay", "locks", "src__applyService.js.json"), JSON.stringify({ worker: "other", file: "src/applyService.js" }, null, 2));
const lockedDispatch = run("dispatch", "codex", "--command", workerCommand(), "--max-retries", "0", { expectCode: 2 });
assert.equal(lockedDispatch.ok, false);
assert.equal(lockedDispatch.lock.error, "file_lock_conflict");
fs.unlinkSync(path.join(project, ".chay", "locks", "src__applyService.js.json"));
const bloatedWork = JSON.parse(fs.readFileSync(path.join(project, "memory", "codex_work_note.json"), "utf8"));
bloatedWork.architecture_rules = Array.from({ length: 700 }, (_, index) => `Large architecture rule ${index}: follow local patterns and SOLID boundaries.`);
fs.writeFileSync(path.join(project, "memory", "codex_work_note.json"), JSON.stringify(bloatedWork, null, 2));
const dispatch = run("dispatch", "codex", "--command", workerCommand(), "--test-command", passTestCommand(), "--max-retries", "1");
assert.equal(dispatch.ok, true);
assert.equal(dispatch.worker, "codex");
assert.equal(dispatch.validation.ok, true);
assert.equal(dispatch.test.ok, true);
assert.equal(dispatch.patch.ok, true);
assert.equal(dispatch.token_preflight.compacted, true);
const isolatedRejected = run("dispatch", "codex", "--command", isolatedWorkerCommand({ outside: true }), "--max-retries", "0", "--isolate", { expectCode: 2 });
assert.equal(isolatedRejected.ok, false);
assert.equal(isolatedRejected.isolation.mode, "copy_workspace_v1");
assert.ok(isolatedRejected.patch.violations.some((item) => item.type === "changed_file_outside_scope"));
assert.equal(fs.existsSync(path.join(project, "src", "outside.js")), false);
const isolatedDispatch = run("dispatch", "codex", "--command", isolatedWorkerCommand(), "--max-retries", "0", "--isolate");
assert.equal(isolatedDispatch.ok, true);
assert.equal(isolatedDispatch.isolation.mode, "copy_workspace_v1");
assert.ok(fs.readFileSync(path.join(project, "src", "applyService.js"), "utf8").includes("ISOLATED_POLICY"));
const dispatchProgress = JSON.parse(fs.readFileSync(path.join(project, "memory", "codex_progress.json"), "utf8"));
assert.equal(dispatchProgress.step, "done");
const dispatchHistory = JSON.parse(fs.readFileSync(path.join(project, "memory", "codex_progress_history.json"), "utf8"));
for (const step of ["assigned", "reading", "planning", "editing", "validate_result", "testing", "patch_check", "done"]) {
  assert.ok(dispatchHistory.some((item) => item.step === step), `missing progress step ${step}`);
}
assert.deepEqual(fs.readdirSync(path.join(project, ".chay", "locks")).filter((file) => file.endsWith(".json")), []);
const ledger = JSON.parse(fs.readFileSync(path.join(project, "memory", "plan_ledger.json"), "utf8"));
assert.equal(ledger.steps_done.length, 2);
assert.equal(ledger.last_agent_used, "codex");
const experience = run("experience", "snapshot", "--out", "memory/experience_spectrum.json");
assert.equal(experience.ok, true);
const spectrum = JSON.parse(fs.readFileSync(path.join(project, "memory", "experience_spectrum.json"), "utf8"));
assert.equal(spectrum.framework, "experience_compression_spectrum_v1");
assert.ok(spectrum.spectrum.memory.refs.includes("memory/plan_ledger.json"));
assert.ok(spectrum.spectrum.skills.items.includes("repo_search"));
assert.ok(spectrum.spectrum.skills.items.includes("minimal_patch"));
assert.equal(spectrum.spectrum.rules.policy_ref, "policies/chay_policy.json");
assert.ok(spectrum.spectrum.rules.minimal_patch_rule_count > 0);

writeDiff("src/other.js", "+const value = 'bypass_validation';\n");
const rejected = run("patch", "check", "--diff", ".chay/tmp/current.diff", "--work", "memory/codex_work_note.json", { expectCode: 2 });
assert.equal(rejected.ok, false);
assert.ok(rejected.violations.some((item) => item.type === "changed_file_outside_scope"));
assert.ok(rejected.violations.some((item) => item.type === "forbidden_pattern"));

const docWork = JSON.parse(fs.readFileSync(path.join(project, "memory", "codex_work_note.json"), "utf8"));
docWork.allowed_files = ["docs/product.md"];
fs.mkdirSync(path.join(project, "docs"), { recursive: true });
fs.writeFileSync(path.join(project, "memory", "doc_work_note.json"), JSON.stringify(docWork, null, 2));
writeDiff("docs/product.md", "+Human-owned product behavior changed by AI.\n");
const docRejected = run("patch", "check", "--diff", ".chay/tmp/current.diff", "--work", "memory/doc_work_note.json", { expectCode: 2 });
assert.ok(docRejected.violations.some((item) => item.type === "human_owned_path_requires_approval"));
docWork.human_approved_files = ["docs/product.md"];
fs.writeFileSync(path.join(project, "memory", "doc_work_note.json"), JSON.stringify(docWork, null, 2));
const docApproved = run("patch", "check", "--diff", ".chay/tmp/current.diff", "--work", "memory/doc_work_note.json");
assert.equal(docApproved.ok, true);
docWork.allowed_files = [".env"];
docWork.human_approved_files = [".env"];
fs.writeFileSync(path.join(project, "memory", "doc_work_note.json"), JSON.stringify(docWork, null, 2));
writeDiff(".env", "+SECRET_KEY=leaked\n");
const secretRejected = run("patch", "check", "--diff", ".chay/tmp/current.diff", "--work", "memory/doc_work_note.json", { expectCode: 2 });
assert.ok(secretRejected.violations.some((item) => item.type === "sensitive_path_change_blocked"));

fs.writeFileSync(path.join(project, "memory", "codex_result_note.json"), JSON.stringify({
  work_id: work.work_id,
  worker: "codex",
  status: "completed",
  summary: "Smoke worker completed scoped patch validation.",
  findings: ["Tests passed: node smoke fixture"],
  changed_files: ["src/applyService.js"],
  risks: [],
  next_recommendation: "review_patch"
}, null, 2));
run("boundary", "validate-output", "--file", "memory/codex_result_note.json");
writeDiff("src/applyService.js", "+export const APPLY_POLICY = 'single_responsibility';\n");
const evalReport = run("eval", "report");
assert.equal(evalReport.ok, true);
assert.equal(evalReport.grade, "excellent");
assert.ok(evalReport.cases.every((item) => item.ok));
assert.equal(evalReport.metrics.task_status, "completed");
assert.equal(evalReport.metrics.scope_violations, 0);
assert.equal(evalReport.metrics.retry_count, 0);

fs.writeFileSync(path.join(project, "memory", "bad_result_note.json"), JSON.stringify({
  work_id: work.work_id,
  worker: "codex",
  status: "done",
  summary: 123,
  findings: "not-array"
}, null, 2));
const retry = run("boundary", "validate-output", "--file", "memory/bad_result_note.json", { expectCode: 2 });
assert.equal(retry.next_action, "retry_worker_with_contract");
assert.ok(retry.retry_instruction.includes("Return valid result_note JSON only"));
assert.ok(retry.violations.some((item) => item.type === "invalid_status"));

run("integration", "install", "--target", "claude");
assert.ok(fs.existsSync(path.join(project, ".claude", "agents", "chay-main.md")));
assert.ok(fs.existsSync(path.join(project, ".claude", "agents", "chay-codex-worker.md")));
assert.ok(fs.existsSync(path.join(project, ".claude", "agents", "chay-reviewer.md")));
run("progress", "update", "--agent", "codex", "--step", "editing", "--message", "Editing backend structure");
const progress = JSON.parse(fs.readFileSync(path.join(project, "memory", "codex_progress.json"), "utf8"));
assert.equal(progress.agent, "codex");
assert.equal(progress.step, "editing");
verifyUiTemplate();

console.log(JSON.stringify({ ok: true, project }, null, 2));

function run(...input) {
  return runIn(project, ...input);
}

function runIn(cwd, ...input) {
  const options = typeof input.at(-1) === "object" ? input.pop() : {};
  const result = spawnSync(process.execPath, [cli, ...input], {
    cwd,
    encoding: "utf8"
  });
  const expected = options.expectCode ?? 0;

  if (result.status !== expected) {
    throw new Error([
      `Command failed: cr ${input.join(" ")}`,
      `Expected exit ${expected}, got ${result.status}`,
      result.stdout,
      result.stderr
    ].filter(Boolean).join("\n"));
  }

  const text = result.stdout.trim() || result.stderr.trim();
  assert.ok(text.startsWith("{"), `Expected JSON output for cr ${input.join(" ")}`);
  return JSON.parse(text);
}

function writeDiff(file, addedLine) {
  fs.mkdirSync(path.join(project, ".chay", "tmp"), { recursive: true });
  fs.writeFileSync(path.join(project, ".chay", "tmp", "current.diff"), [
    `diff --git a/${file} b/${file}`,
    `--- a/${file}`,
    `+++ b/${file}`,
    "@@ -0,0 +1 @@",
    addedLine.trimEnd(),
    ""
  ].join("\n"));
}

function workerCommand() {
  const script = [
    "const fs = require('node:fs');",
    "const work = JSON.parse(fs.readFileSync('memory/codex_work_note.json', 'utf8'));",
    "fs.mkdirSync('memory', { recursive: true });",
    "fs.writeFileSync('memory/codex_result_note.json', JSON.stringify({ work_id: work.work_id, worker: 'codex', status: 'completed', summary: 'Dispatch smoke worker completed.', findings: ['dispatch command wrote result note'], changed_files: ['src/applyService.js'], risks: [], next_recommendation: 'review_patch' }, null, 2));",
    "fs.mkdirSync('.chay/tmp', { recursive: true });",
    "fs.writeFileSync('.chay/tmp/current.diff', ['diff --git a/src/applyService.js b/src/applyService.js', '--- a/src/applyService.js', '+++ b/src/applyService.js', '@@ -0,0 +1 @@', '+export const APPLY_POLICY = \\'single_responsibility\\';', ''].join('\\n'));"
  ].join(" ");
  return `${JSON.stringify(process.execPath)} -e ${JSON.stringify(script)}`;
}

function passTestCommand() {
  const script = "console.log('smoke test command passed');";
  return `${JSON.stringify(process.execPath)} -e ${JSON.stringify(script)}`;
}

function isolatedWorkerCommand(options = {}) {
  const script = [
    "const fs = require('node:fs');",
    "const work = JSON.parse(fs.readFileSync('memory/codex_work_note.json', 'utf8'));",
    "fs.writeFileSync('src/applyService.js', fs.readFileSync('src/applyService.js', 'utf8') + '\\nexport const ISOLATED_POLICY = true;\\n');",
    options.outside ? "fs.writeFileSync('src/outside.js', 'export const OUTSIDE_SCOPE = true;\\n');" : "",
    "fs.mkdirSync('memory', { recursive: true });",
    "fs.writeFileSync('memory/codex_result_note.json', JSON.stringify({ work_id: work.work_id, worker: 'codex', status: 'completed', summary: 'Isolated worker completed.', findings: ['isolated command wrote result note'], changed_files: ['src/applyService.js'], risks: [], next_recommendation: 'review_patch' }, null, 2));"
  ].filter(Boolean).join(" ");
  return `${JSON.stringify(process.execPath)} -e ${JSON.stringify(script)}`;
}

function verifyUiTemplate() {
  const html = fs.readFileSync(path.join(repoRoot, "site", "console.html"), "utf8");
  const server = fs.readFileSync(path.join(repoRoot, "src", "commands", "ui.js"), "utf8");
  const progress = fs.readFileSync(path.join(repoRoot, "src", "utils", "progress.js"), "utf8");
  for (const text of ["Chạy Inspector", "targets", "taskText", "filesText", "idePrompt", "Feature Graph", "Folder Structure", "Selected Files", "Token Saving", "plantuml_sequence"]) {
    assert.ok(html.includes(text), `missing inspector control: ${text}`);
  }
  assert.ok(progress.includes("validate_result"), "missing progress contract: validate_result");
  assert.ok(fs.readFileSync(path.join(repoRoot, "src", "core", "agents.js"), "utf8").includes("anti: \"antigravity\""));
  for (const text of ["/api/stream", "config_ide", "action === \"go\"", "action === \"handoff\"", "action === \"verify\"", "feature_graph", "handoff", "ide_config"]) {
    assert.ok(server.includes(text), `missing UI server contract: ${text}`);
  }
  assert.ok(server.includes("available_agents"));
  assert.ok(server.includes("result_notes"));
}
