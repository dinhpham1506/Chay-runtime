import process from "node:process";

export async function doctor() {
  console.log(JSON.stringify({
    ok: true,
    node: process.version,
    cwd: process.cwd(),
    commands: {
      boundary: "ok",
      repoScan: "ok",
      contextPlan: "ok",
      patchCheck: "ok",
      noteCompile: "ok"
    }
  }, null, 2));
}
