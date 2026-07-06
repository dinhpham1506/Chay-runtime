import fs from "node:fs";
import path from "node:path";
import { copyDir } from "../utils/fs.js";
import { parseArgs } from "../utils/args.js";

const agentTargets = ["claude", "codex", "antigravity"];
const targets = [...agentTargets];

export async function installIntegration(argv) {
  const args = parseArgs(argv);
  if (!args.target) throw new Error("--target is required: claude | codex | antigravity");
  if (!targets.includes(args.target)) {
    throw new Error("--target must be claude, codex, or antigravity");
  }

  const installed = installIntegrationFiles(args.target, process.cwd());
  const workers = configuredWorkers(args);
  if (args.target === "claude") configureClaudeAgents(process.cwd(), workers);

  console.log(JSON.stringify({
    ok: true,
    target: args.target,
    installed,
    workers: args.target === "claude" ? workers : undefined,
    message: `Installed ${args.target} integration templates into current project`
  }, null, 2));
}

export function installIntegrationFiles(target, root = process.cwd()) {
  if (!targets.includes(target)) throw new Error(`Unknown integration target: ${target}`);
  const pkgRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
  const src = path.join(pkgRoot, "templates", target);

  copyDir(src, root);
  return target;
}

export function installConfiguredIntegrations(answers, root = process.cwd()) {
  const installed = answers.agents.map((agent) => installIntegrationFiles(agent, root));
  if (answers.agents.includes("claude")) {
    configureClaudeAgents(root, answers.workers || []);
  }
  return installed;
}

export function integrationTargets() {
  return [...targets];
}

export function agentIntegrationTargets() {
  return [...agentTargets];
}

function configureClaudeAgents(root, workers) {
  const agentsDir = path.join(root, ".claude", "agents");
  const templateFile = path.join(agentsDir, "chay-codex-worker.md");
  if (!fs.existsSync(templateFile)) return;

  const template = fs.readFileSync(templateFile, "utf8");
  for (const worker of workers) {
    const file = path.join(agentsDir, `chay-${worker}-worker.md`);
    const content = template
      .replace(/^name: chay-codex-worker$/m, `name: chay-${worker}-worker`)
      .replaceAll("codex", worker);
    fs.writeFileSync(file, content, "utf8");
  }

  configureClaudeMain(root, workers);
  configureClaudeSettings(root, workers[0]);
}

function configureClaudeMain(root, workers) {
  const file = path.join(root, ".claude", "agents", "chay-main.md");
  if (!fs.existsSync(file)) return;
  const workerAgents = workers.map((worker) => `chay-${worker}-worker`);
  const tools = ["chay-reviewer", ...workerAgents].join(",");
  const content = fs.readFileSync(file, "utf8").replace(/^tools: Agent\([^)]+\), Read, Write, Bash$/m, `tools: Agent(${tools}), Read, Write, Bash`);
  fs.writeFileSync(file, content, "utf8");
}

function configureClaudeSettings(root, worker) {
  if (!worker) return;
  const file = path.join(root, ".claude", "settings.json");
  if (!fs.existsSync(file)) return;
  const content = fs.readFileSync(file, "utf8").replaceAll("memory/codex_work_note.json", `memory/${worker}_work_note.json`);
  fs.writeFileSync(file, content, "utf8");
}

function configuredWorkers(args) {
  const explicit = list(args.workers);
  if (explicit.length > 0) return explicit;
  const hostFile = "memory/host_config.json";
  if (fs.existsSync(hostFile)) {
    try {
      const host = JSON.parse(fs.readFileSync(hostFile, "utf8"));
      const workers = Array.isArray(host.workers) ? host.workers.map((worker) => worker.agent).filter(Boolean) : [];
      if (workers.length > 0) return workers;
    } catch {
      // Fall through to the default template worker.
    }
  }
  return ["codex"];
}

function list(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}
