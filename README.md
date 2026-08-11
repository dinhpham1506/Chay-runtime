# chay-runtime

chay-runtime is a note-based policy runtime for multi-agent coding CLIs.

## Core idea

- Agents read scoped contracts from `chay-memory/*.md` and compact JSON notes from `chay-memory/*.json`.
- Humans inspect the same `chay-memory` flow and folder docs instead of scattered audit folders.
- Boundary tools validate note size, output schema, patch size, and scope.
- Feature graphs define the user flow source of truth before code changes.
- Architecture rules require workers to follow existing design patterns and SOLID principles.
- Repo intelligence selects a small context package before agents read code.
- `cr start` boots the external IDE AI handoff workflow; legacy main/worker agent setup stays behind `cr setup`.

## Why it is useful

Chạy Runtime is not another model wrapper. It is a small runtime layer that
turns coding agents into a bounded workflow:

- One clear task becomes compact machine-readable notes.
- A feature graph captures the user flow, error branches, code targets, and
  acceptance checks before a worker edits code.
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

The short path is:

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
Read chay-memory/ai_handoff.json, then chay-memory/feature_flow.md and chay-memory/folder_structure.md. Continue only inside selected files.
```

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

If you still need the old bounded worker automation, use `cr setup` explicitly:

```bash
cr setup --agents codex,anti --main anti
cr setup --agents codex,claude,anti --main claude
```

After legacy setup, `cr task`, `cr pack`, and `cr run` automatically use `chay-memory/host_config.json`
for the default worker, controller, worker LLM, and skills unless flags override
them. Any two supported agents can be selected from `claude`, `codex`, and
`antigravity`; one is the main/controller and the rest are workers.
If `--workers` is omitted, every enabled agent except `--main` becomes a worker.
`anti` is accepted as a short alias for `antigravity`.
`--main-llm` and `--worker-llms` are optional model labels, not agent names.
When a worker model is set, `cr run` passes it to Codex and Claude with
`--model`. Antigravity IDE currently exposes GUI chat and login, not a stable
non-interactive `run --prompt-file --model` command; use
`CHAY_ANTIGRAVITY_COMMAND` if you have a local wrapper that writes the required
result note. The model label does not log in to that provider; the matching CLI
or IDE must already be installed and authenticated. Run `cr check` to see CLI
presence, auth status, configured model/provider, and provider reachability.
Run `cr login codex`, `cr auth --agent codex --login`, or `cr auth --agents codex,claude --login`
to check and start login for selected CLI agents. `anti` is accepted as an
alias for `antigravity`.

Current integration capability:

| Agent | `cr setup` legacy role | Packaged integration |
| --- | --- | --- |
| Claude | main/controller or worker | Claude Code agents for `chay-main`, `chay-reviewer`, and `chay-<worker>-worker` |
| Codex | main/controller or worker | Worker instruction/template for bounded `cr run` tasks |
| Antigravity | main/controller or worker | Worker instruction/template for bounded `cr run` tasks |

`host_config.json` can record any supported agent as main, but the packaged
controller integration is currently most complete for Claude Code. Codex and
Antigravity are supported as bounded worker templates unless you provide your
own controller workflow around the generated notes.

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
```

`cr go` selects at most 3 files by default and skips database/migration files
unless the task is clearly database-related. If it cannot choose a safe app file,
pass scope explicitly:

```bash
cr go "Fix duplicate job apply bug" --files src/applyService.js
cr go "Update RLS policy" --include-database
```

With a known file scope:

```bash
cr graph "Fix duplicate job apply bug" --files src/applyService.js
cr task --from-graph chay-memory/feature_graph.json --compact
cr handoff
cr run
```

Without a graph:

```bash
cr task "Fix duplicate job apply bug" --files src/applyService.js --compact
cr run
```

Manual flow:

```bash
WORKER=codex
cr scan
cr plan "Fix duplicate job apply bug"
cr pack "Fix duplicate job apply bug" --worker "$WORKER" --files src/applyService.js --compact
cr boundary check-note --file chay-memory/task_note.json
cr boundary check-note --file "chay-memory/${WORKER}_work_note.json" --kind work
cr run "$WORKER" --max-retries 3
cr run "$WORKER" --max-retries 3 --isolate
cr experience snapshot --out chay-memory/experience_spectrum.json
```

`cr repo scan` reuses unchanged file metadata from the previous project map
with an `mtime + size` cache, so UI task creation does not need to reread every
source file on each run.

## Agent flow

Use Chạy Runtime as the runtime boundary. The main agent creates compact JSON notes, and worker agents read only those notes plus scoped source files.

```bash
# main/controller agent
cr setup --agents codex,anti --main anti
cr scan
cr plan "Fix duplicate apply service"

# main/controller assigns a small worker task
cr pack "Fix duplicate apply service" --worker codex --files src/applyService.js --compact

# worker/reviewer boundary checks
cr boundary check-note --file chay-memory/task_note.json --kind task
cr boundary check-note --file chay-memory/codex_work_note.json --kind work
cr run codex --max-retries 3
```

`examples/agent-flow.sh` contains the same flow as a runnable script.

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
each work note, and `cr experience snapshot` to inspect the chay-memory/skills/rules
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

Then use `CHAY_ANTIGRAVITY_INSTRUCTIONS.md` as the worker instruction. Login is
managed in Antigravity IDE via the Command Palette command `Log in to IDE`.
For non-interactive `cr run`, provide `CHAY_ANTIGRAVITY_COMMAND` as a local
wrapper that reads `CHAY_DISPATCH_PROMPT_FILE` and writes the required result
note JSON.

## Safety model

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
