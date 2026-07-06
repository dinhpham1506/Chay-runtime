import { exists, readJson, readText } from "../utils/fs.js";
import { analyzeDiff, validateDiff } from "./diff.js";
import { buildTokenReport } from "./tokenReport.js";
import { validateResultNote } from "./validators.js";
import { defaultWorker, resultNotePath, workNotePath } from "./host.js";

export function buildEvalReport(policy, options = {}) {
  const worker = options.worker || defaultWorker();
  const resultNote = optionalJson(options.resultFile || resultNotePath(worker));
  const workNote = optionalJson(options.workFile || workNotePath(worker));
  const tokenReport = buildTokenReport(policy, { worker, workFile: options.workFile, resultFile: options.resultFile });
  const resultValidation = resultNote ? validateResultNote(resultNote, policy) : missingValidation("result_note_missing");
  const patch = buildPatchCase(workNote, policy);
  const retryCount = countRetries();
  const tests = testSignal(resultNote);
  const status = resultNote?.status || "missing";
  const workResultMatch = Boolean(workNote?.work_id && resultNote?.work_id && workNote.work_id === resultNote.work_id);

  const cases = [
    caseItem("task_completed", status === "completed", 15, status),
    caseItem("work_result_match", workResultMatch, 15, `${workNote?.work_id || "missing"}:${resultNote?.work_id || "missing"}`),
    caseItem("result_contract_valid", resultValidation.ok, 15, compactTypes(resultValidation.violations)),
    caseItem("patch_policy_valid", patch.ok, 20, compactTypes(patch.violations)),
    caseItem("tests_passed_signal", tests === "passed", 15, tests),
    caseItem("scope_violations_zero", patch.scope_violations === 0, 10, String(patch.scope_violations)),
    caseItem("low_retry_count", retryCount <= 1, 5, String(retryCount)),
    caseItem("token_efficiency_good", tokenReport.estimates.savings_percent >= 50 && tokenReport.ok, 5, `${tokenReport.estimates.savings_percent}%`)
  ];

  return {
    ok: status === "completed" && workResultMatch && resultValidation.ok && patch.ok && score(cases) >= 70,
    score: capScore(score(cases), status, workResultMatch, resultValidation.ok, patch.ok),
    grade: grade(capScore(score(cases), status, workResultMatch, resultValidation.ok, patch.ok)),
    formula: "task_completed + work_result_match + valid_result + valid_patch_scope + test_signal + low_retry + token_efficiency",
    worker,
    metrics: {
      task_status: status,
      work_result_match: workResultMatch,
      result_tokens: resultValidation.tokens || 0,
      result_valid: resultValidation.ok,
      patch_valid: patch.ok,
      changed_files: patch.analysis.changedFileCount,
      added_lines: patch.analysis.addedLines,
      deleted_lines: patch.analysis.deletedLines,
      scope_violations: patch.scope_violations,
      retry_count: retryCount,
      tests_signal: tests,
      token_savings_percent: tokenReport.estimates.savings_percent,
      chay_context_tokens: tokenReport.estimates.chay_context_tokens,
      full_repo_tokens: tokenReport.estimates.full_repo_tokens
    },
    cases,
    violations: [...resultValidation.violations, ...patch.violations, ...tokenReport.violations],
    next_action: nextAction(status, workResultMatch, resultValidation.ok, patch.ok, tests)
  };
}

function buildPatchCase(work, policy) {
  const empty = { changedFiles: [], changedFileCount: 0, addedLines: 0, deletedLines: 0, totalDiffLines: 0 };
  if (!work) return { ok: false, analysis: empty, scope_violations: 0, violations: [{ type: "work_note_missing" }] };
  if (!exists(".chay/tmp/current.diff")) {
    return { ok: false, analysis: empty, scope_violations: 0, violations: [{ type: "diff_missing" }] };
  }

  const diffText = readText(".chay/tmp/current.diff");
  const analysis = analyzeDiff(diffText);
  const result = validateDiff(analysis, work, policy, diffText);
  return {
    ok: result.ok,
    analysis,
    scope_violations: result.violations.filter((item) => item.type === "changed_file_outside_scope").length,
    violations: result.violations
  };
}

function testSignal(resultNote) {
  const text = JSON.stringify([resultNote?.summary || "", ...(resultNote?.findings || [])]).toLowerCase();
  if (/tests?\s+passed|passed.*tests?|mvn test.*passed|dotnet test.*passed|npm test.*passed/.test(text)) return "passed";
  if (/tests?\s+failed|failed.*tests?|build failed|compile failed/.test(text)) return "failed";
  return "unknown";
}

function countRetries() {
  const chat = optionalJson("memory/chat/messages.json") || [];
  const retryText = JSON.stringify(chat).toLowerCase();
  const matches = retryText.match(/retry|try again|rerun|fix contract|retry_worker_with_contract/g);
  return matches ? matches.length : 0;
}

function caseItem(id, ok, weight, value) {
  return { id, ok, weight, value };
}

function score(cases) {
  return cases.reduce((total, item) => total + (item.ok ? item.weight : 0), 0);
}

function capScore(value, status, matchOk, resultOk, patchOk) {
  let capped = value;
  if (status !== "completed") capped = Math.min(capped, 55);
  if (!matchOk) capped = Math.min(capped, 55);
  if (!resultOk) capped = Math.min(capped, 50);
  if (!patchOk) capped = Math.min(capped, 65);
  return Math.max(0, Math.min(100, capped));
}

function grade(value) {
  if (value >= 85) return "excellent";
  if (value >= 70) return "good";
  if (value >= 50) return "weak";
  return "failing";
}

function nextAction(status, matchOk, resultOk, patchOk, tests) {
  if (status !== "completed") return "finish_or_reassign_task_before_scoring";
  if (!matchOk) return "run_current_work_note_and_write_matching_result_note";
  if (!resultOk) return "retry_worker_with_result_contract";
  if (!patchOk) return "fix_patch_scope_or_budget";
  if (tests !== "passed") return "run_relevant_tests_and_update_result_note";
  return "ready_for_review";
}

function compactTypes(violations) {
  return violations.length ? violations.map((item) => item.type).join(",") : "ok";
}

function missingValidation(type) {
  return { ok: false, tokens: 0, violations: [{ type }] };
}

function optionalJson(file) {
  try {
    return exists(file) ? readJson(file) : null;
  } catch {
    return null;
  }
}
