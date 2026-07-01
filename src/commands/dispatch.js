import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { parseArgs } from "../utils/args.js";
import { exists, readJson, readText, writeJson, writeText } from "../utils/fs.js";
import { writeProgressNote } from "../utils/progress.js";
import { loadPolicy } from "../core/policy.js";
import { validateResultNote } from "../core/validators.js";
import { analyzeDiff, validateDiff } from "../core/diff.js";
import { commandForAgent, isSupportedAgent, supportedAgentNames } from "../core/engineAdapters.js";

const lockDir = ".chay/locks";

export async function dispatch(argv) {
  const result = await dispatchWorker(argv);
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 2;
}

export async function dispatchWorker(argv) {
  const args = parseArgs(argv);
  const worker = args.worker || args._?.[0] || "codex";
  const workFile = args.work || `memory/${worker}_work_note.json`;
  if (!exists(workFile)) throw new Error(`work note not found: ${workFile}`);

  const policy = loadPolicy(args.policy);
  const work = readJson(workFile);
  const agent = resolveAgent(args, worker, work);
  const maxRetries = nonNegativeInt(args["max-retries"] ?? policy.maxDispatchRetries ?? 3);
  const resultFile = args.out || `memory/${worker}_result_note.json`;
  const diffFile = args.diff || ".chay/tmp/current.diff";
  const logFile = args.log || `.chay/tmp/${worker}-dispatch.log`;
  const promptFile = args["prompt-file"] || `.chay/tmp/${worker}-dispatch-prompt.txt`;

  if (!isSupportedAgent(agent) && !args.command && !process.env.CHAY_DISPATCH_COMMAND) {
    throw new Error(`--agent must be one of: ${supportedAgentNames().join(", ")}`);
  }

  writeProgress(worker, "assigned", `Dispatching ${worker} via ${agent}`);
  const lock = acquireFileLocks(worker, work);
  if (!lock.ok) {
    writeProgress(worker, "blocked", `File lock conflict: ${lock.file}`);
    return {
      ok: false,
      worker,
      agent,
      work_note: workFile,
      lock,
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
      writeText(promptFile, prompt);

      if (attempt === 0) {
        writeProgress(worker, "reading", "Reading work note and compact context");
        writeProgress(worker, "planning", "Preparing bounded worker prompt");
      } else {
        writeProgress(worker, "planning", "Retrying invalid result note");
      }
      writeProgress(worker, "editing", "Worker process running");
      lastRun = await runAgent({ args, agent, prompt, promptFile, worker, logFile });
      if (!lastRun.ok) {
        writeProgress(worker, "blocked", lastRun.error || "Worker process failed");
        return {
          ok: false,
          worker,
          agent,
          work_note: workFile,
          result_note: resultFile,
          attempts,
          retry_limit: maxRetries,
          ...lastRun,
          next_action: "fix_dispatch_command_or_run_worker_manually"
        };
      }

      writeProgress(worker, "testing", "Worker finished; validating result note");
      maybeWriteResultFromStdout(resultFile, lastRun.stdout);
      validation = validateResultFile(resultFile, policy, work, worker);
      if (validation.ok) break;

      retryInstruction = buildRetryInstruction(validation.violations, policy);
      if (attempt === maxRetries) {
        writeProgress(worker, "blocked", "Result note stayed invalid after retry limit");
        return {
          ok: false,
          worker,
          agent,
          work_note: workFile,
          result_note: resultFile,
          attempts,
          retry_limit: maxRetries,
          validation,
          retry_instruction: retryInstruction,
          log: logFile,
          next_action: "escalate_invalid_worker_output_to_human"
        };
      }
    }

    writeProgress(worker, "patch_check", "Validating patch boundary");
    const patch = checkPatchBoundary({ diffFile, workFile, work, policy });
    if (!patch.ok) {
      writeProgress(worker, "blocked", "Patch boundary failed");
      return {
        ok: false,
        worker,
        agent,
        work_note: workFile,
        result_note: resultFile,
        attempts,
        retry_limit: maxRetries,
        validation,
        patch,
        log: logFile,
        next_action: "fix_patch_scope"
      };
    }

    writeProgress(worker, "done", "Worker result accepted");
    const ledger = updatePlanLedger({ worker, work, resultFile, patch });
    return {
      ok: true,
      worker,
      agent,
      work_note: workFile,
      result_note: resultFile,
      attempts,
      retry_limit: maxRetries,
      validation,
      patch,
      plan_ledger: ledger.file,
      log: logFile,
      next_action: "review_result_note_and_patch"
    };
  } finally {
    releaseFileLocks(lock);
  }
}

function resolveAgent(args, worker, work) {
  if (args.agent) return args.agent;
  if (work.worker?.agent) return work.worker.agent;
  return worker;
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
    `Emit progress with cr progress update --agent ${worker} at each phase: reading, planning, editing, testing, patch_check, done or blocked.`,
    `Before finishing, refresh the scoped diff with git diff --no-ext-diff -- . > ${diffFile}.`,
    `Write compact result_note JSON to ${resultFile}. Return only that result_note JSON.`,
    `The result_note must use the same work_id as ${workFile}, worker="${worker}", status completed|failed|blocked|partial, summary string, findings array.`,
    retryInstruction ? `Retry attempt ${attempt}. Previous output was invalid. ${retryInstruction}` : ""
  ].filter(Boolean).join("\n");
}

async function runAgent({ args, agent, prompt, promptFile, worker, logFile }) {
  const command = args.command || process.env.CHAY_DISPATCH_COMMAND;
  const spec = command ? { command, args: [], shell: true } : commandForAgent(agent, { prompt, promptFile, worker });
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
      cwd: process.cwd(),
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

function checkPatchBoundary({ diffFile, workFile, work, policy }) {
  const refreshed = refreshDiff(diffFile, work);
  if (!refreshed.ok) return refreshed;
  if (!exists(diffFile)) return { ok: false, error: "diff_not_found", diff: diffFile };

  const diffText = readText(diffFile);
  const analysis = analyzeDiff(diffText);
  const result = validateDiff(analysis, work, policy, diffText);
  return {
    ok: result.ok,
    diff: diffFile,
    work: workFile,
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

function refreshDiff(diffFile, work) {
  const allowed = Array.isArray(work.allowed_files) && work.allowed_files.length > 0 ? work.allowed_files : ["."];
  const result = spawnSync("git", ["diff", "--no-ext-diff", "--", ...allowed], { encoding: "utf8" });
  if (result.status === 0) {
    writeText(diffFile, result.stdout);
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
