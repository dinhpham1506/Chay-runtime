export function printHelp() {
  console.log(`
Chạy Runtime

Usage:
  cr start                    # initialize external IDE AI workflow
  cr config codex,claude,anti,github-copilot,cursor,kiro
  cr config check
  cr go "Fix duplicate apply bug" --files src/applyService.js
  cr go "Fix duplicate apply bug" --max-files 3
  cr go                       # refresh chay-memory/ai_handoff.json for a new IDE session
  cr verify
  cr handoff
  cr ui serve --port 7770

Artifacts:
  chay-memory/ai_handoff.json      # read this first in the IDE AI
  chay-memory/feature_flow.md      # human-readable feature contract and rationale
  chay-memory/folder_structure.md  # folder/code target contract in Markdown
  chay-memory/user_flow.puml       # PlantUML user flow
  chay-memory/sequence.puml        # PlantUML coding sequence
  chay-memory/feature_graph.json   # user flow, sequence, code targets
  .chay/ide/CHAY_IDE_INSTRUCTIONS.md

Selection:
  cr go "Task" --files src/file.js
  cr go "Task" --max-files 2
  cr go "Task" --include-database
  # Database/migration files are skipped by default unless the task is database-related.

Checks:
  cr check                    # CLI/auth/runtime status
  cr auth
  cr login codex
  cr boundary check-graph --file chay-memory/feature_graph.json
  cr boundary check-note --file chay-memory/task_note.json
  cr boundary validate-output --file chay-memory/codex_result_note.json

Repo intelligence:
  cr repo scan --root . --out .chay/project_map.json
  cr context plan
  cr context plan --task "Fix duplicate apply bug" --index .chay/project_map.json --out chay-memory/context_package.json

Notes:
  cr note compile --json chay-memory/task_note.json --out chay-memory/task_note.md

Patch guard:
  cr patch check --diff .chay/tmp/current.diff --work chay-memory/codex_work_note.json

Progress:
  cr progress update --agent codex --step editing --message "Updating backend structure"
  cr progress update --agent codex --step validate_result --message "Validating result note"

Tokens:
  cr token report --worker codex

Efficiency:
  cr eval report

Legacy bounded worker mode:
  cr setup --agents codex,anti --main anti
  cr task "Fix bug" --files src/file.js --compact
  cr run
  cr pack "Fix bug"
  cr pack "Fix bug" --worker codex --files src/applyService.js --compact
  cr workpack make --worker codex --goal "Fix bug" --allowed-files src/applyService.js --compact
  cr dispatch codex --agent=codex --max-retries 3
  cr dispatch codex --agent=codex --model <optional-model> --max-retries 3
  cr dispatch codex --command "your-worker-command"
  cr dispatch codex --agent=codex --test-command "npm test"
  cr dispatch codex --agent=codex --isolate
  CHAY_ANTIGRAVITY_COMMAND="your-antigravity-worker-command" cr dispatch antigravity --agent=anti

Experience compression:
  cr experience snapshot --out chay-memory/experience_spectrum.json

Integrations:
  cr integration install --target claude
  cr integration install --target codex
  cr integration install --target antigravity
  cr integration install --target anti
`);
}
