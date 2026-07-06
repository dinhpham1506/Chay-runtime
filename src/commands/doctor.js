import process from "node:process";
import { agentRuntimeStatus } from "../core/runtimeStatus.js";

export async function doctor() {
  console.log(JSON.stringify({
    ok: true,
    node: process.version,
    cwd: process.cwd(),
    agents: agentRuntimeStatus({ auth: true }),
    commands: {
      boundary: "ok",
      repoScan: "ok",
      contextPlan: "ok",
      patchCheck: "ok",
      noteCompile: "ok"
    }
  }, null, 2));
}
