import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseArgs } from "../utils/args.js";
import { exists, readJson, readText, writeJson } from "../utils/fs.js";
import { writeProgressNote } from "../utils/progress.js";
import { analyzeDiff, validateDiff } from "../core/diff.js";
import { loadPolicy } from "../core/policy.js";
import { buildEvalReport } from "../core/evalReport.js";
import { buildTokenReport } from "../core/tokenReport.js";
import { validateResultNote, validateWorkNote } from "../core/validators.js";
import { defaultWorker, resultNotePath, workNotePath } from "../core/host.js";
import { progressSteps } from "../utils/progress.js";
import { scanRepo } from "./repoScan.js";
import { planContext } from "./contextPlan.js";
import { makeWorkpack } from "./workpack.js";

const sseClients = new Set();
const pkgRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const cliPath = path.join(pkgRoot, "bin/cr.js");
const consoleHtmlPath = path.join(pkgRoot, "site", "console.html");

export async function serveUi(argv) {
  const args = parseArgs(argv);
  const host = args.host || "127.0.0.1";
  const port = Number(args.port || 7770);
  const server = http.createServer(async (req, res) => {
    try { await route(req, res); } catch (error) { sendJson(res, 500, { ok: false, error: error.message }); }
  });
  server.listen(port, host, () => {
    startWatcher();
    console.log(JSON.stringify({ ok: true, app: "chay-ui", url: `http://${host}:${port}`, api: ["/api/state", "/api/stream", "/api/action", "/api/progress", "/api/chat"] }, null, 2));
  });
}

async function route(req, res) {
  const url = new URL(req.url, "http://localhost");
  if (req.method === "GET" && url.pathname === "/") return sendHtml(res, readConsoleHtml());
  if (req.method === "GET" && url.pathname === "/api/state") return sendJson(res, 200, buildState());
  if (req.method === "GET" && url.pathname === "/api/stream") return openStream(req, res);
  if (req.method === "POST" && url.pathname === "/api/progress") return saveProgress(res, await readBody(req));
  if (req.method === "POST" && url.pathname === "/api/chat") return saveChat(res, await readBody(req));
  if (req.method === "POST" && url.pathname === "/api/action") return runAction(res, await readBody(req));
  sendJson(res, 404, { ok: false, error: "not_found" });
}

function openStream(req, res) {
  res.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache, no-transform",
    connection: "keep-alive",
    "x-accel-buffering": "no"
  });
  res.write("retry: 2000\n\n");
  sendEvent(res, buildState());
  sseClients.add(res);
  const heartbeat = setInterval(() => { try { res.write(": ping\n\n"); } catch { sseClients.delete(res); } }, 25000);
  req.on("close", () => { clearInterval(heartbeat); sseClients.delete(res); });
}

function sendEvent(res, data) {
  try { res.write(`data: ${JSON.stringify(data)}\n\n`); } catch { sseClients.delete(res); }
}

function broadcastState() {
  if (sseClients.size === 0) return;
  const state = buildState();
  for (const client of sseClients) sendEvent(client, state);
}

let watcherTimer = null;
let pollTimer = null;
let lastSignature = "";
function startWatcher() {
  fs.mkdirSync("memory", { recursive: true });
  fs.mkdirSync(".chay/tmp", { recursive: true });
  const targets = ["memory", ".chay/tmp"].filter((dir) => fs.existsSync(dir));
  const schedule = () => {
    if (watcherTimer) clearTimeout(watcherTimer);
    watcherTimer = setTimeout(broadcastState, 150);
  };
  for (const dir of targets) {
    try { fs.watch(dir, { recursive: true }, schedule); } catch { /* recursive watch unsupported on this platform */ }
  }
  if (!pollTimer) {
    lastSignature = stateSignature(targets);
    pollTimer = setInterval(() => {
      const signature = stateSignature(targets);
      if (signature === lastSignature) return;
      lastSignature = signature;
      broadcastState();
    }, 700);
  }
}

let runningWorker = null;

function spawnWorker(worker, options = {}) {
  if (runningWorker) return { ok: false, error: "worker_busy", pid: runningWorker.pid };
  const engine = options.agent || process.env.CHAY_WORKER_ENGINE || worker;
  const maxRetries = options.maxRetries ?? 3;
  const workFile = workNotePath(worker);
  if (!exists(workFile)) return { ok: false, error: "work_note_not_found", file: workFile };
  const cmdArgs = [
    cliPath,
    "dispatch",
    worker,
    "--agent",
    engine,
    "--max-retries",
    String(maxRetries)
  ];
  if (options.isolate) cmdArgs.push("--isolate");
  if (typeof options.testCommand === "string" && options.testCommand.trim()) {
    cmdArgs.push("--test-command", options.testCommand.trim());
  }
  fs.mkdirSync(".chay/tmp", { recursive: true });
  const out = fs.openSync(".chay/tmp/ui-dispatch.log", "a");
  let child;
  try {
    child = spawn(process.execPath, cmdArgs, { cwd: process.cwd(), detached: true, stdio: ["ignore", out, out] });
  } catch (error) {
    return { ok: false, error: "spawn_failed", detail: error.message };
  }
  runningWorker = { pid: child.pid, worker, engine, started_at: new Date().toISOString() };
  child.on("exit", () => { runningWorker = null; broadcastState(); });
  child.on("error", () => { runningWorker = null; broadcastState(); });
  child.unref();
  broadcastState();
  return { ok: true, worker, engine, pid: child.pid, log: ".chay/tmp/ui-dispatch.log" };
}

async function runAction(res, body) {
  const data = JSON.parse(body || "{}");
  const worker = data.worker || defaultWorker();
  if (data.action === "create_task") return createUiTask(res, data, worker);
  if (data.action === "run_worker") { const dispatch = spawnWorker(worker, data); return sendJson(res, dispatch.ok ? 200 : 409, dispatch); }
  if (data.action === "validate_output") return validateUiOutput(res, data.file || resultNotePath(worker));
  if (data.action === "patch_check") return patchUiCheck(res, data.diff || ".chay/tmp/current.diff", data.work || workNotePath(worker));
  if (data.action === "token_report") return sendJson(res, 200, buildTokenReport(loadPolicy(), { worker }));
  if (data.action === "eval_report") return sendJson(res, 200, buildEvalReport(loadPolicy(), { worker }));
  if (data.action === "experience_snapshot") return experienceUiSnapshot(res);
  sendJson(res, 400, { ok: false, error: "unknown_action" });
}

async function createUiTask(res, data, worker) {
  const task = data.task || "";
  if (!task.trim()) return sendJson(res, 400, { ok: false, error: "task_required" });
  await scanRepo(["--root", ".", "--out", ".chay-index/project_map.json"]);
  await planContext(["--task", task, "--index", ".chay-index/project_map.json", "--out", "memory/context_package.json", "--max-notes", "2"]);
  const files = selectedFiles("memory/context_package.json").join(",");
  await makeWorkpack(["--worker", worker, "--goal", task, "--out", `memory/${worker}_work_note.json`, "--compact", ...(files ? ["--allowed-files", files] : [])]);
  writeProgress(worker, "assigned", "Task assigned from Chạy Runtime UI", task);
  const dispatch = data.run === false ? { ok: true, skipped: true } : spawnWorker(worker, data);
  sendJson(res, 200, { ok: true, task, worker, work_note: `memory/${worker}_work_note.json`, dispatch });
  broadcastState();
}

function validateUiOutput(res, file) {
  if (!exists(file)) return sendJson(res, 404, { ok: false, error: "result_note_not_found", file });
  const policy = loadPolicy();
  const result = validateResultNote(readJson(file), policy);
  sendJson(res, result.ok ? 200 : 422, {
    ok: result.ok,
    file,
    ...result,
    next_action: result.ok ? "accept_result_note" : "retry_worker_with_contract",
    retry_instruction: result.ok ? undefined : retryInstruction(result.violations, policy)
  });
}

function patchUiCheck(res, diffFile, workFile) {
  if (!exists(workFile)) return sendJson(res, 404, { ok: false, error: "work_note_not_found", file: workFile });
  const work = readJson(workFile);
  const refreshed = refreshDiff(diffFile, work);
  if (!refreshed.ok) return sendJson(res, 500, refreshed);
  if (!exists(diffFile)) return sendJson(res, 404, { ok: false, error: "diff_not_found", file: diffFile });
  const diffText = readText(diffFile);
  const analysis = analyzeDiff(diffText);
  const result = validateDiff(analysis, work, loadPolicy(), diffText);
  sendJson(res, result.ok ? 200 : 422, { ok: result.ok, diff: diffFile, refreshed: true, analysis, violations: result.violations, next_action: result.ok ? "allow_patch_review" : "fix_patch_scope" });
}

function experienceUiSnapshot(res) {
  const result = spawnSync(process.execPath, [cliPath, "experience", "snapshot", "--out", "memory/experience_spectrum.json"], { encoding: "utf8" });
  if (result.status !== 0) return sendJson(res, 500, { ok: false, error: "experience_snapshot_failed", stderr: compact(result.stderr) });
  try {
    return sendJson(res, 200, JSON.parse(result.stdout));
  } catch {
    return sendJson(res, 200, { ok: true, stdout: result.stdout.trim() });
  }
}

function refreshDiff(diffFile, work) {
  const pathspec = [".", ":(exclude).chay", ":(exclude)memory", ":(exclude)audit"];
  const result = spawnSync("git", ["diff", "--no-ext-diff", "--", ...pathspec], { encoding: "utf8" });
  if (result.status !== 0) {
    return { ok: false, error: "git_diff_failed", stderr: compact(result.stderr) };
  }
  fs.mkdirSync(path.dirname(diffFile), { recursive: true });
  fs.writeFileSync(diffFile, result.stdout, "utf8");
  return { ok: true };
}

function buildState() {
  const host = optionalJson("memory/host_config.json") || {};
  const context = optionalJson("memory/context_package.json") || {};
  const notes = readMemoryNotes();
  const progress = notes.filter((note) => note.kind === "progress" && !Array.isArray(note.data)).map((note) => note.data);
  const progressHistory = notes.filter((note) => note.kind === "progress_history" && Array.isArray(note.data)).flatMap((note) => note.data).slice(-80);
  const policy = loadPolicy();
  const worker = defaultWorker();
  return {
    generated_at: new Date().toISOString(),
    runner: runningWorker,
    default_worker: worker,
    progress_steps: progressSteps,
    capabilities: {
      realtime: "sse_plus_file_watch",
      actions: ["create_task", "run_worker", "validate_output", "patch_check", "token_report", "eval_report", "experience_snapshot"],
      worker_options: ["agent", "maxRetries", "isolate", "testCommand"]
    },
    agents: agentsFrom(host, notes, progress),
    tasks: taskList(notes, context),
    selected_files: context.selected_files || [],
    progress_history: progressHistory,
    plan_ledger: optionalJson("memory/plan_ledger.json"),
    experience: optionalJson("memory/experience_spectrum.json"),
    chat: readChat(),
    checks: buildChecks(notes, worker),
    token_report: buildTokenReport(policy, { worker }),
    eval_report: buildEvalReport(policy, { worker })
  };
}

function agentsFrom(host, notes, progress) {
  const main = host.main ? [{ ...host.main, role: "main" }] : [];
  const workers = (host.workers || []).map((worker) => ({ ...worker, role: "worker" }));
  return [...main, ...workers].map((agent) => {
    const latest = progress.find((item) => item.agent === agent.agent);
    return { agent: agent.agent, role: agent.role, llm: agent.llm || "user-selected", skills: agent.skills || [], step: latest?.step || stepFor(agent.agent, notes), message: latest?.message || "", updated_at: latest?.updated_at || null };
  });
}

function taskList(notes, context) {
  return notes.filter((note) => ["work", "result"].includes(note.kind)).map((note) => ({ id: note.data.work_id, agent: note.data.assigned_to || note.data.worker, status: note.data.status || "assigned", goal: compact(note.data.goal || context.task || ""), summary: compact(note.data.summary || ""), files: note.data.changed_files || note.data.allowed_files || [] }));
}

function buildChecks(notes, worker = defaultWorker()) {
  const work = optionalJson(workNotePath(worker));
  return { work_note: work ? validateWorkNote(work, loadPolicy()) : null, result_exists: exists(resultNotePath(worker)), diff_exists: exists(".chay/tmp/current.diff") };
}

function saveProgress(res, body) {
  const data = JSON.parse(body || "{}");
  const step = data.step || "editing";
  if (!progressSteps.includes(step)) return sendJson(res, 400, { ok: false, error: "invalid_step", allowed: progressSteps });
  const progress = writeProgress(data.agent || defaultWorker(), step, data.message || "", data.task || "");
  sendJson(res, 200, { ok: true, progress });
  broadcastState();
}

function saveChat(res, body) {
  const data = JSON.parse(body || "{}");
  if (!String(data.message || "").trim()) return sendJson(res, 400, { ok: false, error: "message_required" });
  const chat = readChat();
  const message = { id: `msg_${Date.now()}`, from: data.from || "human", to: data.to || "main", message: compact(data.message || ""), created_at: new Date().toISOString() };
  chat.push(message);
  writeJson("memory/chat/messages.json", chat.slice(-200));
  sendJson(res, 200, { ok: true, message });
  broadcastState();
}

function writeProgress(agent, step, message, task = "") {
  return writeProgressNote(agent, step, message, task);
}

function selectedFiles(file) {
  const context = optionalJson(file) || {};
  return Array.isArray(context.selected_files) ? context.selected_files.map((item) => item.path).filter(Boolean) : [];
}

function readMemoryNotes() {
  if (!fs.existsSync("memory")) return [];
  return fs.readdirSync("memory").filter((file) => file.endsWith(".json")).map((file) => ({ file, data: optionalJson(path.join("memory", file)) })).filter((note) => note.data).map((note) => ({ ...note, kind: kind(note.file) }));
}
function kind(file) { if (file.includes("progress_history")) return "progress_history"; if (file.includes("progress")) return "progress"; if (file.includes("result")) return "result"; if (file.includes("work")) return "work"; return "other"; }
function stepFor(agent, notes) { const result = notes.find((note) => note.kind === "result" && note.data.worker === agent); if (result) return result.data.status === "blocked" ? "blocked" : "done"; return notes.some((note) => note.kind === "work" && note.data.assigned_to === agent) ? "assigned" : "idle"; }
function readChat() { return exists("memory/chat/messages.json") ? readJson("memory/chat/messages.json") : []; }
function optionalJson(file) { try { return exists(file) ? readJson(file) : null; } catch { return null; } }
function sendJson(res, status, data) { res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }); res.end(JSON.stringify(data, null, 2)); }
function sendHtml(res, body) { res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" }); res.end(body); }
function readBody(req) { return new Promise((resolve, reject) => { let body = ""; req.on("data", (chunk) => { body += chunk; if (body.length > 65536) req.destroy(); }); req.on("end", () => resolve(body)); req.on("error", reject); }); }
function compact(value) { const text = String(value || "").replace(/\s+/g, " ").trim(); return text.length > 320 ? `${text.slice(0, 317)}...` : text; }
function retryInstruction(violations, policy) { return `Return result_note JSON only. Required: work_id, worker, status, summary, findings. Keep under ${policy.maxResultTokens} tokens. Fix: ${violations.map((item) => item.type).join(", ")}.`; }

function readConsoleHtml() {
  return readText(consoleHtmlPath);
}

function stateSignature(dirs) {
  return dirs.flatMap((dir) => listFiles(dir)).map((file) => {
    try {
      const stat = fs.statSync(file);
      return `${file}:${stat.size}:${Math.floor(stat.mtimeMs)}`;
    } catch {
      return `${file}:missing`;
    }
  }).join("|");
}

function listFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(file));
    else out.push(file);
  }
  return out.sort();
}
