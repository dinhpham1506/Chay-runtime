import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { copyDir, writeText } from "../utils/fs.js";
import { parseArgs } from "../utils/args.js";
import { normalizeAgentName } from "../core/agents.js";

const agentTargets = ["claude", "codex", "antigravity"];
const ideRuleTargets = ["ide-rules", "rules", "skill", "cursor", "github-copilot", "kiro", "windsurf", "manual"];
const targets = [...agentTargets, ...ideRuleTargets];
const chatTargets = ["codex", "claude", "cursor", "github-copilot", "kiro", "windsurf", "manual"];

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

export function installRules(argv = [], root = process.cwd()) {
  const args = parseArgs(argv);
  const project = installIdeRulePack(root);
  const codexSkill = args["codex-skill"] || args.codex || args.global
    ? installCodexSkill(args)
    : null;
  return {
    installed: project.installed,
    codex_skill: codexSkill,
    next_actions: [
      ...(codexSkill ? ["Restart Codex or refresh the Skills list, then select/use chay-runtime."] : ["Run cr rules install --codex-skill if you want chay-runtime to appear in Codex Skills."]),
      "Run cr go \"Task\" to refresh feature contracts before coding."
    ]
  };
}

export function installChatbot(argv = [], root = process.cwd()) {
  const args = parseArgs(argv);
  const action = args._?.[0] || "install";
  if (!["install", "add", "setup"].includes(action)) {
    throw new Error("Usage: cr chat install [--target codex|cursor|github-copilot|kiro|windsurf|manual] [--codex-home ~/.codex]");
  }

  const target = normalizeChatTarget(args.target || args.targets || args.chatbot || args._?.[1] || "codex");
  if (!chatTargets.includes(target)) {
    throw new Error(`--target must be one of: ${chatTargets.join(", ")}`);
  }
  const project = installIdeRulePack(root);
  const claude = target === "claude"
    ? installClaudeChatbot(root, configuredWorkers(args))
    : null;
  const codexSkill = target === "codex" || args["codex-skill"] || args.codex || args.global
    ? installCodexSkill(args)
    : null;

  return {
    mode: "direct_chatbot_install",
    target,
    installed: [...project.installed, ...(claude?.installed || [])],
    codex_skill: codexSkill,
    claude,
    usage_options: [
      {
        name: "CLI commands",
        command: "cr go \"Describe the feature\"",
        rule: "Run commands when you want explicit control from the terminal."
      },
      {
        name: "Direct chatbot",
        command: target === "codex" ? "Select/use the chay-runtime Codex Skill, then type the task naturally." : "Use the installed IDE project rules, then type the task naturally in the IDE AI.",
        rule: "The chatbot reads Chay Runtime rules and handoff files so you do not paste the long read-order prompt every session."
      }
    ],
    next_actions: [
      ...(codexSkill ? ["Restart Codex or refresh the Skills list, then select/use chay-runtime."] : ["Open the configured IDE/chatbot in this project."]),
      "Run cr go \"Task\" when you need to refresh the feature contract before coding.",
      "In the chatbot, type the task normally; the installed rules tell it to read chay-memory/ai_handoff.json and feature contracts first."
    ]
  };
}

function installClaudeChatbot(root, workers) {
  const installed = installIntegrationFiles("claude", root);
  configureClaudeAgents(root, workers);
  return {
    installed: [installed],
    workers,
    rule: "Claude Code agents were installed; use chay-main or the generated worker agent in Claude Code."
  };
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

export function installCodexSkill(args = {}) {
  const targetRoot = path.resolve(args["codex-home"] || process.env.CODEX_HOME || path.join(process.env.HOME || "", ".codex"));
  if (!targetRoot || targetRoot === path.resolve(".")) {
    throw new Error("Cannot resolve Codex home. Set CODEX_HOME or pass --codex-home /path/to/codex-home.");
  }
  const pkgRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const src = path.join(pkgRoot, "templates", "codex-skill", "chay-runtime");
  const dest = path.join(targetRoot, "skills", "chay-runtime");
  copyDir(src, dest);
  return {
    installed: true,
    path: dest,
    skill: "chay-runtime",
    list_hint: "It should appear in Codex Skills after Codex refresh/restart."
  };
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

function normalizeChatTarget(value) {
  const raw = String(value || "").trim().toLowerCase();
  const aliases = {
    github: "github-copilot",
    githubcopilot: "github-copilot",
    "github copilot": "github-copilot",
    copilot: "github-copilot"
  };
  return aliases[raw] || aliases[normalizeAgentName(raw)] || normalizeAgentName(raw);
}
