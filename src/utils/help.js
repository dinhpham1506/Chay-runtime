export function printHelp() {
  console.log(`
Chạy Runtime

Feature memory before code. Feature boundary after code.

Cases:
  A. Continue existing feature: read the right handoff/context before editing
  B. Add/change feature: show flow, sequence, API/code relation, and code targets first
  C. Verify AI edit: check whether the patch stayed inside feature boundary

Usage:
  cr start                    # initialize external IDE AI workflow
  cr config codex,claude,anti,github-copilot,cursor,kiro
  cr chat install              # add Chay Runtime directly to Codex/chatbot rules
  cr chat install --target cursor # install direct IDE/chatbot rules for this repo
  cr rules install             # install IDE project rules into this project
  cr rules install --codex-skill # also add chay-runtime to Codex global Skills
  cr config check
  cr go "Fix duplicate apply bug" --files src/applyService.js
  cr go "Block duplicate applies" --feature user_applies_to_job
  cr go "Fix duplicate apply bug" --max-files 3
  cr go                       # refresh chay-memory/ai_handoff.json for a new IDE session
  cr verify
  cr handoff
  cr ui serve --port 7770

Artifacts:
  chay-memory/ai_handoff.json      # read this first in the IDE AI
  chay-memory/rules/chay-runtime.md # shared IDE project rules
  chay-structure/features/<feature_id>.md # one Markdown feature contract per feature
  chay-structure/folder_structure.md      # folder/code target contract in Markdown
  chay-structure/api_graph.md             # API routes and linked code from repo scan
  chay-structure/diagrams/*.puml          # PlantUML user flow, sequence, API graph
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
  cr chat install
  cr chat install --target codex --codex-home ~/.codex
  cr chat install --target cursor
  cr rules install
  cr rules install --codex-skill
  cr integration install --target claude
  cr integration install --target codex
  cr integration install --target antigravity
  cr integration install --target cursor
  cr integration install --target github-copilot
  cr integration install --target kiro
  cr integration install --target anti
`);
}
