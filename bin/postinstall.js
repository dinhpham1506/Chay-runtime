#!/usr/bin/env node

if (process.env.CI === "true" || process.env.CHAY_SILENT_INSTALL === "1") {
  process.exit(0);
}

console.log(`
chay-runtime installed.

In your project, run:
  cr setup

Non-interactive example:
  cr setup --agents claude,codex --main claude --main-llm sonnet --workers codex --worker-llms codex:gpt-5 --skills repo_search,solid_refactor,test_runner
`);
