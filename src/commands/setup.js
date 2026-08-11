import readline from "node:readline/promises";
import process from "node:process";
import path from "node:path";
import { parseArgs } from "../utils/args.js";
import { writeJson } from "../utils/fs.js";
import { loadPolicy } from "../core/policy.js";
import { normalizeAgentName, normalizeAgentList } from "../core/agents.js";
import { runtimeStatus, supportedRuntimeAgents } from "../core/runtimeStatus.js";
import { createProjectFiles } from "./init.js";
import { installConfiguredIntegrations, agentIntegrationTargets } from "./integrations.js";
import { ensureAgentAuth } from "./auth.js";
import { configureIdeTargets } from "./ide.js";

const defaultSetupAgents = ["codex", "claude", "antigravity"];

export async function startProject(argv = []) {
  const args = parseArgs(argv);
  const root = process.cwd();
  createProjectFiles(root);

  const targetArg = args.target || args.targets || args.agents || args.agent || args._?.join(",") || "manual";
  const ide = configureIdeTargets(targetArg, root);
  const availableCliAgents = supportedRuntimeAgents().map((agent) => runtimeStatus(agent, { auth: Boolean(args.auth) }));

  console.log(JSON.stringify({
    ok: true,
    mode: "external_ide_ai",
    message: "Chạy Runtime started",
    initialized: ["chay-memory/task_note.json", ".chay/tmp"],
    ide_config: ide.config_file,
    instruction_file: ide.instruction_file,
    targets: ide.targets,
    available_cli_agents: availableCliAgents,
    next_prompt: "Read chay-memory/ai_handoff.json, chay-memory/feature_flow.md, and .chay/ide/CHAY_IDE_INSTRUCTIONS.md, then continue the task without editing outside allowed files.",
    next_actions: [
      ide.targets.includes("manual") ? "cr config codex,claude,anti,github-copilot,cursor,kiro" : "cr config check",
      "cr go \"Describe the feature\"",
      "Open your IDE AI and ask it to read chay-memory/ai_handoff.json and chay-memory/feature_flow.md",
      "cr verify",
      "cr handoff"
    ]
  }, null, 2));
}

export async function setupProject(argv, options = {}) {
  const args = parseArgs(argv);
  const policy = loadPolicy(args.policy);
  const answers = await resolveSetup(args, policy, options);
  const root = process.cwd();

  createProjectFiles(root);
  const installed = installConfiguredIntegrations(answers, root);

  const config = {
    host_id: `host_${Date.now()}`,
    main: {
      agent: answers.main,
      llm: answers.mainLlm
    },
    workers: answers.workers.map((agent) => ({
      agent,
      llm: answers.workerLlms[agent] || "user-selected",
      skills: answers.skills
    })),
    enabled_agents: answers.agents,
    skills: answers.skills,
    runtime: {
      memory: "chay-memory/*.json",
      docs: "chay-memory/*.md human-readable flow/folder contracts",
      retry_invalid_output: true
    }
  };

  writeJson(path.join(root, "chay-memory/host_config.json"), config);
  const login = Boolean(args.login || options.login) && !args["skip-login"];
  const auth = ensureAgentAuth(answers.agents, { login });

  console.log(JSON.stringify({
    ok: true,
    message: options.friendly ? "Chạy Runtime started" : "Chạy Runtime configured",
    installed,
    host_config: "chay-memory/host_config.json",
    main: config.main,
    workers: config.workers,
    auth,
    next_actions: [
      ...(auth.next_actions.length > 0 ? auth.next_actions : []),
      "cr task \"Fix something\"",
      "cr run",
      "cr ui serve --port 7770"
    ]
  }, null, 2));
}

async function resolveSetup(args, policy, options = {}) {
  if (!shouldPrompt(args)) return normalizeAnswers(args, policy);

  const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
  try {
    const agents = await askAgents(rl);
    const main = await ask(rl, `Main host agent (${agents.join("|")}) [${agents[0]}]: `) || agents[0];
    const workers = list(await ask(rl, `Worker agents [${agents.filter((agent) => agent !== main).join(",")}]: `), agents.filter((agent) => agent !== main));
    if (options.friendly && !args.advanced) {
      return normalizeAnswers({ agents, main, workers, skills: policy.agentSkills || [] }, policy);
    }

    const mainLlm = await ask(rl, "Main host LLM/model [user-selected]: ") || "user-selected";
    const skills = list(await ask(rl, `Worker skills, not model names [${(policy.agentSkills || []).join(",")}]: `), policy.agentSkills || []);
    const workerLlms = {};

    for (const worker of workers) {
      workerLlms[worker] = await ask(rl, `${worker} LLM/model [user-selected]: `) || "user-selected";
    }

    return normalizeAnswers({ agents, main, "main-llm": mainLlm, workers, skills, workerLlms }, policy);
  } finally {
    rl.close();
  }
}

function normalizeAnswers(args, policy) {
  const requestedAgents = list(args.agents || args.agent, defaultSetupAgents);
  if (args.anti || args.antigravity) requestedAgents.push("antigravity");
  const agents = validateAgents(normalizeAgentList(requestedAgents));
  const main = normalizeAgentName(args.main || args.controller || agents[0]);
  if (!agents.includes(main)) {
    throw new Error(`--main must be included in --agents. main=${main}; agents=${agents.join(",")}. Alias: anti=antigravity.`);
  }

  const defaultWorkers = agents.filter((agent) => agent !== main);
  const workerArg = args.workers ?? (typeof args.worker === "string" ? args.worker : null);
  const workers = list(workerArg, defaultWorkers).map(normalizeAgentName);
  if (workers.length === 0) throw new Error("At least one worker agent is required");
  for (const worker of workers) {
    if (!agents.includes(worker)) throw new Error(`Worker must be included in --agents: ${worker}`);
  }

  return {
    agents,
    main,
    mainLlm: args["main-llm"] || args["controller-llm"] || "user-selected",
    workers,
    workerLlms: parseWorkerLlms(args["worker-llms"], args.workerLlms),
    skills: list(args.skills, policy.agentSkills || [])
  };
}

function shouldPrompt(args) {
  return process.stdin.isTTY && process.stdout.isTTY && !args.yes && !args.agents && !args.agent;
}

function validateAgents(agents) {
  const allowed = agentIntegrationTargets();
  const unique = [...new Set(agents)];
  if (unique.length < 2) throw new Error("Setup requires at least 2 distinct agents. Example: cr setup --agents codex,anti --main anti");
  for (const agent of unique) {
    if (!allowed.includes(agent)) throw new Error(`Unknown agent: ${agent}. Supported: ${allowed.join(", ")}. Alias: anti=antigravity.`);
  }
  return unique;
}

function list(value, fallback = []) {
  const raw = Array.isArray(value) ? value.join(",") : String(value || "");
  const items = raw.split(",").map((item) => item.trim()).filter(Boolean);
  return items.length > 0 ? items : fallback;
}

function parseWorkerLlms(value, ready = null) {
  if (ready && typeof ready === "object" && !Array.isArray(ready)) {
    return Object.fromEntries(Object.entries(ready).map(([agent, llm]) => [normalizeAgentName(agent), llm]));
  }
  const out = {};
  for (const pair of list(value, [])) {
    const [agent, llm] = pair.split(":").map((item) => item.trim());
    if (agent && llm) out[normalizeAgentName(agent)] = llm;
  }
  return out;
}

async function ask(rl, question) {
  return (await rl.question(question)).trim();
}

async function askAgents(rl) {
  while (true) {
    const agents = list(await ask(rl, "Choose agents, comma-separated, at least 2 [codex,claude,anti]: "), defaultSetupAgents).map(normalizeAgentName);
    try {
      return validateAgents(agents);
    } catch (error) {
      console.error(error.message);
    }
  }
}
