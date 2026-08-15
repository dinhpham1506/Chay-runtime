# Chay Runtime Project Rules

Use these rules whenever an IDE AI works inside a project that has Chay Runtime files.

## Core Cases

Chay Runtime answers three questions around every AI coding session:

1. Continue existing feature: read the right handoff/context before editing.
2. Add or change feature: show the human flow, inferred runtime sequence, API/code relation, and code targets before AI edits.
3. Verify AI edit: check whether the patch stayed inside the feature boundary and did not affect unrelated feature scope.

Short rule: feature memory before code, feature boundary after code.

Sequence rule: treat `runtime_sequence` as inferred repository evidence, not absolute truth. Check confidence, evidence, and unknowns before editing interactions.

## Required Read Order

1. `.chay/ide/CHAY_IDE_INSTRUCTIONS.md`
2. `chay-memory/rules/chay-runtime.md`
3. `chay-memory/ai_handoff.json`
4. `chay-structure/features/<feature_id>.md`
5. `chay-structure/folder_structure.md`
6. `chay-structure/api_graph.md`
7. `chay-structure/diagrams/<feature_id>-user-flow.puml`
8. `chay-structure/diagrams/<feature_id>-sequence.puml`
9. `chay-structure/diagrams/<feature_id>-api-graph.puml`
10. `chay-memory/feature_graph.json`
11. `chay-memory/context_package.json`
12. Selected source files only

## Existing Vs New Feature Rule

- If the user asks to continue, fix, extend, or change an existing feature, update the existing `chay-structure/features/<feature_id>.md`, PlantUML, and `chay-memory/feature_graph.json` contract instead of creating a separate competing contract.
- If the user asks for a new feature, create or refresh the feature contract with `cr go "Task"` before coding.
- If a feature already exists in the project, preserve its current flow and add only the new branch, node, file target, or acceptance check required by the request.
- Do not replace old flow docs just because a new request arrives; merge the new requirement into the current contract.

## Scope Rules

- Treat `chay-structure/features/<feature_id>.md`, `chay-structure/folder_structure.md`, and `chay-structure/api_graph.md` as the human-readable source of truth.
- Treat `chay-memory/feature_graph.json` as the machine-verifiable source of truth.
- Edit only files listed in `selected_files`, `allowed_files`, or graph `code_targets`.
- If selected files do not match the user's business goal, stop and ask the user to rerun `cr go "Task" --files path/to/file`.
- Follow target rationale before touching code. Do not infer business scope from a generic word like `user`.
- Preserve the repo's existing folder structure and local patterns.
- Do not read raw logs, full prompts, secrets, `.env`, credentials, or unrelated generated files.

## After Coding

- Update result notes if the workflow requires them.
- Ask the user to run `git diff > .chay/tmp/current.diff && cr verify && cr handoff`.
- If the feature contract changed, regenerate or update the handoff before another IDE AI continues.

## Progress Contract

Keep progress aligned to these states:

- reading
- checking_existing_contract
- checking_scope
- planning
- updating_contract
- editing
- testing
- patch_check
- done
- blocked

If blocked, state the missing file/scope explicitly and do not edit unrelated files.
