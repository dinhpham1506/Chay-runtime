#!/usr/bin/env bash
set -euo pipefail

cr init
cr repo scan --root . --out .chay-index/project_map.json
cr context plan --task "Fix duplicate job apply bug" --index .chay-index/project_map.json --out memory/context_package.json
cr workpack make \
  --controller claude \
  --controller-llm sonnet \
  --worker codex \
  --worker-llm gpt-5 \
  --skills repo_search,solid_refactor,test_runner,patch_guard \
  --goal "Fix duplicate job apply bug" \
  --compact \
  --out memory/codex_work_note.json
cr boundary check-note --file memory/task_note.json
cr boundary check-note --file memory/codex_work_note.json --kind work
cr dispatch codex --agent=codex --max-retries 3
cr experience snapshot --out memory/experience_spectrum.json
cr note compile --json memory/task_note.json --out audit/task_note.md
