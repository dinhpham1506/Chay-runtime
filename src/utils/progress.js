import { exists, readJson, writeJson } from "./fs.js";

export const progressSteps = ["assigned", "reading", "planning", "editing", "validate_result", "testing", "patch_check", "done", "blocked"];

export function writeProgressNote(agent, step, message = "", task = "") {
  const progress = {
    agent,
    step,
    message: compact(message),
    task: compact(task),
    updated_at: new Date().toISOString()
  };
  writeJson(`memory/${agent}_progress.json`, progress);
  appendProgressHistory(agent, progress);
  return progress;
}

function appendProgressHistory(agent, progress) {
  const file = `memory/${agent}_progress_history.json`;
  const history = safeJson(file, []);
  const next = Array.isArray(history) ? history : [];
  next.push(progress);
  writeJson(file, next.slice(-200));
}

function safeJson(file, fallback) {
  try {
    return exists(file) ? readJson(file) : fallback;
  } catch {
    return fallback;
  }
}

function compact(value) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > 320 ? `${text.slice(0, 317)}...` : text;
}
