import { exists, readJson } from "../utils/fs.js";

export function loadHostConfig(file = "memory/host_config.json") {
  return exists(file) ? readJson(file) : null;
}

export function defaultWorker(fallback = "codex") {
  const host = loadHostConfig();
  return host?.workers?.[0]?.agent || fallback;
}

export function workerNames() {
  const host = loadHostConfig();
  return Array.isArray(host?.workers) ? host.workers.map((worker) => worker.agent).filter(Boolean) : [];
}

export function workNotePath(worker = defaultWorker()) {
  return `memory/${worker}_work_note.json`;
}

export function resultNotePath(worker = defaultWorker()) {
  return `memory/${worker}_result_note.json`;
}

export function resolveWorker(args = {}, fallback = "codex") {
  return args.worker || args._?.[0] || defaultWorker(fallback);
}
