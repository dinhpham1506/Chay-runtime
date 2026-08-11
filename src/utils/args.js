export function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const item = argv[i];
    if (!item.startsWith("--")) {
      args._.push(item);
      continue;
    }

    const raw = item.slice(2);
    if (raw.includes("=")) {
      const [key, ...parts] = raw.split("=");
      args[key] = parts.join("=");
      continue;
    }

    const key = raw;
    if (booleanArgs.has(key)) {
      args[key] = true;
      continue;
    }

    const next = argv[i + 1];

    if (!next || next.startsWith("--")) {
      args[key] = true;
      continue;
    }

    args[key] = next;
    i++;
  }
  return args;
}

const booleanArgs = new Set([
  "auth",
  "codex",
  "codex-skill",
  "compact",
  "force",
  "global",
  "help",
  "include-database",
  "isolate",
  "login",
  "no-compact",
  "require-existing",
  "skip-login",
  "skip-context-plan",
  "skip-token-check",
  "version"
]);
