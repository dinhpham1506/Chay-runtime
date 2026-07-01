import path from "node:path";
import { copyDir } from "../utils/fs.js";
import { parseArgs } from "../utils/args.js";

const agentTargets = ["claude", "codex", "antigravity"];
const targets = [...agentTargets];

export async function installIntegration(argv) {
  const args = parseArgs(argv);
  if (!args.target) throw new Error("--target is required: claude | codex | antigravity");
  if (!targets.includes(args.target)) {
    throw new Error("--target must be claude, codex, or antigravity");
  }

  const installed = installIntegrationFiles(args.target, process.cwd());

  console.log(JSON.stringify({
    ok: true,
    target: args.target,
    installed,
    message: `Installed ${args.target} integration templates into current project`
  }, null, 2));
}

export function installIntegrationFiles(target, root = process.cwd()) {
  if (!targets.includes(target)) throw new Error(`Unknown integration target: ${target}`);
  const pkgRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
  const src = path.join(pkgRoot, "templates", target);

  copyDir(src, root);
  return target;
}

export function integrationTargets() {
  return [...targets];
}

export function agentIntegrationTargets() {
  return [...agentTargets];
}
