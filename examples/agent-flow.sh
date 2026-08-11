#!/usr/bin/env bash
set -euo pipefail

# Main/controller agent prepares the repo memory.
cr init
cr scan
cr plan "Fix duplicate apply service"

# Main/controller agent gives a small scoped job to a worker agent.
cr pack "Fix duplicate apply service" --worker codex --files src/applyService.js --compact

# Worker agent reads only memory/*.json and scoped source files.
cr boundary check-note --file memory/task_note.json --kind task
cr boundary check-note --file memory/codex_work_note.json --kind work
cr run codex --max-retries 3
cr experience snapshot --out memory/experience_spectrum.json

# Human audit note is generated, but agents must not read .chay/audit/*.md.
cr note compile --json memory/task_note.json --out .chay/audit/task_note.md
