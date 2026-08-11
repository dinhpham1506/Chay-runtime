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
      setArg(args, key, parts.join("="));
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

    setArg(args, key, next);
    i++;
  }
  return args;
}

function setArg(args, key, value) {
  if (!repeatableArgs.has(key) || args[key] === undefined) {
    args[key] = value;
    return;
  }
  args[key] = Array.isArray(args[key]) ? [...args[key], value] : [args[key], value];
}

const repeatableArgs = new Set([
  "allowed-files",
  "code-targets",
  "file",
  "files"
]);

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
