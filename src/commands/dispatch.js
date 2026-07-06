import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { parseArgs } from "../utils/args.js";
import { exists, readJson, readText, writeJson, writeText } from "../utils/fs.js";
import { writeProgressNote } from "../utils/progress.js";
import { loadPolicy } from "../core/policy.js";
import { validateResultNote } from "../core/validators.js";
import { analyzeDiff, validateDiff } from "../core/diff.js";
import { commandForAgent, isSupportedAgent, supportedAgentNames } from "../core/engineAdapters.js";
import { buildTokenReport } from "../core/tokenReport.js";
import { normalizeAgentName } from "../core/agents.js";
import { resolveWorker } from "../core/host.js";

const lockDir = ".chay/locks";

export async function dispatch(argv) {
  const result = await dispatchWorker(argv);
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 2;
}

export async function dispatchWorker(argv) {
  const args = parseArgs(argv);
  const worker = resolveWorker(args);
  const workFile = args.work || `memory/${worker}_work_note.json`;
  if (!exists(workFile)) throw new Error(`work note not found: ${workFile}`);

  const policy = loadPolicy(args.policy);
  const tokenPreflight = enforceTokenBudget({ args, policy, worker, workFile });
  if (!tokenPreflight.ok) {
    writeProgress(worker, "blocked", "Token budget preflight failed");
    return {
      ok: false,
      worker,
      work_note: workFile,
      token_preflight: tokenPreflight,
      next_action: "reduce_context_or_raise_policy_budget"
    };
  }
  const work = readJson(workFile);
  const agent = resolveAgent(args, worker, work);
  const model = resolveModel(args, work);
  const maxRetries = nonNegativeInt(args["max-retries"] ?? policy.maxDispatchRetries ?? 3);
  const resultFile = args.out || `memory/${worker}_result_note.json`;
  const diffFile = args.diff || ".chay/tmp/current.diff";
  const logFile = args.log || `.chay/tmp/${worker}-dispatch.log`;
  const promptFile = args["prompt-file"] || `.chay/tmp/${worker}-dispatch-prompt.txt`;
  const isolation = shouldIsolate(args, policy) ? prepareIsolatedWorkspace({ worker, workFile, resultFile, diffFile, logFile, promptFile, work }) : null;
  const runCwd = isolation?.root || process.cwd();
  const runPaths = resolveRunPaths(runCwd, { workFile, resultFile, diffFile, logFile, promptFile });

  if (!isSupportedAgent(agent) && !args.command && !process.env.CHAY_DISPATCH_COMMAND) {
    throw new Error(`--agent must be one of: ${supportedAgentNames().join(", ")}`);
  }

  writeProgress(worker, "assigned", `Dispatching ${worker} via ${agent}${model ? ` model ${model}` : ""}`);
  const lock = acquireFileLocks(worker, work);
  if (!lock.ok) {
    writeProgress(worker, "blocked", `File lock conflict: ${lock.file}`);
      return {
        ok: false,
        worker,
        agent,
        work_note: workFile,
        lock,
        token_preflight: tokenPreflight,
        next_action: "wait_for_running_worker_or_change_allowed_files"
      };
  }

  let retryInstruction = "";
  let validation = null;
  let lastRun = null;
  let attempts = 0;

  try {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      attempts = attempt + 1;
      const prompt = buildPrompt({ worker, workFile, resultFile, diffFile, retryInstruction, attempt });
      writeText(runPaths.promptFile, prompt);

      if (attempt === 0) {
        writeProgress(worker, "reading", "Reading work note and compact context");
        writeProgress(worker, "planning", "Preparing bounded worker prompt");
      } else {
        writeProgress(worker, "planning", "Retrying invalid result note");
      }
      writeProgress(worker, "editing", "Worker process running");
      lastRun = await runAgent({ args, agent, model, prompt, promptFile: runPaths.promptFile, worker, logFile: runPaths.logFile, cwd: runCwd });
      if (!lastRun.ok) {
        syncIsolatedOutputs(isolation, { resultFile, diffFile, logFile });
        writeProgress(worker, "blocked", workerRunErrorMessage(lastRun));
        return {
          ok: false,
          worker,
          agent,
          model: model || "user-selected",
          work_note: workFile,
          result_note: resultFile,
          isolation: isolationSummary(isolation),
          token_preflight: tokenPreflight,
          attempts,
          retry_limit: maxRetries,
          ...lastRun,
          next_action: "fix_dispatch_command_or_run_worker_manually"
        };
      }

      writeProgress(worker, "validate_result", "Worker finished; validating result note");
      maybeWriteResultFromStdout(runPaths.resultFile, lastRun.stdout);
      validation = validateResultFile(runPaths.resultFile, policy, work, worker);
      if (validation.ok) break;

      retryInstruction = buildRetryInstruction(validation.violations, policy);
      if (attempt === maxRetries) {
        syncIsolatedOutputs(isolation, { resultFile, diffFile, logFile });
        writeProgress(worker, "blocked", "Result note stayed invalid after retry limit");
        return {
          ok: false,
          worker,
          agent,
          work_note: workFile,
          result_note: resultFile,
          isolation: isolationSummary(isolation),
          token_preflight: tokenPreflight,
          attempts,
          retry_limit: maxRetries,
          validation,
          retry_instruction: retryInstruction,
          log: logFile,
          next_action: "escalate_invalid_worker_output_to_human"
        };
      }
    }

    const test = await runTestCommand({ args, cwd: runCwd, logFile: runPaths.logFile, worker });
    if (!test.ok) {
      syncIsolatedOutputs(isolation, { resultFile, diffFile, logFile });
      writeProgress(worker, "blocked", "Test command failed");
      return {
        ok: false,
        worker,
        agent,
        work_note: workFile,
        result_note: resultFile,
        isolation: isolationSummary(isolation),
        token_preflight: tokenPreflight,
        attempts,
        retry_limit: maxRetries,
        validation,
        test,
        log: logFile,
        next_action: "fix_tests_or_worker_patch"
      };
    }

    writeProgress(worker, "patch_check", "Validating patch boundary");
    const patch = checkPatchBoundary({ diffFile: runPaths.diffFile, workFile: runPaths.workFile, work, policy, cwd: runCwd });
    if (!patch.ok) {
      syncIsolatedOutputs(isolation, { resultFile, diffFile, logFile });
      writeProgress(worker, "blocked", "Patch boundary failed");
      return {
        ok: false,
        worker,
        agent,
        work_note: workFile,
        result_note: resultFile,
        isolation: isolationSummary(isolation),
        token_preflight: tokenPreflight,
        attempts,
        retry_limit: maxRetries,
        validation,
        patch,
        log: logFile,
        next_action: "fix_patch_scope"
      };
    }

    syncIsolatedPatch(isolation, work);
    syncIsolatedOutputs(isolation, { resultFile, diffFile, logFile });
    writeProgress(worker, "done", "Worker result accepted");
    const ledger = updatePlanLedger({ worker, work, resultFile, patch });
    return {
      ok: true,
      worker,
      agent,
      model: model || "user-selected",
      work_note: workFile,
      result_note: resultFile,
      isolation: isolationSummary(isolation),
      token_preflight: tokenPreflight,
      attempts,
      retry_limit: maxRetries,
      validation,
      test,
      patch,
      plan_ledger: ledger.file,
      log: logFile,
      next_action: "review_result_note_and_patch"
    };
  } finally {
    releaseFileLocks(lock);
  }
}

function workerRunErrorMessage(run) {
  if (run?.detail) return `${run.error || "worker_process_failed"}: ${run.detail}`;
  if (run?.stderr) return `${run.error || "worker_process_failed"}: ${run.stderr}`;
  return run?.error || "Worker process failed";
}

function resolveAgent(args, worker, work) {
  if (args.agent) return normalizeAgentName(args.agent);
  if (work.worker?.agent) return normalizeAgentName(work.worker.agent);
  return worker;
}

function resolveModel(args, work) {
  const model = args.model || args.llm || args["worker-llm"] || work.worker?.llm || "";
  return selectedModel(model);
}

function selectedModel(model) {
  const value = String(model || "").trim();
  return value && value !== "user-selected" ? value : "";
}

function acquireFileLocks(worker, work) {
  const files = Array.isArray(work.allowed_files) ? work.allowed_files.filter(Boolean) : [];
  if (files.length === 0) return { ok: true, files: [], locks: [] };

  fs.mkdirSync(lockDir, { recursive: true });
  const locks = [];
  for (const file of [...new Set(files)].sort()) {
    const lockFile = path.join(lockDir, `${safeLockName(file)}.json`);
    try {
      fs.writeFileSync(lockFile, JSON.stringify({
        worker,
        work_id: work.work_id,
        file,
        created_at: new Date().toISOString()
      }, null, 2), { encoding: "utf8", flag: "wx" });
      locks.push(lockFile);
    } catch (error) {
      for (const acquired of locks) {
        try { fs.unlinkSync(acquired); } catch { /* best effort cleanup */ }
      }
      return {
        ok: false,
        error: "file_lock_conflict",
        file,
        lock: lockFile,
        detail: error.code === "EEXIST" ? readExistingLock(lockFile) : error.message
      };
    }
  }
  return { ok: true, files, locks };
}

function releaseFileLocks(lock) {
  for (const file of lock?.locks || []) {
    try { fs.unlinkSync(file); } catch { /* best effort cleanup */ }
  }
}

function safeLockName(file) {
  return String(file).replace(/[^a-zA-Z0-9._-]+/g, "__");
}

function readExistingLock(file) {
  try {
    return readJson(file);
  } catch {
    return { lock: file };
  }
}

function nonNegativeInt(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : 3;
}

function buildPrompt({ worker, workFile, resultFile, diffFile, retryInstruction, attempt }) {
  return [
    `You are the bounded Chạy Runtime ${worker} worker. Execute the task in ${workFile}.`,
    `The repo root is the current working directory.`,
    `Read memory/task_note.json, memory/context_package.json, ${workFile}, and only files listed in allowed_files when allowed_files is present.`,
    `Before editing, apply minimal_patch: reuse existing code, prefer native/standard features, avoid new dependencies, and make the smallest correct patch without removing validation, security, accessibility, or tests.`,
    `You may emit worker progress with cr progress update --agent ${worker} for reading, planning, editing, testing when you run tests, or blocked. Dispatch writes assigned, validate_result, patch_check, and done.`,
    `Before finishing, refresh the scoped diff with git diff --no-ext-diff -- . > ${diffFile}.`,
    `Write compact result_note JSON to ${resultFile}. Return only that result_note JSON.`,
    `The result_note must use the same work_id as ${workFile}, worker="${worker}", status completed|failed|blocked|partial, summary string, findings array.`,
    retryInstruction ? `Retry attempt ${attempt}. Previous output was invalid. ${retryInstruction}` : ""
  ].filter(Boolean).join("\n");
}

async function runTestCommand({ args, cwd, logFile, worker }) {
  const command = args["test-command"];
  if (!command) return { ok: true, skipped: true };
  if (typeof command !== "string" || !command.trim()) {
    return { ok: false, error: "test_command_required" };
  }

  writeProgress(worker, "testing", "Running test command");
  fs.mkdirSync(path.dirname(logFile), { recursive: true });
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    const startedAt = Date.now();
    const child = spawn(command, [], {
      cwd,
      env: process.env,
      shell: true,
      stdio: ["ignore", "pipe", "pipe"]
    });

    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      stdout += text;
      appendLog(logFile, text);
    });
    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      stderr += text;
      appendLog(logFile, text);
    });
    child.on("error", (error) => resolve({ ok: false, error: "test_spawn_failed", detail: error.message, log: logFile }));
    child.on("close", (code) => resolve({
      ok: code === 0,
      command,
      exit_code: code,
      stdout: compact(stdout),
      stderr: compact(stderr),
      duration_ms: Date.now() - startedAt,
      log: logFile,
      error: code === 0 ? undefined : "test_command_failed"
    }));
  });
}

async function runAgent({ args, agent, model, prompt, promptFile, worker, logFile, cwd = process.cwd() }) {
  const command = args.command || process.env.CHAY_DISPATCH_COMMAND;
  const spec = command ? { command, args: [], shell: true } : commandForAgent(agent, { prompt, promptFile, worker, model });
  if (!spec) return { ok: false, error: `agent_cli_not_configured:${agent}` };

  fs.mkdirSync(path.dirname(logFile), { recursive: true });
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    const startedAt = Date.now();
    const env = {
      ...process.env,
      CHAY_WORKER: worker,
      CHAY_DISPATCH_PROMPT_FILE: promptFile
    };
    const child = spawn(spec.command, spec.args, {
      cwd,
      env,
      shell: Boolean(spec.shell),
      stdio: ["ignore", "pipe", "pipe"]
    });

    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      stdout += text;
      appendLog(logFile, text);
    });
    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      stderr += text;
      appendLog(logFile, text);
    });
    child.on("error", (error) => resolve({ ok: false, error: "spawn_failed", detail: error.message, log: logFile }));
    child.on("close", (code) => resolve({
      ok: code === 0,
      exit_code: code,
      stdout,
      stderr: compact(stderr),
      duration_ms: Date.now() - startedAt,
      log: logFile,
      error: code === 0 ? undefined : "agent_process_failed"
    }));
  });
}

function maybeWriteResultFromStdout(resultFile, stdout) {
  const text = String(stdout || "").trim();
  if (!text) return;
  try {
    writeJson(resultFile, JSON.parse(text));
  } catch {
    const match = text.match(/\{[\s\S]*\}$/);
    if (!match) return;
    try {
      writeJson(resultFile, JSON.parse(match[0]));
    } catch {
      // The validator will produce the retry instruction.
    }
  }
}

function validateResultFile(resultFile, policy, work, worker) {
  if (!exists(resultFile)) {
    return {
      ok: false,
      tokens: 0,
      violations: [{ type: "result_note_missing", file: resultFile }]
    };
  }
  try {
    const note = readJson(resultFile);
    const result = validateResultNote(note, policy);
    const violations = [...result.violations];
    if (note.work_id !== work.work_id) violations.push({ type: "work_id_mismatch", expected: work.work_id, actual: note.work_id });
    if (note.worker !== worker) violations.push({ type: "worker_mismatch", expected: worker, actual: note.worker });
    return {
      ...result,
      ok: violations.length === 0,
      violations
    };
  } catch (error) {
    return {
      ok: false,
      tokens: 0,
      violations: [{ type: "result_note_invalid_json", file: resultFile, message: error.message }]
    };
  }
}

function checkPatchBoundary({ diffFile, workFile, work, policy, cwd = process.cwd() }) {
  const refreshed = refreshDiff(diffFile, cwd);
  if (!refreshed.ok) return refreshed;
  if (!exists(diffFile)) return { ok: false, error: "diff_not_found", diff: diffFile };

  const diffText = readText(diffFile);
  const analysis = analyzeDiff(diffText);
  const result = validateDiff(analysis, work, policy, diffText);
  return {
    ok: result.ok,
    diff: diffFile,
    work: displayPath(workFile),
    refreshed: refreshed.refreshed,
    warning: refreshed.warning,
    analysis,
    violations: result.violations
  };
}

function updatePlanLedger({ worker, work, resultFile, patch }) {
  const file = "memory/plan_ledger.json";
  const result = exists(resultFile) ? readJson(resultFile) : {};
  const ledger = exists(file) ? readJson(file) : {
    task_id: work.work_id,
    original_plan: [work.goal],
    current_step: 0,
    steps_done: [],
    decisions_made: {},
    last_agent_used: null
  };

  const step = {
    step_index: Array.isArray(ledger.steps_done) ? ledger.steps_done.length : 0,
    worker,
    work_id: work.work_id,
    result_summary: result.summary || "",
    changed_files: result.changed_files || patch.analysis?.changedFiles || [],
    at: new Date().toISOString()
  };

  ledger.task_id = ledger.task_id || work.work_id;
  ledger.original_plan = Array.isArray(ledger.original_plan) && ledger.original_plan.length > 0 ? ledger.original_plan : [work.goal];
  ledger.steps_done = [...(ledger.steps_done || []), step];
  ledger.current_step = ledger.steps_done.length;
  ledger.decisions_made = ledger.decisions_made || {};
  ledger.last_agent_used = worker;
  ledger.updated_at = step.at;

  writeJson(file, ledger);
  return { file, step };
}

function refreshDiff(diffFile, cwd) {
  const pathspec = [".", ":(exclude).chay", ":(exclude)memory", ":(exclude)audit"];
  const result = spawnSync("git", ["diff", "--no-ext-diff", "--", ...pathspec], { cwd, encoding: "utf8" });
  if (result.status === 0) {
    const untracked = spawnSync("git", ["ls-files", "--others", "--exclude-standard", "--", ...pathspec], { cwd, encoding: "utf8" });
    writeText(diffFile, joinDiffs(result.stdout, syntheticDiffForUntracked(untracked.status === 0 ? untracked.stdout : "")));
    return { ok: true, refreshed: true };
  }
  if (exists(diffFile)) {
    return { ok: true, refreshed: false, warning: "git_diff_failed_using_existing_diff" };
  }
  return {
    ok: false,
    error: "git_diff_failed",
    stderr: compact(result.stderr)
  };
}

function shouldIsolate(args, policy) {
  return Boolean(args.isolate || args["isolate-workspace"] || policy.isolateWorkers);
}

function enforceTokenBudget({ args, policy, worker, workFile }) {
  if (args["skip-token-check"]) {
    return { ok: true, skipped: true };
  }

  const maxPasses = nonNegativeInt(args["token-passes"] ?? policy.maxTokenCompactionPasses ?? 2);
  const history = [];

  for (let pass = 0; pass <= maxPasses; pass++) {
    const report = buildTokenReport(policy, { worker, workFile });
    const blocking = preDispatchTokenViolations(report);
    history.push({
      pass,
      ok: blocking.length === 0,
      worker,
      violations: blocking,
      estimates: report.estimates
    });

    if (blocking.length === 0) {
      return {
        ok: true,
        compacted: history.length > 1,
        passes: history.length,
        history,
        report
      };
    }

    if (args["no-auto-compact"] || pass === maxPasses) {
      return {
        ok: false,
        compacted: history.length > 1,
        passes: history.length,
        history,
        report
      };
    }

    const compaction = compactTokenInputs({ worker, workFile, policy, blocking });
    history[history.length - 1].compaction = compaction;
    if (!compaction.changed) {
      return {
        ok: false,
        compacted: history.length > 1,
        passes: history.length,
        history,
        report,
        reason: "no_more_compaction_available"
      };
    }
  }

  return { ok: false, history };
}

function preDispatchTokenViolations(report) {
  return (report.violations || []).filter((violation) => violation.type !== "result_budget_exceeded");
}

function compactTokenInputs({ worker, workFile, policy, blocking }) {
  const changes = [];
  if (blocking.some((item) => item.file === "memory/context_package.json")) {
    const context = compactContextPackage();
    if (context.changed) changes.push(context);
  }
  if (blocking.some((item) => item.file === workFile)) {
    const work = compactWorkNote({ worker, workFile, policy });
    if (work.changed) changes.push(work);
  }
  return {
    changed: changes.length > 0,
    changes
  };
}

function compactContextPackage(file = "memory/context_package.json") {
  if (!exists(file)) return { changed: false, target: file, reason: "missing" };
  const context = readJson(file);
  if (!Array.isArray(context.selected_files) || context.selected_files.length <= 1) {
    return { changed: false, target: file, reason: "minimum_selected_files" };
  }
  const before = context.selected_files.length;
  context.selected_files = context.selected_files.slice(0, Math.max(1, Math.ceil(before / 2)));
  context.compacted_at = new Date().toISOString();
  context.compaction = {
    strategy: "halve_selected_files_until_token_budget",
    previous_selected_count: before,
    selected_count: context.selected_files.length
  };
  writeJson(file, context);
  return { changed: true, target: file, before, after: context.selected_files.length };
}

function compactWorkNote({ worker, workFile, policy }) {
  if (!exists(workFile)) return { changed: false, target: workFile, reason: "missing" };
  const work = readJson(workFile);
  if (work.policy_ref && work.experience_compression) {
    return { changed: false, target: workFile, reason: "already_compact" };
  }

  work.context_summary = "Use compact memory/task_note.json + memory/context_package.json.";
  work.architecture_rules = ["Follow policy_ref architectureRules."];
  work.minimal_patch_rules = ["Follow policy_ref minimalPatchRules before editing."];
  work.skill_refs = [
    "skills are procedural hints; use only names listed in skills",
    "do not expand skill instructions unless needed for the touched files"
  ];
  work.forbidden = [
    "Follow policy_ref forbiddenPatterns and forbiddenNotePaths.",
    "Do not read audit markdown or rewrite unrelated files."
  ];
  work.policy_ref = work.policy_ref || "policies/chay_policy.json";
  work.experience_compression = {
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
  };
  work.max_output_tokens = Number(work.max_output_tokens || policy.maxResultTokens || 900);

  writeJson(workFile, work);
  return { changed: true, target: workFile, strategy: "compact_work_note_policy_refs" };
}

function resolveRunPaths(cwd, files) {
  return Object.fromEntries(
    Object.entries(files).map(([key, file]) => [key, path.isAbsolute(file) ? file : path.join(cwd, file)])
  );
}

function prepareIsolatedWorkspace({ worker, workFile, resultFile, diffFile, logFile, promptFile, work }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `chay-${worker}-`));
  const files = new Set([
    workFile,
    resultFile,
    diffFile,
    logFile,
    promptFile,
    "package.json",
    "package-lock.json",
    "pnpm-lock.yaml",
    "yarn.lock",
    "tsconfig.json",
    "jsconfig.json",
    "vite.config.js",
    "vitest.config.js",
    "jest.config.js",
    "policies/chay_policy.json",
    "schemas/result_note.schema.json",
    ...safeList(work.inputs),
    ...safeList(work.allowed_files),
    ...contextSelectedFiles()
  ]);

  for (const file of files) {
    const safe = safeRelativePath(file, "isolation file");
    const source = path.join(process.cwd(), safe);
    const target = path.join(root, safe);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    if (fs.existsSync(source) && fs.statSync(source).isFile()) {
      fs.copyFileSync(source, target);
    }
  }

  initSandboxGit(root);
  return { root, mode: "copy_workspace_v1" };
}

function contextSelectedFiles() {
  const file = "memory/context_package.json";
  if (!exists(file)) return [];
  try {
    const context = readJson(file);
    return safeList(context.selected_files).map((item) => typeof item === "string" ? item : item.path).filter(Boolean);
  } catch {
    return [];
  }
}

function safeList(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function safeRelativePath(file, label) {
  const normalized = path.normalize(String(file || "")).replace(/\\/g, "/");
  if (!normalized || normalized === "." || normalized === ".." || normalized.startsWith("../") || path.isAbsolute(normalized)) {
    throw new Error(`${label} must be a relative path inside the project: ${file}`);
  }
  return normalized;
}

function initSandboxGit(root) {
  const init = spawnSync("git", ["init", "--quiet"], { cwd: root, encoding: "utf8" });
  if (init.status !== 0) throw new Error(`failed to initialize isolated workspace git repo: ${compact(init.stderr)}`);
  const add = spawnSync("git", ["add", "."], { cwd: root, encoding: "utf8" });
  if (add.status !== 0) throw new Error(`failed to stage isolated workspace baseline: ${compact(add.stderr)}`);
}

function syncIsolatedPatch(isolation, work) {
  if (!isolation) return;
  for (const file of safeList(work.allowed_files)) {
    const safe = safeRelativePath(file, "allowed file");
    const source = path.join(isolation.root, safe);
    const target = path.join(process.cwd(), safe);
    if (!fs.existsSync(source) || !fs.statSync(source).isFile()) continue;
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
  }
}

function syncIsolatedOutputs(isolation, files) {
  if (!isolation) return;
  for (const file of Object.values(files)) {
    const safe = safeRelativePath(file, "output file");
    const source = path.join(isolation.root, safe);
    const target = path.join(process.cwd(), safe);
    if (!fs.existsSync(source) || !fs.statSync(source).isFile()) continue;
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
  }
}

function isolationSummary(isolation) {
  return isolation ? { mode: isolation.mode, workspace: isolation.root } : undefined;
}

function syntheticDiffForUntracked(stdout) {
  return String(stdout || "")
    .split(/\r?\n/)
    .map((file) => file.trim())
    .filter(Boolean)
    .filter((file) => !isRuntimePath(file))
    .map((file) => [
      `diff --git a/${file} b/${file}`,
      "--- /dev/null",
      `+++ b/${file}`,
      "@@ -0,0 +1 @@",
      "+<untracked file>",
      ""
    ].join("\n"))
    .join("");
}

function joinDiffs(...parts) {
  return parts
    .map((part) => String(part || "").trimEnd())
    .filter(Boolean)
    .join("\n");
}

function isRuntimePath(file) {
  return /^(?:\.chay|memory|audit)(?:\/|$)/.test(String(file || "").replace(/\\/g, "/"));
}

function displayPath(file) {
  const cwd = process.cwd();
  return path.isAbsolute(file) ? path.relative(cwd, file) || file : file;
}

function buildRetryInstruction(violations, policy) {
  return [
    "Return valid result_note JSON only. No markdown, no prose.",
    "Required fields: work_id string, worker string, status enum completed|failed|blocked|partial, summary string, findings array.",
    "Optional fields: changed_files array, risks array, next_recommendation string.",
    `Keep under ${policy.maxResultTokens} estimated tokens.`,
    `Fix violations: ${violations.map((item) => item.type).join(", ")}.`
  ].join(" ");
}

function writeProgress(agent, step, message) {
  return writeProgressNote(agent, step, message);
}

function appendLog(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, text, "utf8");
}

function compact(value) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > 320 ? `${text.slice(0, 317)}...` : text;
}
