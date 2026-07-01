import { parseArgs } from "../utils/args.js";
import { readJson } from "../utils/fs.js";
import { loadPolicy } from "../core/policy.js";
import { validateTaskNote, validateResultNote, validateWorkNote } from "../core/validators.js";

export async function checkNote(argv) {
  const args = parseArgs(argv);
  if (!args.file) throw new Error("--file is required");

  const policy = loadPolicy(args.policy);
  const note = readJson(args.file);
  const kind = args.kind || inferKind(args.file);
  const result = validateByKind(kind, note, policy);

  console.log(JSON.stringify({
    ok: result.ok,
    kind,
    file: args.file,
    ...result,
    next_action: result.ok ? "continue" : "compress_or_fix_note"
  }, null, 2));

  if (!result.ok) process.exitCode = 2;
}

export async function validateOutput(argv) {
  const args = parseArgs(argv);
  if (!args.file) throw new Error("--file is required");

  const policy = loadPolicy(args.policy);
  const note = readJson(args.file);
  const result = validateResultNote(note, policy);

  console.log(JSON.stringify({
    ok: result.ok,
    file: args.file,
    ...result,
    next_action: result.ok ? "accept_result_note" : "retry_worker_with_contract",
    retry_instruction: result.ok ? undefined : buildRetryInstruction(result.violations, policy)
  }, null, 2));

  if (!result.ok) process.exitCode = 2;
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

function inferKind(file) {
  if (String(file).includes("work")) return "work";
  return String(file).includes("result") ? "result" : "task";
}

function validateByKind(kind, note, policy) {
  if (kind === "result") return validateResultNote(note, policy);
  if (kind === "work") return validateWorkNote(note, policy);
  if (kind === "task") return validateTaskNote(note, policy);
  throw new Error("--kind must be task, work, or result");
}
