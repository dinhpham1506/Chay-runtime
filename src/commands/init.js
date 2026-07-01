import path from "node:path";
import { copyDir, writeJson, writeText } from "../utils/fs.js";

export async function initProject() {
  const root = process.cwd();
  const result = createProjectFiles(root);

  console.log(JSON.stringify(result, null, 2));
}

export function createProjectFiles(root = process.cwd()) {
  const pkgRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");

  copyDir(path.join(pkgRoot, "policies"), path.join(root, "policies"));
  copyDir(path.join(pkgRoot, "schemas"), path.join(root, "schemas"));

  writeJson(path.join(root, "memory/task_note.json"), {
    task_id: "task_001",
    goal: "Describe the coding task here",
    requirements: [
      "Use compact JSON notes",
      "Do not read audit markdown",
      "Keep patches small",
      "Return result_note JSON only"
    ],
    constraints: [
      "Follow existing design patterns and SOLID principles",
      "Split code by responsibility, not arbitrary line count",
      "No unrestricted tool execution",
      "No long agent-to-agent chat"
    ],
    created_at: new Date().toISOString()
  });

  writeText(path.join(root, "audit/.gitkeep"), "");
  writeText(path.join(root, ".chay-index/.gitkeep"), "");
  writeText(path.join(root, ".chay/tmp/.gitkeep"), "");

  return {
    ok: true,
    message: "Chạy Runtime project initialized",
    created: ["policies", "schemas", "memory/task_note.json", "audit", ".chay-index", ".chay/tmp"]
  };
}
