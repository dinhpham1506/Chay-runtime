#!/usr/bin/env bash
set -euo pipefail

cr boundary check-note --file memory/task_note.json
cr boundary check-note --file memory/codex_work_note.json || true

echo "Run Codex with the prompt below:"
cat CHAY_CODEX_INSTRUCTIONS.md
echo
echo "After Codex edits, run:"
echo "git diff --no-ext-diff -- . > .chay/tmp/current.diff"
echo "cr patch check --diff .chay/tmp/current.diff --work memory/codex_work_note.json"
