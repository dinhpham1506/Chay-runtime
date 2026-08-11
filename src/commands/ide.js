import fs from "node:fs";
import { parseArgs } from "../utils/args.js";
import { writeJson, writeText, exists } from "../utils/fs.js";
import { normalizeAgentName } from "../core/agents.js";
import { runtimeStatus, supportedRuntimeAgents } from "../core/runtimeStatus.js";

const ideTargetAliases = {
  anti: "antigravity",
  github: "github-copilot",
  "github-copilot": "github-copilot",
  githubcopilot: "github-copilot",
  "github copilot": "github-copilot",
  copilot: "github-copilot"
};

const knownIdeTargets = ["codex", "claude", "antigravity", "github-copilot", "cursor", "kiro", "windsurf", "manual"];

export async function ide(argv = []) {
  const args = parseArgs(argv);
  const action = args._?.[0] || "check";
  if (action === "check" || action === "status") return checkIde(args);
  if (action === "config" || action === "configure" || action === "use") return configIde(args);
  return configIde({ ...args, target: args.target || args.targets || args._?.join(",") });
}

function checkIde(args) {
  const configured = readIdeConfig();
  const cliAgents = supportedRuntimeAgents().map((agent) => runtimeStatus(agent, { auth: Boolean(args.auth) }));
  console.log(JSON.stringify({
    ok: true,
    mode: "external_ide_ai",
    message: "Chạy Runtime configures IDE AI with contracts and handoff files; it does not split work into subagents.",
    configured,
    available_cli_agents: cliAgents,
    instruction_file: ".chay/ide/CHAY_IDE_INSTRUCTIONS.md",
    handoff_file: "memory/ai_handoff.json",
    next_action: configured.targets.length > 0 ? "run cr go, then ask the IDE AI to read memory/ai_handoff.json" : "run cr config manual"
  }, null, 2));
}

function configIde(args) {
  const targets = targetList(args.target || args.targets || args._?.slice(1).join(",") || "manual");
  const invalid = targets.filter((target) => !knownIdeTargets.includes(target));
  if (invalid.length > 0) throw new Error(`Unknown IDE target: ${invalid.join(", ")}. Supported: ${knownIdeTargets.join(", ")}`);

  const instructionFile = ".chay/ide/CHAY_IDE_INSTRUCTIONS.md";
  const configFile = "memory/ide_config.json";
  writeText(instructionFile, instructionMarkdown(targets));
  writeJson(configFile, {
    configured_at: new Date().toISOString(),
    mode: "external_ide_ai",
    targets,
    instruction_file: instructionFile,
    handoff_file: "memory/ai_handoff.json",
    rule: "IDE AI works outside Chạy Runtime. Chạy Runtime owns contracts, handoff, and verification."
  });

  console.log(JSON.stringify({
    ok: true,
    mode: "external_ide_ai",
    targets,
    config: configFile,
    instruction_file: instructionFile,
    next_prompt: "Read memory/ai_handoff.json and .chay/ide/CHAY_IDE_INSTRUCTIONS.md, then continue the task without editing outside allowed files.",
    next_commands: ["cr go \"Describe the feature\"", "cr verify", "cr handoff"]
  }, null, 2));
}

function readIdeConfig() {
  const configFile = "memory/ide_config.json";
  if (!exists(configFile)) return { configured: false, targets: [] };
  try {
    return { configured: true, ...JSON.parse(fs.readFileSync(configFile, "utf8")) };
  } catch {
    return { configured: false, targets: [], error: "invalid_ide_config_json" };
  }
}

function targetList(value) {
  return [...new Set(String(value || "manual")
    .split(",")
    .map((item) => normalizeIdeTarget(item))
    .filter(Boolean))];
}

function normalizeIdeTarget(value) {
  const raw = String(value || "").trim().toLowerCase();
  const normalized = normalizeAgentName(raw);
  return ideTargetAliases[normalized] || ideTargetAliases[raw] || normalized;
}

function instructionMarkdown(targets) {
  return [
    "# Chay Runtime IDE AI Instructions",
    "",
    "Mode: external IDE AI. Do not split this work into Chay subagents.",
    "",
    "Read order:",
    "1. `memory/ai_handoff.json`",
    "2. `memory/feature_graph.json`",
    "3. `memory/task_note.json`",
    "4. `memory/context_package.json`",
    "5. The selected/allowed files only",
    "",
    "Rules:",
    "- Follow the `user_flow` and `sequence_diagram` in the feature graph.",
    "- Treat human-confirmed docs/specs as source of truth; do not rewrite them unless explicitly approved.",
    "- Edit only allowed files / graph code targets.",
    "- Do not read or change secrets, `.env`, credentials, audit markdown, raw logs, or full prompts.",
    "- Preserve validation, error handling, security checks, design patterns, accessibility, and tests.",
    "- Do not delete existing behavior unless the graph/spec explicitly requires it.",
    "- After editing, refresh `.chay/tmp/current.diff` and update the result note JSON.",
    "",
    "Verification:",
    "- Run `cr verify` after code changes.",
    "- Run `cr handoff` before starting a new IDE AI session.",
    "",
    `Configured targets: ${targets.join(", ")}`
  ].join("\n") + "\n";
}
