# chay-runtime

[![CI](https://github.com/dinhpham1506/Chay-runtime/actions/workflows/ci.yml/badge.svg)](https://github.com/dinhpham1506/Chay-runtime/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/chay-runtime.svg)](https://www.npmjs.com/package/chay-runtime)
[![License](https://img.shields.io/npm/l/chay-runtime.svg)](LICENSE)

chay-runtime is a feature-context runtime and contract layer for IDE AI coding sessions.

## Core idea

- Agents read scoped contracts from `chay-memory/*.md` and compact JSON notes from `chay-memory/*.json`.
- Humans inspect the same `chay-memory` flow and folder docs instead of scattered audit folders.
- Boundary tools validate note size, output schema, patch size, and scope.
- Feature graphs define the user flow source of truth before code changes.
- Architecture rules require workers to follow existing design patterns and SOLID principles.
- Repo intelligence selects a small context package before agents read code.
- `cr start` boots the external IDE AI handoff workflow; legacy main/worker agent setup stays behind `cr setup`.

## Docs

- [Recommended `cr start` workflow](docs/start.md): external IDE AI handoff, feature contracts, chatbot/rule install, verify/handoff.
- [Legacy `cr setup` workflow](docs/setup-legacy.md): older main/worker automation, `cr run`, dispatch, and wrapper-based Antigravity notes.
- [C4 model](docs/c4-model.md): local runtime architecture.
- [Experience compression](docs/experience-compression.md): compact notes, feature graph, handoff, and policy references.
- [Contributing](CONTRIBUTING.md): development, PR, issue, and safety-boundary guidelines.

## What Chạy answers

Every AI coding session has to answer three practical questions:

1. **Continue existing feature**
   - Is this new AI session reading the right feature context?
   - Output: `ai_handoff.json`, feature markdown, previous result, selected files.

2. **Add or change feature**
   - What should exist before AI edits code?
   - Output: user flow, inferred runtime sequence with confidence/evidence, API/code relation, acceptance checks, folder map, code targets.

3. **Verify AI edit**
   - What is this change allowed to touch?
   - Output: diff boundary check against `allowed_files`, `code_targets`, sensitive paths, human-owned paths, and forbidden patterns.

The short version: **feature memory before code, feature boundary after code.**

## Why it is useful

Chạy Runtime is not another model wrapper. It is a small runtime layer that
turns coding agents into a bounded workflow:

- One clear task becomes compact machine-readable notes.
- A feature graph captures the user flow, error branches, code targets, and
  acceptance checks before a worker edits code.
- The sequence diagram is an `Inferred Runtime Sequence`: it is built from
  selected targets, detected routes, imports, and file roles, then marked with
  confidence and human-review notes instead of pretending imports prove runtime order.
- The repo scan picks a small set of relevant files instead of handing the whole
  project to every agent.
- Codex, Claude, Antigravity, Cursor, GitHub Copilot, Kiro, or another IDE AI
  can read the compact handoff and code outside the runtime.
- The IDE AI gets a scoped work note, allowed files, policy rules, and an
  output contract.
- The runtime validates result JSON, patch scope, forbidden patterns, retry
  behavior, progress notes, and optional tests before treating the work as done.
- Humans get `chay-memory` flow docs and a local UI without exposing raw prompts, logs, or
  long agent chatter.

The useful part is control: you can let multiple coding tools help while keeping
the task small, reviewable, and recoverable.

## CLI shape

Chạy Runtime supports two ways to use the same contract workflow.

### Option 1: Terminal commands

Use this when you want explicit control from the shell:

```bash
npm install -g chay-runtime@latest
cr start
cr go "User applies to job"
```

`cr go` writes the feature graph, user-flow diagram, sequence diagram, scoped
work note, and compact IDE handoff. `cr start` does not split work into
subagents or ask for a main/worker pair. If you already know the file scope, pass
`--files src/file.js`; otherwise Chạy Runtime scans the repo and selects a small
context package. Open your IDE AI and tell it:

```text
Read chay-memory/ai_handoff.json, then chay-structure/features/<feature_id>.md, chay-structure/folder_structure.md, and chay-structure/api_graph.md. Continue only inside selected files.
```

### Option 2: Add it directly to the chatbot / IDE AI

Use this when you want Codex, Claude Code, Cursor, GitHub Copilot, Kiro, or
Windsurf to remember the Chạy Runtime read order through installed rules instead
of pasting the long prompt every session:

```bash
npm install -g chay-runtime@latest
cd your-project
cr start

# Codex: installs project rules and the global chay-runtime Codex Skill
cr chat install --target codex

# Other IDE chat surfaces: installs project rule files
cr chat install --target cursor
cr chat install --target github-copilot
cr chat install --target kiro
cr chat install --target windsurf

# Claude Code: installs project rules plus Claude agent templates
cr chat install --target claude
```

After that, open the chatbot in the repo and type the task naturally. The
installed rules tell it to read `chay-memory/ai_handoff.json`,
`chay-structure/features/<feature_id>.md`, folder structure, API graph, and
selected files before editing.

Friendly aliases exist for the common steps:

```bash
cr check        # check CLI/auth/runtime
cr scan         # same as cr repo scan
cr plan "..."   # same as cr context plan --task "..."
cr pack "..."   # create a scoped worker note
cr run codex    # run a worker
```

The longer commands still exist for scripting and debugging.

## Install local

```bash
npm install -g .
cr check
```

Or during development:

```bash
npm link
which cr
cr check
```

## Add to a project

Install the toolkit, then bootstrap Chạy Runtime inside the project you want IDE
AI to work on:

```bash
npm install -g chay-runtime@latest
cd your-project
cr start
```

If `cr start` prints `Unknown command: start`, your shell is running an older
global `cr`. Update it with `npm install -g chay-runtime@latest`, or in a local
checkout run `npm link` from this repository and then retry `cr start`.

`cr start` prepares the Chạy Runtime folders, writes
`.chay/ide/CHAY_IDE_INSTRUCTIONS.md`, and writes `chay-memory/ide_config.json` in
external IDE AI mode. It does not ask you to choose multiple agents, does not
create a main/worker split, and does not run Supabase or database setup.

Configure the IDEs you actually use:

```bash
cr config codex,claude,anti,github-copilot,cursor,kiro
```

`cr start` and `cr config` also install IDE project rules so the IDE AI does
not need a long pasted prompt every time:

- `chay-memory/rules/chay-runtime.md`
- `.codex/rules/chay-runtime.md`
- `.cursor/rules/chay-runtime.mdc`
- `.github/instructions/chay-runtime.instructions.md`
- `.kiro/steering/chay-runtime.md`
- `.windsurf/rules/chay-runtime.md`

Reinstall only the rule pack with:

```bash
cr rules install
```

If you want Chay Runtime to appear in the Codex Skills picker/list, also install
the lightweight global Codex Skill wrapper:

```bash
cr rules install --codex-skill
```

That writes `chay-runtime` under `${CODEX_HOME:-~/.codex}/skills/`. Restart or
refresh Codex after installing it.

If you still need the old bounded worker automation, use `cr setup`
explicitly. It is documented separately in
[docs/setup-legacy.md](docs/setup-legacy.md) so the recommended IDE handoff path
stays easy to follow.

Optional local workflow UI:

```bash
cr ui serve --port 7770
```

Open `http://127.0.0.1:7770`. The UI shows workflow columns, agents, task state,
selected files, runtime CLI status, checks, token/eval reports, and chat. The
maintainable console template lives at `site/console.html`; `src/commands/ui.js` serves the file and
owns the local API. It reads `/api/state`, streams updates through `/api/stream`
with a file-watch/poll fallback, and writes chat to `chay-memory/chat/messages.json`.
The same UI can create compact tasks and spawn `cr run` in the background with
worker/engine/isolate/test-command options, write manual progress events, validate
result notes, check patches, and show the plan ledger / experience compression
snapshot.

## Deployable UI

The public/deployable UI is a static landing page:

```text
site/index.html
```

It should teach the short IDE handoff path only:

```bash
cr start
cr go "Fix bug" --files src/file.js
cr verify
```

The realtime operator console is intentionally local because it reads and writes
project files:

```bash
cr ui serve --port 7770
```

Deploy `site/index.html` as the public page, and keep `site/console.html` for
local project control.

Progress API:

```bash
cr progress update --agent codex --step editing --message "Updating backend structure"
```

The UI does not expose raw logs, `.chay/tmp/current.diff`, stack traces, command output, or full prompts.

## Publish to npm

```bash
npm login
npm publish --access public
```

## Basic flow

```bash
cr start
cr config codex,claude,anti,github-copilot,cursor,kiro
cr go "Fix duplicate job apply bug"
cr verify
cr handoff
```

`cr go` selects at most 3 files by default and skips database/migration files
unless the task is clearly database-related. If it cannot choose a safe app file,
pass scope explicitly:

```bash
cr go "Fix duplicate job apply bug" --files src/applyService.js
cr go "Update RLS policy" --include-database
```

`cr repo scan` reuses unchanged file metadata from the previous project map
with an `mtime + size` cache, so UI task creation does not need to reread every
source file on each run.

Lower-level `cr graph`, `cr task`, `cr pack`, `cr run`, and dispatch commands
remain available for scripting and legacy worker automation. See
[docs/setup-legacy.md](docs/setup-legacy.md) and `examples/agent-flow.sh`.

## Experience compression

Chạy Runtime supports the Experience Compression Spectrum pattern with three compact
layers:

- Memory: `task_note`, `context_package`, `plan_ledger`, and result notes.
- Graph: `feature_graph.json` is the inspectable user-flow contract. Workers
  treat it as source of truth for branches, handled errors, code targets, and
  acceptance checks.
- Handoff: `ai_handoff.json` is the compact resume note for a fresh IDE AI
  session. It lists read order, unfinished status, relevant files, graph/code
  targets, current violations, guardrails, and OWASP API review prompts.
- Skills: short procedural names in the work note.
- Rules: `policy_ref` pointing to the packaged `runtime_default_policy`.

Use `cr pack "Task" --compact` to avoid copying long policy/rule text into
each work note, and `cr experience snapshot` to inspect the chay-memory/rules
that a worker should use. See [docs/experience-compression.md](docs/experience-compression.md).

## Test and build

```bash
npm test
npm run build
```

## Architecture

See [docs/c4-model.md](docs/c4-model.md) for the C4 system model, including the realtime Chạy Console.

`npm test` runs smoke projects in temp directories and verifies:
- project initialization
- arbitrary main/worker selection across Claude, Codex, and Antigravity, including a non-Claude main configuration
- repo scan and context planning
- workpack generation for a smaller `codex` worker
- running a worker command with progress, result validation, optional test command, retry cap, and patch check
- pre-run token compaction before worker execution
- compact experience compression work notes, plan ledger updates, and spectrum snapshots
- user-selected controller LLM, worker LLM, and worker skills
- realtime Chạy Console state without raw logs
- task/work/result note validation
- `chay-memory` Markdown note compilation
- patch boundary rejection for out-of-scope files and forbidden anti-patterns
- Claude integration creates `chay-main`, `chay-reviewer`, and `chay-<worker>-worker`

`npm run build` runs the smoke test and `npm pack --dry-run`.

## Claude Code integration

```bash
cr integration install --target claude --workers codex,antigravity
```

This creates `.claude/settings.json` and these agents:
- `chay-main`: controller that prepares notes and runs worker tasks
- `chay-<worker>-worker`: bounded worker for scoped code edits
- `chay-reviewer`: compact result-note reviewer

## Codex integration

```bash
cr integration install --target codex
```

Then use `CHAY_CODEX_INSTRUCTIONS.md` as the worker instruction. `cr run` uses
`codex exec --model <worker.llm>` when the work note has a model other than
`user-selected`.

## Antigravity integration

```bash
cr integration install --target antigravity
```

Then use `CHAY_ANTIGRAVITY_INSTRUCTIONS.md` as the worker instruction.
Antigravity support is currently best-effort because Antigravity IDE manages
chat/login in the GUI and does not expose a stable non-interactive worker CLI.
For `cr run`, provide `CHAY_ANTIGRAVITY_COMMAND` as a local wrapper that reads
`CHAY_DISPATCH_PROMPT_FILE` and writes the required result note JSON. Treat this
as more fragile than the Claude/Codex paths until Antigravity exposes a stable
automation surface.

## Safety model

Security boundary: Chạy Runtime is a runtime guardrail, not an OS sandbox or a
promise of absolute containment. Treat worker CLIs and IDE agents as code running
with the current user's permissions. Use `--isolate` to reduce accidental
out-of-scope writes, and run the whole worker process inside a container, VM, or
OS sandbox when you need a hard boundary for untrusted commands or models.

Chạy Runtime rejects:
- notes that are too long
- result notes that do not match schema
- patches that change too many files
- patches that add too many lines
- edits outside allowed files
- isolated worker edits outside allowed files before they reach the real project
- agents reading raw logs or full prompts
- worker notes that omit architecture/SOLID rules
- large free-form result logs

The default `cr run` path is a runtime guardrail, not an OS security sandbox:
it validates the worker result and full diff before accepting the patch. Use
`cr run <worker> --isolate` to run the worker in a temporary scoped
workspace. Isolated run copies only runtime notes, packaged policy/schema contracts,
selected context files, and `allowed_files` into the workspace, validates the
full sandbox diff, then copies only `allowed_files` back to the real project
after the patch boundary passes.

Isolated run prevents accidental out-of-scope writes from being copied
back into the real project. A hostile process with the same user permissions can
still read or write files outside the temporary workspace, so use an OS/container
sandbox for hard security boundaries.

Default token budgets are bounded but not overly tight:
- task/work notes: `maxNoteTokens` 1200
- result notes: `maxResultTokens` 900
- context planning: 5 selected files unless `--max-notes` is provided
- run token compaction: `maxTokenCompactionPasses` 2

Before running a worker, `cr run` runs a token preflight loop. If the
task/context/work notes exceed policy budgets, it compacts the context package
and work note into policy references before spawning the worker. Use
`--no-auto-compact` to fail fast instead, or `--skip-token-check` when a human
has intentionally accepted a larger context.

When a worker returns invalid output, `cr boundary validate-output` returns a compact `retry_instruction`. The main/controller agent should send that instruction back to the worker and loop until the worker returns valid `result_note` JSON or reports `blocked`.

`cr run <worker>` automates that worker loop for configured agents. It reads
`chay-memory/<worker>_work_note.json`, runs the selected worker agent, writes live progress,
accepts JSON returned on stdout or in `chay-memory/<worker>_result_note.json`, retries invalid
result notes up to `maxDispatchRetries` (default `3`), optionally runs
`--test-command "<command>"`, and then runs the patch boundary check before marking
the worker done. It also creates short-lived file locks for `allowed_files`,
which keeps overlapping workers from editing the same scoped file at the same time.

Progress steps are explicit about what `cr run` is doing:
`assigned`, `reading`, `planning`, `editing`, `validate_result`, optional
`testing`, `patch_check`, `done`, or `blocked`. `validate_result` means schema
and contract validation for `result_note`; `testing` is only emitted when
`--test-command` is provided.
