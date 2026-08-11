---
name: chay-runtime
description: Use when working in a repository that contains Chay Runtime project rules or handoff files, including chay-memory/rules/chay-runtime.md, chay-memory/ai_handoff.json, chay-memory/feature_flow.md, chay-memory/folder_structure.md, or .chay/ide/CHAY_IDE_INSTRUCTIONS.md. Follow existing feature contracts, update current flow/folder/graph artifacts for old features, create or refresh contracts for new features, and avoid editing files outside Chay Runtime selected scope.
---

# Chay Runtime

When a project contains `chay-memory/` or `.chay/`, use the local project rules before coding.

## Required Read Order

1. `.chay/ide/CHAY_IDE_INSTRUCTIONS.md`
2. `chay-memory/rules/chay-runtime.md`
3. `chay-memory/ai_handoff.json`
4. `chay-memory/feature_flow.md`
5. `chay-memory/folder_structure.md`
6. `chay-memory/feature_graph.json`
7. `chay-memory/context_package.json`
8. Selected source files only

## Operating Rules

- If the user changes an existing feature, update the existing Chay Runtime contract instead of creating a competing flow.
- If the user asks for a new feature, ask them to run `cr go "Task"` or run it when appropriate before coding.
- Edit only `selected_files`, `allowed_files`, or graph `code_targets`.
- If selected files do not match the business goal, stop and ask for `cr go "Task" --files path/to/file`.
- Do not pick implementation files from generic words like `user`; rely on specific business terms and target rationale.
- After code edits, ask the user to run `git diff > .chay/tmp/current.diff && cr verify && cr handoff`.
