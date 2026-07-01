# Experience Compression Spectrum

Chạy Runtime maps the Experience Compression Spectrum paper into a local, file-based
runtime pattern:

- Memory: compact task state and outcomes in `memory/task_note.json`,
  `memory/context_package.json`, `memory/plan_ledger.json`, and
  `memory/<worker>_result_note.json`.
- Skills: procedural hints listed by name in the work note, such as
  `repo_search`, `solid_refactor`, `test_runner`, `patch_guard`, and
  `minimal_patch`.
- Rules: declarative constraints kept behind `policy_ref`, usually
  `policies/chay_policy.json`.

This keeps worker context small while preserving enough contract for the task to
run end-to-end.

## How People Use It

```bash
cr repo scan --root . --out .chay-index/project_map.json
cr context plan \
  --task "Fix duplicate apply service" \
  --index .chay-index/project_map.json \
  --out memory/context_package.json \
  --max-notes 2

cr workpack make \
  --worker codex \
  --goal "Fix duplicate apply service" \
  --allowed-files "src/applyService.js" \
  --compact \
  --out memory/codex_work_note.json

cr boundary check-note --file memory/codex_work_note.json --kind work
cr dispatch codex --agent=codex --max-retries 3
cr experience snapshot --out memory/experience_spectrum.json
```

The worker reads the compact note, selected memory refs, and the files in
`allowed_files`. It should not read audit markdown, raw logs, full prompts, or
the entire repository.

## Runtime Rule

Only Chạy Runtime writes `memory/plan_ledger.json`. Dispatch updates the ledger
after both result validation and patch boundary checks pass. Worker self-reports
are not enough to mark a step done.

## Why This Downsized Form Still Works

- The worker receives the task contract, not a full transcript.
- Selected files are referenced by path and read only when needed.
- Skills are short names, not long procedural manuals.
- Rules are referenced through `policy_ref`, not copied into every work note.
- The ledger preserves task continuity across agents and sessions.

## Minimal Patch Rules

Chạy Runtime includes a Ponytail-inspired `minimalPatchRules` policy layer. The runtime
does not vendor Ponytail; it keeps the useful behavior as local declarative rules:

- Skip unnecessary work.
- Reuse existing code before writing new code.
- Prefer standard library and native platform features before dependencies.
- Write the smallest correct patch.
- Never remove validation, error handling, security, accessibility, or tests just
  to make code smaller.
