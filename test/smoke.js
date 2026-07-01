import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cli = path.join(repoRoot, "bin", "cr.js");
const project = fs.mkdtempSync(path.join(os.tmpdir(), "chay-runtime-smoke-"));

assert.ok(fs.existsSync(path.join(repoRoot, "site", "console.html")));
assert.ok(!fs.readFileSync(path.join(repoRoot, "src", "commands", "ui.js"), "utf8").includes("function html()"));

fs.mkdirSync(path.join(project, "src"), { recursive: true });
fs.writeFileSync(path.join(project, "src", "applyService.js"), [
  "export function canApply(userId, jobId) {",
  "  return Boolean(userId && jobId);",
  "}",
  ""
].join("\n"));

run("doctor");
run("setup", "--agents", "claude,codex", "--main", "claude", "--main-llm", "sonnet", "--workers", "codex", "--worker-llms", "codex:gpt-5", "--skills", "repo_search,solid_refactor,test_runner,minimal_patch");
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
const dispatch = run("dispatch", "codex", "--command", workerCommand(), "--max-retries", "1");
assert.equal(dispatch.ok, true);
assert.equal(dispatch.worker, "codex");
assert.equal(dispatch.validation.ok, true);
assert.equal(dispatch.patch.ok, true);
const dispatchProgress = JSON.parse(fs.readFileSync(path.join(project, "memory", "codex_progress.json"), "utf8"));
assert.equal(dispatchProgress.step, "done");
const dispatchHistory = JSON.parse(fs.readFileSync(path.join(project, "memory", "codex_progress_history.json"), "utf8"));
for (const step of ["assigned", "reading", "planning", "editing", "testing", "patch_check", "done"]) {
  assert.ok(dispatchHistory.some((item) => item.step === step), `missing progress step ${step}`);
}
assert.deepEqual(fs.readdirSync(path.join(project, ".chay", "locks")).filter((file) => file.endsWith(".json")), []);
const ledger = JSON.parse(fs.readFileSync(path.join(project, "memory", "plan_ledger.json"), "utf8"));
assert.equal(ledger.steps_done.length, 1);
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

console.log(JSON.stringify({ ok: true, project }, null, 2));

function run(...input) {
  const options = typeof input.at(-1) === "object" ? input.pop() : {};
  const result = spawnSync(process.execPath, [cli, ...input], {
    cwd: project,
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

  const text = result.stdout.trim();
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
