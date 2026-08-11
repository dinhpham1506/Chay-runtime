import { initProject } from "./commands/init.js";
import { doctor } from "./commands/doctor.js";
import { checkNote, validateOutput } from "./commands/boundary.js";
import { scanRepo } from "./commands/repoScan.js";
import { planContext } from "./commands/contextPlan.js";
import { compileNote } from "./commands/noteCompile.js";
import { checkPatch } from "./commands/patchCheck.js";
import { makeWorkpack } from "./commands/workpack.js";
import { dispatch } from "./commands/dispatch.js";
import { snapshotExperience } from "./commands/experience.js";
import { installIntegration, installRules } from "./commands/integrations.js";
import { setupProject, startProject } from "./commands/setup.js";
import { authAgents } from "./commands/auth.js";
import { createGraph } from "./commands/graph.js";
import { createHandoff } from "./commands/handoff.js";
import { go } from "./commands/go.js";
import { ide } from "./commands/ide.js";
import { createTask } from "./commands/task.js";
import { updateProgress } from "./commands/progress.js";
import { serveUi } from "./commands/ui.js";
import { tokenReport } from "./commands/tokens.js";
import { evalReport } from "./commands/eval.js";
import { printHelp } from "./utils/help.js";

export async function main(argv) {
  const [cmd, subcmd, ...rest] = argv;

  if (!cmd || cmd === "help" || cmd === "--help" || cmd === "-h") {
    printHelp();
    return;
  }

  if (cmd === "init") return initProject([subcmd, ...rest].filter(Boolean));
  if (cmd === "start" || cmd === "wizard") return startProject([subcmd, ...rest].filter(Boolean));
  if (cmd === "setup") return setupProject([subcmd, ...rest].filter(Boolean));
  if (cmd === "auth") return authAgents([subcmd, ...rest].filter(Boolean));
  if (cmd === "login") return authAgents([subcmd, ...rest, "--login"].filter(Boolean));
  if (cmd === "config") return ide([subcmd || "config", ...rest].filter(Boolean));
  if (cmd === "ide" || cmd === "idea") return ide([subcmd, ...rest].filter(Boolean));
  if (cmd === "go" || cmd === "do") return go([subcmd, ...rest].filter(Boolean));
  if (cmd === "graph") return createGraph([subcmd, ...rest].filter(Boolean));
  if (cmd === "handoff" || (cmd === "ai" && subcmd === "handoff")) return createHandoff(cmd === "ai" ? rest : [subcmd, ...rest].filter(Boolean));
  if (cmd === "task") return createTask([subcmd, ...rest].filter(Boolean));
  if (cmd === "check") return doctor([subcmd, ...rest].filter(Boolean));
  if (cmd === "scan") return scanRepo([subcmd, ...rest].filter(Boolean));
  if (cmd === "plan") return planContext([subcmd, ...rest].filter(Boolean));
  if (cmd === "pack") return makeWorkpack([subcmd, ...rest].filter(Boolean));
  if (cmd === "run") return dispatch([subcmd, ...rest].filter(Boolean));
  if (cmd === "ui" && subcmd === "serve") return serveUi(rest);
  if (cmd === "token" && subcmd === "report") return tokenReport(rest);
  if (cmd === "eval" && subcmd === "report") return evalReport(rest);
  if (cmd === "verify") return evalReport([subcmd, ...rest].filter(Boolean));
  if (cmd === "progress" && subcmd === "update") return updateProgress(rest);
  if (cmd === "doctor") return doctor([subcmd, ...rest].filter(Boolean));

  if (cmd === "boundary" && subcmd === "check-note") return checkNote(rest);
  if (cmd === "boundary" && subcmd === "check-graph") return createGraph(["--check", ...(rest || [])].filter(Boolean));
  if (cmd === "boundary" && subcmd === "validate-output") return validateOutput(rest);

  if (cmd === "repo" && subcmd === "scan") return scanRepo(rest);
  if (cmd === "context" && subcmd === "plan") return planContext(rest);
  if (cmd === "note" && subcmd === "compile") return compileNote(rest);
  if (cmd === "patch" && subcmd === "check") return checkPatch(rest);
  if (cmd === "workpack" && subcmd === "make") return makeWorkpack(rest);
  if (cmd === "dispatch") return dispatch([subcmd, ...rest].filter(Boolean));
  if (cmd === "experience" && subcmd === "snapshot") return snapshotExperience(rest);
  if (cmd === "integration" && subcmd === "install") return installIntegration(rest);
  if ((cmd === "rules" || cmd === "rule" || cmd === "skill") && (!subcmd || subcmd === "install" || subcmd === "add")) {
    const result = installRules(rest, process.cwd());
    console.log(JSON.stringify({ ok: true, command: "rules install", alias_used: cmd === "skill" ? "skill" : undefined, ...result }, null, 2));
    return;
  }

  throw new Error(`Unknown command: ${[cmd, subcmd].filter(Boolean).join(" ")}`);
}
