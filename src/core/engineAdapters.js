const adapters = {
  codex: ({ prompt }) => ({ command: "codex", args: ["exec", prompt] }),
  claude: ({ prompt, worker }) => ({ command: "claude", args: ["-p", prompt, "--agent", claudeAgentName(worker)] }),
  antigravity: () => null
};

export function supportedAgentNames() {
  return Object.keys(adapters);
}

export function isSupportedAgent(agent) {
  return Boolean(adapters[agent]);
}

export function commandForAgent(agent, context) {
  return adapters[agent]?.(context) || null;
}

function claudeAgentName(worker) {
  return worker === "codex" ? "chay-codex-worker" : `chay-${worker}-worker`;
}
