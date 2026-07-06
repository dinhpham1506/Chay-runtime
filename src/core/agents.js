export const agentAliases = {
  anti: "antigravity"
};

export function normalizeAgentName(agent) {
  const value = String(agent || "").trim().toLowerCase();
  return agentAliases[value] || value;
}

export function normalizeAgentList(agents) {
  return agents.map(normalizeAgentName);
}
