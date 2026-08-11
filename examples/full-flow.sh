#!/usr/bin/env bash
set -euo pipefail

cr init
cr scan
cr plan "Fix duplicate job apply bug"
cr pack "Fix duplicate job apply bug" --worker codex --compact
cr boundary check-note --file chay-memory/task_note.json
cr boundary check-note --file chay-memory/codex_work_note.json --kind work
cr run codex --max-retries 3
cr experience snapshot --out chay-memory/experience_spectrum.json
cr note compile --json chay-memory/task_note.json --out chay-memory/task_note.md
