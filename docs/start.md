# Recommended `cr start` Workflow

Use this path when a human wants an IDE chatbot or coding agent to continue a feature with bounded context.

`cr start` is the recommended entry point. It prepares Chay Runtime files for an external IDE AI session; it does not create a legacy main/worker split.

## Setup

```bash
npm install -g chay-runtime@latest
cd your-project
cr start
cr config codex
```

`cr start` also creates the first whole-project baseline:

```text
.chay/project_map.json
chay-memory/system_map.json
chay-structure/system_overview.md
chay-structure/api_inventory.md
chay-structure/system_folder_map.md
chay-structure/diagrams/system-overview.puml
chay-structure/diagrams/api-inventory.puml
```

Refresh that baseline any time with:

```bash
cr system map
```

Install persistent rules for the chat surface you use:

```bash
cr chat install --target codex
# optional: cr chat install --target cursor
```

For Codex, `cr chat install --target codex` also installs the global `chay-runtime` Codex Skill when a Codex home is available. Other targets are still supported, but install them only when you use them.

## Work On A Feature

```bash
cr go "Admin changes user role"
```

`cr go` writes:

- `chay-memory/ai_handoff.json`
- `chay-memory/feature_graph.json`
- `chay-memory/context_package.json`
- `chay-structure/features/<feature_id>.md`
- `chay-structure/folder_structure.md`
- `chay-structure/api_graph.md`
- `chay-structure/diagrams/<feature_id>-user-flow.puml`
- `chay-structure/diagrams/<feature_id>-sequence.puml`
- `chay-structure/diagrams/<feature_id>-api-graph.puml`

The generated feature contract answers:

- Case A: new AI session reads the right feature context before editing.
- Case B: human sees user flow, inferred runtime sequence, API/code relation, folder map, acceptance checks, and code targets before AI edits.
- Case C: after AI edits, `cr verify` checks whether the patch stayed inside the feature boundary.

## Control Scope

If Chay Runtime cannot infer a safe scope, pass files explicitly:

```bash
cr go "Fix duplicate apply bug" --files src/applyService.js
cr go "Update RLS policy" --include-database
cr go "Only super admin can change user role" --feature admin_changes_user_role
```

Database and migration files are skipped by default unless the goal includes database/schema/migration language or `--include-database` is passed.

## Continue A Feature

When opening a fresh AI session:

```bash
cr go
```

That refreshes `ai_handoff.json` from the current feature graph and result notes. Tell the IDE AI to read:

```text
chay-memory/ai_handoff.json
chay-structure/features/<feature_id>.md
chay-structure/folder_structure.md
chay-structure/api_graph.md
chay-memory/feature_graph.json
chay-memory/context_package.json
selected files only
```

## Verify After Edits

```bash
git diff > .chay/tmp/current.diff
cr verify
cr handoff
```

`cr verify` is a runtime guardrail. It validates patch size, allowed files, sensitive paths, human-owned paths, and forbidden patterns. It is not an OS sandbox. Use `cr run --isolate`, a container, VM, or OS sandbox when you need stronger containment for untrusted commands.

## Local UI

```bash
cr ui serve --port 7770
```

Open `http://127.0.0.1:7770` to inspect selected files, runtime status, handoff state, eval reports, patch checks, and progress notes. The UI is local-only because it reads and writes project files.
