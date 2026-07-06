import { normalizeAgentName } from "./agents.js";

const adapters = {
  codex: ({ prompt, model }) => commandOverride("CHAY_CODEX_COMMAND") || { command: "codex", args: ["exec", ...modelArgs(model), prompt] },
  claude: ({ prompt, worker, model }) => commandOverride("CHAY_CLAUDE_COMMAND") || { command: "claude", args: ["-p", prompt, "--agent", claudeAgentName(worker), ...modelArgs(model)] },
  antigravity: () => commandOverride("CHAY_ANTIGRAVITY_COMMAND")
};

export function supportedAgentNames() {
  return Object.keys(adapters);
}

export function isSupportedAgent(agent) {
  return Boolean(adapters[normalizeAgentName(agent)]);
}

export function commandForAgent(agent, context) {
  return adapters[normalizeAgentName(agent)]?.(context) || null;
}

function claudeAgentName(worker) {
  return `chay-${worker}-worker`;
}

function commandOverride(name) {
  return process.env[name] ? { command: process.env[name], args: [], shell: true } : null;
}

function modelArgs(model) {
  const value = String(model || "").trim();
  return value && value !== "user-selected" ? ["--model", value] : [];
}
