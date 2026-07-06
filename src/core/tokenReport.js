import fs from "node:fs";
import path from "node:path";
import { estimateTokens } from "../utils/tokens.js";
import { exists, readJson, readText } from "../utils/fs.js";
import { defaultWorker, resultNotePath, workNotePath } from "./host.js";

export function buildTokenReport(policy, options = {}) {
  const worker = options.worker || defaultWorker();
  const context = optionalJson("memory/context_package.json") || {};
  const selected = Array.isArray(context.selected_files) ? context.selected_files : [];
  const notes = {
    task_note: fileTokens("memory/task_note.json"),
    context_package: fileTokens("memory/context_package.json"),
    work_note: fileTokens(options.workFile || workNotePath(worker)),
    result_note: fileTokens(options.resultFile || resultNotePath(worker))
  };
  const selectedFiles = selected.map((file) => fileTokens(file.path)).filter((item) => item.exists);
  const selectedFileTokens = sum(selectedFiles.map((file) => file.tokens));
  const fullRepoTokens = estimateFullRepoTokens();
  const chayTokens = sum(Object.values(notes).map((note) => note.tokens)) + selectedFileTokens;

  return {
    ok: budgetViolations(notes, policy).length === 0,
    worker,
    budgets: {
      maxNoteTokens: policy.maxNoteTokens,
      maxResultTokens: policy.maxResultTokens
    },
    notes,
    selected_files: {
      count: selectedFiles.length,
      tokens: selectedFileTokens,
      files: selectedFiles.map((file) => ({ path: file.path, tokens: file.tokens }))
    },
    estimates: {
      chay_context_tokens: chayTokens,
      full_repo_tokens: fullRepoTokens,
      saved_tokens: Math.max(0, fullRepoTokens - chayTokens),
      savings_percent: fullRepoTokens > 0 ? Math.round((1 - chayTokens / fullRepoTokens) * 1000) / 10 : 0
    },
    violations: budgetViolations(notes, policy)
  };
}

function fileTokens(file) {
  if (!exists(file)) return { path: file, exists: false, tokens: 0, chars: 0 };
  const text = readText(file);
  return { path: file, exists: true, tokens: estimateTokens(text), chars: text.length };
}

function estimateFullRepoTokens() {
  const index = optionalJson(".chay-index/project_map.json");
  if (index?.files?.length) {
    return sum(index.files.map((file) => Number(file.lines || 0) * 12));
  }
  return sum(walkFiles(".").map((file) => fileTokens(file).tokens));
}

function budgetViolations(notes, policy) {
  const violations = [];
  for (const key of ["task_note", "context_package", "work_note"]) {
    if (notes[key].tokens > policy.maxNoteTokens) violations.push({ type: "note_budget_exceeded", file: notes[key].path, tokens: notes[key].tokens, max: policy.maxNoteTokens });
  }
  if (notes.result_note.tokens > policy.maxResultTokens) {
    violations.push({ type: "result_budget_exceeded", file: notes.result_note.path, tokens: notes.result_note.tokens, max: policy.maxResultTokens });
  }
  return violations;
}

function walkFiles(dir) {
  const skip = new Set([".git", "node_modules", ".chay", ".chay-index", "memory", "audit", "obj", "bin", "dist", "build", ".next"]);
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (skip.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkFiles(full));
    else out.push(full);
  }
  return out;
}

function optionalJson(file) {
  try {
    return exists(file) ? readJson(file) : null;
  } catch {
    return null;
  }
}

function sum(values) {
  return values.reduce((total, value) => total + Number(value || 0), 0);
}
