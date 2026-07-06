import { exists, readJson } from "../utils/fs.js";
import { normalizeAgentName } from "./agents.js";

export function loadHostConfig(file = "memory/host_config.json") {
  return exists(file) ? readJson(file) : null;
}

export function defaultWorker(fallback = "codex") {
  const host = loadHostConfig();
  return normalizeAgentName(host?.workers?.[0]?.agent || fallback);
}

export function workerNames() {
  const host = loadHostConfig();
  return Array.isArray(host?.workers) ? host.workers.map((worker) => normalizeAgentName(worker.agent)).filter(Boolean) : [];
}

export function workNotePath(worker = defaultWorker()) {
  return `memory/${normalizeAgentName(worker)}_work_note.json`;
}

export function resultNotePath(worker = defaultWorker()) {
  return `memory/${normalizeAgentName(worker)}_result_note.json`;
}

export function resolveWorker(args = {}, fallback = "codex") {
  return normalizeAgentName(args.worker || args._?.[0] || defaultWorker(fallback));
}
