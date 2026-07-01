#!/usr/bin/env bash
set -euo pipefail

# Main/controller agent prepares the repo memory.
cr init
cr repo scan --root . --out .chay-index/project_map.json
cr context plan \
  --task "Fix duplicate apply service" \
  --index .chay-index/project_map.json \
  --out memory/context_package.json

# Main/controller agent gives a small scoped job to a worker agent.
cr workpack make \
  --controller claude \
  --controller-llm sonnet \
  --worker codex \
  --worker-llm gpt-5 \
  --skills repo_search,solid_refactor,test_runner,patch_guard \
  --goal "Fix duplicate apply service" \
  --allowed-files "src/applyService.js" \
  --compact \
  --out memory/codex_work_note.json

# Worker agent reads only memory/*.json and scoped source files.
cr boundary check-note --file memory/task_note.json --kind task
cr boundary check-note --file memory/codex_work_note.json --kind work
cr dispatch codex --agent=codex --max-retries 3
cr experience snapshot --out memory/experience_spectrum.json

# Human audit note is generated, but agents must not read audit/*.md.
cr note compile --json memory/task_note.json --out audit/task_note.md
