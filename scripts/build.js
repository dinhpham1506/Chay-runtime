import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";

run(process.execPath, ["./test/smoke.js"]);
run("npm", ["pack", "--dry-run"], {
  env: {
    ...process.env,
    npm_config_cache: path.join(os.tmpdir(), "chay-runtime-npm-cache")
  }
});

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    encoding: "utf8",
    ...options
  });

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}
