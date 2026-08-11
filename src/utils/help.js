export function printHelp() {
  console.log(`
Chạy Runtime

Usage:
  cr start                    # easiest setup wizard + login checks
  cr start --agents codex,anti --main codex
  cr start --agents codex,claude,anti --main claude --skip-login
  cr start --advanced         # also ask model labels and skills
  cr check                    # checks CLI, login/auth, model/provider, reachability
  cr setup                    # configure without forcing login
  cr auth                     # check Codex, Claude, and Antigravity auth
  cr auth --agent codex --login
  cr auth --agents codex,claude --login
  cr login codex
  cr config codex,claude,anti,github-copilot,cursor,kiro
  cr config check
  cr go                       # resume current task into memory/ai_handoff.json
  cr go "Fix duplicate apply bug"
  cr go "Fix duplicate apply bug" --files src/applyService.js
  cr graph "User applies to job" --files src/applyService.js
  cr boundary check-graph --file memory/feature_graph.json
  cr handoff                  # writes memory/ai_handoff.json for a new IDE AI session
  cr task
  cr task "Fix duplicate apply bug"
  cr task --from-graph memory/feature_graph.json --compact
  cr task "Fix duplicate apply bug" --files src/applyService.js --compact
  cr run
  cr run codex --max-retries 3
  cr verify                   # alias: cr eval report
  cr ui serve --port 7770

Simple aliases:
  cr scan                     # alias: cr repo scan
  cr plan "Fix duplicate apply bug"
  cr pack "Fix bug" --files src/applyService.js --compact
  cr run codex                # alias: cr dispatch codex
  cr check                    # alias: cr doctor

Setup:
  cr init
  cr setup --agents codex,anti --main anti
  cr setup --agents claude,anti --main claude
  cr doctor

Boundary:
  cr boundary check-graph --file memory/feature_graph.json
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
  cr pack "Fix bug"
  cr pack "Fix bug" --worker codex --files src/applyService.js --compact
  cr workpack make --worker codex --goal "Fix bug" --allowed-files src/applyService.js --compact

Dispatch:
  cr dispatch codex --agent=codex --max-retries 3
  cr dispatch codex --agent=codex --model <optional-model> --max-retries 3
  cr dispatch codex --command "your-worker-command"
  cr dispatch codex --agent=codex --test-command "npm test"
  cr dispatch codex --agent=codex --isolate
  CHAY_ANTIGRAVITY_COMMAND="your-antigravity-worker-command" cr dispatch antigravity --agent=anti

Experience compression:
  cr experience snapshot --out memory/experience_spectrum.json

Integrations:
  cr integration install --target claude
  cr integration install --target codex
  cr integration install --target antigravity
  cr integration install --target anti
`);
}
