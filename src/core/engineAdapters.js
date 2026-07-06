import { normalizeAgentName } from "./agents.js";

const adapters = {
  codex: ({ prompt }) => commandOverride("CHAY_CODEX_COMMAND") || { command: "codex", args: ["exec", prompt] },
  claude: ({ prompt, worker }) => commandOverride("CHAY_CLAUDE_COMMAND") || { command: "claude", args: ["-p", prompt, "--agent", claudeAgentName(worker)] },
  antigravity: ({ promptFile }) => commandOverride("CHAY_ANTIGRAVITY_COMMAND") || { command: "antigravity", args: ["run", "--prompt-file", promptFile] }
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
