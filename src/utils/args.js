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
