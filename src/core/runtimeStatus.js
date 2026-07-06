import { spawnSync } from "node:child_process";
import { normalizeAgentName } from "./agents.js";

const runtimeChecks = {
  codex: {
    command: "codex",
    versionArgs: ["--version"],
    loginHint: "codex login",
    auth: codexAuthStatus
  },
  claude: {
    command: "claude",
    versionArgs: ["--version"],
    loginHint: "claude auth login",
    auth: claudeAuthStatus
  },
  antigravity: {
    command: "antigravity",
    versionArgs: ["--version"],
    loginHint: "Install and sign in to Antigravity, or set CHAY_ANTIGRAVITY_COMMAND.",
    auth: () => ({ status: "unknown", summary: "auth check is not implemented for Antigravity CLI" })
  }
};

export function agentRuntimeStatus(options = {}) {
  return Object.keys(runtimeChecks).map((agent) => runtimeStatus(agent, options));
}

export function runtimeStatus(agent, options = {}) {
  const normalized = normalizeAgentName(agent);
  const check = runtimeChecks[normalized];
  if (!check) return { agent: normalized, ok: false, cli: { found: false }, auth: { status: "unsupported" } };

  const cli = commandStatus(check.command, check.versionArgs);
  const auth = options.auth && cli.found ? check.auth() : {
    status: "not_checked",
    summary: "auth not checked in realtime UI",
    hint: check.loginHint
  };

  return {
    agent: normalized,
    ok: cli.found && !authBlocksRun(auth),
    command: check.command,
    cli,
    auth
  };
}

function authBlocksRun(auth) {
  return ["missing", "failed"].includes(auth.status) || auth.reachability === "fail";
}

function commandStatus(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8", timeout: 3000 });
  if (result.error?.code === "ENOENT") {
    return { found: false, status: "missing", summary: `${command} not found in PATH` };
  }
  if (result.error) {
    return { found: false, status: "error", summary: result.error.message };
  }
  return {
    found: result.status === 0,
    status: result.status === 0 ? "ok" : "error",
    summary: compact(firstLine(result.stdout) || firstLine(result.stderr) || `${command} exited ${result.status}`),
    exit_code: result.status
  };
}

function codexAuthStatus() {
  const result = spawnSync("codex", ["doctor", "--json"], { encoding: "utf8", timeout: 12000 });
  if (result.error) return { status: "unknown", summary: result.error.message, hint: "codex doctor --json" };
  const report = parseJsonFromOutput(result.stdout || result.stderr);
  if (!report) return { status: "unknown", summary: compact(firstLine(result.stdout) || firstLine(result.stderr)), hint: "codex doctor --json" };

  const auth = report.checks?.["auth.credentials"];
  const reachability = report.checks?.["network.provider_reachability"];
  const config = report.checks?.["config.load"];
  return {
    status: auth?.status === "ok" ? "configured" : "missing",
    summary: auth?.summary || "auth status unavailable",
    model: config?.details?.model,
    provider: config?.details?.["model provider"],
    reachability: reachability?.status || "unknown",
    reachability_summary: reachability?.summary,
    hint: auth?.status === "ok" ? "auth configured; provider reachability is reported separately" : "codex login"
  };
}

function claudeAuthStatus() {
  const result = spawnSync("claude", ["auth", "status"], { encoding: "utf8", timeout: 8000 });
  if (result.error) return { status: "unknown", summary: result.error.message, hint: "claude auth status" };
  const data = parseJsonFromOutput(result.stdout || result.stderr);
  if (!data) return { status: "unknown", summary: compact(firstLine(result.stdout) || firstLine(result.stderr)), hint: "claude auth status" };
  return {
    status: data.loggedIn ? "configured" : "missing",
    summary: data.loggedIn ? `logged in via ${data.authMethod || "unknown"}` : "not logged in",
    provider: data.apiProvider,
    hint: data.loggedIn ? "auth configured" : "claude auth login"
  };
}

function parseJsonFromOutput(output) {
  const text = String(output || "");
  const start = text.indexOf("{");
  if (start < 0) return null;
  try {
    return JSON.parse(text.slice(start));
  } catch {
    return null;
  }
}

function firstLine(text) {
  return String(text || "").trim().split(/\r?\n/).find(Boolean) || "";
}

function compact(value, max = 180) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
