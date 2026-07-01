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
import { installIntegration } from "./commands/integrations.js";
import { setupProject } from "./commands/setup.js";
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

  if (cmd === "init") return initProject(rest);
  if (cmd === "setup") return setupProject(rest);
  if (cmd === "task") return createTask([subcmd, ...rest].filter(Boolean));
  if (cmd === "ui" && subcmd === "serve") return serveUi(rest);
  if (cmd === "token" && subcmd === "report") return tokenReport(rest);
  if (cmd === "eval" && subcmd === "report") return evalReport(rest);
  if (cmd === "progress" && subcmd === "update") return updateProgress(rest);
  if (cmd === "doctor") return doctor(rest);

  if (cmd === "boundary" && subcmd === "check-note") return checkNote(rest);
  if (cmd === "boundary" && subcmd === "validate-output") return validateOutput(rest);

  if (cmd === "repo" && subcmd === "scan") return scanRepo(rest);
  if (cmd === "context" && subcmd === "plan") return planContext(rest);
  if (cmd === "note" && subcmd === "compile") return compileNote(rest);
  if (cmd === "patch" && subcmd === "check") return checkPatch(rest);
  if (cmd === "workpack" && subcmd === "make") return makeWorkpack(rest);
  if (cmd === "dispatch") return dispatch([subcmd, ...rest].filter(Boolean));
  if (cmd === "experience" && subcmd === "snapshot") return snapshotExperience(rest);
  if (cmd === "integration" && subcmd === "install") return installIntegration(rest);

  throw new Error(`Unknown command: ${[cmd, subcmd].filter(Boolean).join(" ")}`);
}
