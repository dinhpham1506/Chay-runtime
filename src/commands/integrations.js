import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { copyDir, writeText } from "../utils/fs.js";
import { parseArgs } from "../utils/args.js";
import { normalizeAgentName } from "../core/agents.js";

const agentTargets = ["claude", "codex", "antigravity"];
const ideRuleTargets = ["ide-rules", "rules", "skill", "cursor", "github-copilot", "kiro", "windsurf", "manual"];
const targets = [...agentTargets, ...ideRuleTargets];

export async function installIntegration(argv) {
  const args = parseArgs(argv);
  if (!args.target) throw new Error("--target is required: claude | codex | antigravity | cursor | github-copilot | kiro | windsurf | skill");
  const target = normalizeAgentName(args.target);
  if (!targets.includes(target)) {
    throw new Error("--target must be claude, codex, antigravity, cursor, github-copilot, kiro, windsurf, manual, or skill");
  }

  const installed = ideRuleTargets.includes(target)
    ? installIdeRulePack(process.cwd()).installed
    : installIntegrationFiles(target, process.cwd());
  const workers = configuredWorkers(args);
  if (target === "claude") configureClaudeAgents(process.cwd(), workers);

  console.log(JSON.stringify({
    ok: true,
    target,
    installed,
    workers: target === "claude" ? workers : undefined,
    message: `Installed ${target} integration templates into current project`
  }, null, 2));
}

export function installIntegrationFiles(target, root = process.cwd()) {
  const normalized = normalizeAgentName(target);
  if (!targets.includes(normalized)) throw new Error(`Unknown integration target: ${target}`);
  if (ideRuleTargets.includes(normalized)) return installIdeRulePack(root).installed;
  const pkgRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const src = path.join(pkgRoot, "templates", normalized);

  copyDir(src, root);
  return normalized;
}

export function installIdeRulePack(root = process.cwd()) {
  const pkgRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const src = path.join(pkgRoot, "templates", "ide-rules");
  copyDir(src, root);
  const installed = [
    "chay-memory/rules/chay-runtime.md",
    ".cursor/rules/chay-runtime.mdc",
    ".github/instructions/chay-runtime.instructions.md",
    ".kiro/steering/chay-runtime.md",
    ".windsurf/rules/chay-runtime.md",
    ".codex/rules/chay-runtime.md"
  ];
  writeText(path.join(root, "chay-memory/rules/README.md"), [
    "# Chay Runtime Rules",
    "",
    "This folder contains IDE-facing project rules installed by Chay Runtime.",
    "",
    "Source of truth:",
    "- chay-runtime.md",
    "",
    "Reinstall with:",
    "- cr rules install",
    "- cr config codex,cursor,github-copilot,kiro",
    ""
  ].join("\n"));
  return { installed };
}

export function installConfiguredIntegrations(answers, root = process.cwd()) {
  const installed = answers.agents.map((agent) => installIntegrationFiles(agent, root));
  installIdeRulePack(root);
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
  const content = fs.readFileSync(file, "utf8").replaceAll("chay-memory/codex_work_note.json", `chay-memory/${worker}_work_note.json`);
  fs.writeFileSync(file, content, "utf8");
}

function configuredWorkers(args) {
  const explicit = list(args.workers);
  if (explicit.length > 0) return explicit;
  const hostFile = "chay-memory/host_config.json";
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
