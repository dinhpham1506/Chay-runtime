#!/usr/bin/env bash
set -euo pipefail

# Main/controller agent prepares the repo chay-memory.
cr init
cr scan
cr plan "Fix duplicate apply service"

# Main/controller agent gives a small scoped job to a worker agent.
cr pack "Fix duplicate apply service" --worker codex --files src/applyService.js --compact

# Worker agent reads only chay-memory/*.json and scoped source files.
cr boundary check-note --file chay-memory/task_note.json --kind task
cr boundary check-note --file chay-memory/codex_work_note.json --kind work
cr run codex --max-retries 3
cr experience snapshot --out chay-memory/experience_spectrum.json

# Optional human-readable note stays inside chay-memory.
cr note compile --json chay-memory/task_note.json --out chay-memory/task_note.md
