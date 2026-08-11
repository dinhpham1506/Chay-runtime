import { spawnSync } from "node:child_process";
import { parseArgs } from "../utils/args.js";
import { normalizeAgentName, normalizeAgentList } from "../core/agents.js";
import { runtimeLoginHint, runtimeStatus, supportedRuntimeAgents } from "../core/runtimeStatus.js";

const loginCommands = {
  codex: ["codex", ["login"]],
  claude: ["claude", ["auth", "login"]]
};

export async function authAgents(argv) {
  const args = parseArgs(argv);
  const agents = selectedAgents(args);
  const result = ensureAgentAuth(agents, { login: Boolean(args.login || args.fix) });

  console.log(JSON.stringify({
    ok: result.ok,
    agents: result.agents,
    attempted: result.attempted,
    next_actions: result.next_actions
  }, null, 2));
}

export function ensureAgentAuth(agents, options = {}) {
  const before = agents.map((agent) => runtimeStatus(agent, { auth: true }));
  const attempted = options.login ? runLoginCommands(before) : [];
  const after = options.login ? agents.map((agent) => runtimeStatus(agent, { auth: true })) : before;

  return {
    ok: after.every((item) => item.ok || item.auth.status === "gui_only"),
    agents: after,
    attempted,
    next_actions: nextActions(after, options.login)
  };
}

export function selectedAgents(args) {
  const raw = args.agent || args.agents || args._?.join(",") || (args.all ? supportedRuntimeAgents().join(",") : "");
  const agents = normalizeAgentList(String(raw || "").split(",").map((item) => item.trim()).filter(Boolean));
  const selected = agents.length > 0 ? agents : supportedRuntimeAgents();
  const supported = supportedRuntimeAgents();
  for (const agent of selected) {
    if (!supported.includes(agent)) throw new Error(`Unknown agent: ${agent}. Supported: ${supported.join(", ")}. Alias: anti=antigravity.`);
  }
  return [...new Set(selected)];
}

function runLoginCommands(statuses) {
  const attempted = [];
  for (const status of statuses) {
    if (!needsLogin(status)) continue;

    const command = loginCommands[status.agent];
    if (!command) {
      attempted.push({
        agent: status.agent,
        ok: false,
        skipped: true,
        reason: "GUI login required",
        hint: runtimeLoginHint(status.agent)
      });
      continue;
    }

    const [bin, args] = command;
    const result = spawnSync(bin, args, { stdio: "inherit", timeout: 120000 });
    attempted.push({
      agent: status.agent,
      ok: result.status === 0,
      command: [bin, ...args].join(" "),
      exit_code: result.status,
      error: result.error?.message
    });
  }
  return attempted;
}

function needsLogin(status) {
  return status.cli.found && ["missing", "failed", "unknown"].includes(status.auth.status);
}

function nextActions(statuses, loginAttempted) {
  const actions = [];
  for (const status of statuses) {
    if (!status.cli.found) {
      actions.push(`${status.agent}: install the CLI or add it to PATH`);
      continue;
    }
    if (status.auth.status === "gui_only") {
      actions.push(`${status.agent}: ${runtimeLoginHint(status.agent)}`);
      continue;
    }
    if (!status.ok) {
      actions.push(`${status.agent}: ${loginAttempted ? "retry" : "run"} cr auth --agent ${status.agent} --login`);
    }
  }
  return actions;
}
