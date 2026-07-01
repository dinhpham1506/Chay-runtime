#!/usr/bin/env node
import { main } from "../src/cli.js";

main(process.argv.slice(2)).catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    error: error.message,
    stack: process.env.CHAY_DEBUG === "1" ? error.stack : undefined
  }, null, 2));
  process.exit(1);
});
