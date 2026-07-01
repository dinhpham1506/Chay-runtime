import { parseArgs } from "../utils/args.js";
import { readJson, writeText } from "../utils/fs.js";

export async function compileNote(argv) {
  const args = parseArgs(argv);
  if (!args.json) throw new Error("--json is required");
  const out = args.out || args.json.replace("memory/", "audit/").replace(".json", ".md");
  const data = readJson(args.json);

  const md = toMarkdown(data, args.json);
  writeText(out, md);

  console.log(JSON.stringify({ ok: true, out }, null, 2));
}

function toMarkdown(data, source) {
  const lines = [];
  lines.push(`# Chạy Runtime Note`);
  lines.push(``);
  lines.push(`Source: \`${source}\``);
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(``);
  for (const [key, value] of Object.entries(data)) {
    lines.push(`## ${key}`);
    if (Array.isArray(value)) {
      for (const item of value) lines.push(`- ${typeof item === "object" ? JSON.stringify(item) : item}`);
    } else if (typeof value === "object" && value !== null) {
      lines.push("```json");
      lines.push(JSON.stringify(value, null, 2));
      lines.push("```");
    } else {
      lines.push(String(value));
    }
    lines.push("");
  }
  lines.push("> This Markdown file is human-readable audit output. Agents should read JSON notes, not this file.");
  return lines.join("\n");
}
