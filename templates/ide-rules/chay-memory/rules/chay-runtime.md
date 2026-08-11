# Chay Runtime Project Rules

Use these rules whenever an IDE AI works inside a project that has Chay Runtime files.

## Required Read Order

1. `.chay/ide/CHAY_IDE_INSTRUCTIONS.md`
2. `chay-memory/rules/chay-runtime.md`
3. `chay-memory/ai_handoff.json`
4. `chay-memory/feature_flow.md`
5. `chay-memory/folder_structure.md`
6. `chay-memory/user_flow.puml`
7. `chay-memory/sequence.puml`
8. `chay-memory/feature_graph.json`
9. `chay-memory/context_package.json`
10. Selected source files only

## Existing Vs New Feature Rule

- If the user asks to continue, fix, extend, or change an existing feature, update the existing `feature_flow.md`, `folder_structure.md`, PlantUML, and `feature_graph.json` contract instead of creating a separate competing contract.
- If the user asks for a new feature, create or refresh the feature contract with `cr go "Task"` before coding.
- If a feature already exists in the project, preserve its current flow and add only the new branch, node, file target, or acceptance check required by the request.
- Do not replace old flow docs just because a new request arrives; merge the new requirement into the current contract.

## Scope Rules

- Treat `chay-memory/feature_flow.md` and `chay-memory/folder_structure.md` as the human-readable source of truth.
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
