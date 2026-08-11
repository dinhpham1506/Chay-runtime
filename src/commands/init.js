import path from "node:path";
import { writeJson, writeText } from "../utils/fs.js";

export async function initProject() {
  const root = process.cwd();
  const result = createProjectFiles(root);

  console.log(JSON.stringify(result, null, 2));
}

export function createProjectFiles(root = process.cwd()) {
  writeJson(path.join(root, "chay-memory/task_note.json"), {
    task_id: "task_001",
    goal: "Describe the coding task here",
    requirements: [
      "Use compact JSON notes",
      "Read chay-memory Markdown/JSON contracts before source files",
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

  writeText(path.join(root, ".chay/tmp/.gitkeep"), "");

  return {
    ok: true,
    message: "Chạy Runtime project initialized",
    created: ["chay-memory/task_note.json", ".chay/tmp"]
  };
}
