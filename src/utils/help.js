export function printHelp() {
  console.log(`
Chạy Runtime

Usage:
  cr init
  cr setup --agents claude,codex --main claude --workers codex
  cr setup --agents codex,antigravity --main codex --workers antigravity
  cr ui serve --port 7770
  cr task
  cr task "Fix duplicate apply bug"
  cr task "Fix duplicate apply bug" --compact --max-notes 2
  cr doctor

Boundary:
  cr boundary check-note --file memory/task_note.json
  cr boundary validate-output --file memory/codex_result_note.json --schema schemas/result_note.schema.json

Repo intelligence:
  cr repo scan --root . --out .chay-index/project_map.json
  cr context plan
  cr context plan --task "Fix duplicate apply bug" --index .chay-index/project_map.json --out memory/context_package.json

Notes:
  cr note compile --json memory/task_note.json --out audit/task_note.md

Patch guard:
  cr patch check --diff .chay/tmp/current.diff --work memory/codex_work_note.json

Progress:
  cr progress update --agent codex --step editing --message "Updating backend structure"
  cr progress update --agent codex --step validate_result --message "Validating result note"

Tokens:
  cr token report --worker codex

Efficiency:
  cr eval report

Work package:
  cr workpack make --controller claude --controller-llm sonnet --worker codex --worker-llm gpt-5 --skills repo_search,solid_refactor,test_runner,minimal_patch --goal "Fix bug"
  cr workpack make --worker antigravity --goal "Fix bug" --compact

Dispatch:
  cr dispatch codex --agent=codex --max-retries 3
  cr dispatch codex --command "your-worker-command"
  cr dispatch codex --agent=codex --test-command "npm test"
  cr dispatch codex --agent=codex --isolate
  cr dispatch antigravity --agent=antigravity --isolate

Experience compression:
  cr experience snapshot --out memory/experience_spectrum.json

Integrations:
  cr integration install --target claude
  cr integration install --target codex
  cr integration install --target antigravity
`);
}
