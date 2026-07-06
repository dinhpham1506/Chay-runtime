# chay-runtime

chay-runtime is a note-based policy runtime for multi-agent coding CLIs.

## Core idea

- Agents read compact JSON notes from `memory/*.json`.
- Humans inspect Markdown notes from `audit/*.md`.
- Boundary tools validate note size, output schema, patch size, and scope.
- Architecture rules require workers to follow existing design patterns and SOLID principles.
- Repo intelligence selects a small context package before agents read code.
- Claude, Codex, and Antigravity can be selected as main/controller or bounded worker roles in `cr setup`.

## Install local

```bash
npm install -g .
cr doctor
```

Or during development:

```bash
npm link
cr doctor
```

## Add to a project

Install the toolkit, then run setup inside the project you want agents to work on:

```bash
npm install -g chay-runtime
cd your-project
cr setup
```

`cr setup` asks for at least two enabled agents, then asks which one is the main host/controller. It writes `memory/host_config.json`, installs the selected integrations, and prepares the Chạy Runtime folders.

Non-interactive setup, with any supported agent as main:

```bash
cr setup --agents codex,anti --main anti
```

After setup, `cr workpack make ...` automatically uses `memory/host_config.json`
for the default worker, controller, worker LLM, and skills unless flags override
them. Any two supported agents can be selected from `claude`, `codex`, and
`antigravity`; one is the main/controller and the rest are workers.
If `--workers` is omitted, every enabled agent except `--main` becomes a worker.
`anti` is accepted as a short alias for `antigravity`.
`--main-llm` and `--worker-llms` are optional model labels, not agent names.
When a worker model is set, `cr dispatch` passes it to the selected engine with
`--model` for Codex, Claude, and Antigravity. The model label does not log in to
that provider; the matching CLI must already be installed and authenticated.
Run `cr doctor` to see CLI presence, auth status, configured model/provider, and
provider reachability.

Current integration capability:

| Agent | `cr setup` role | Packaged integration |
| --- | --- | --- |
| Claude | main/controller or worker | Claude Code agents for `chay-main`, `chay-reviewer`, and `chay-<worker>-worker` |
| Codex | main/controller or worker | Worker instruction/template for bounded `cr dispatch` tasks |
| Antigravity | main/controller or worker | Worker instruction/template for bounded `cr dispatch` tasks |

`host_config.json` can record any supported agent as main, but the packaged
controller integration is currently most complete for Claude Code. Codex and
Antigravity are supported as bounded worker templates unless you provide your
own controller workflow around the generated notes.

Native workflow UI:

```bash
cr ui serve --port 7770
```

Open `http://127.0.0.1:7770`. The UI shows workflow columns, agents, task state,
selected files, runtime CLI status, checks, token/eval reports, and chat. The
maintainable console template lives at `site/console.html`; `src/commands/ui.js` serves the file and
owns the local API. It reads `/api/state`, streams updates through `/api/stream`
with a file-watch/poll fallback, and writes chat to `memory/chat/messages.json`.
The same UI can create compact tasks, spawn `cr dispatch` in the background with
worker/engine/isolate/test-command options, write manual progress events, validate
result notes, check patches, and show the plan ledger / experience compression
snapshot.

Progress API:

```bash
cr progress update --agent codex --step editing --message "Updating backend structure"
```

The UI does not expose raw logs, `audit/*.md`, `.chay/tmp/current.diff`, stack traces, command output, or full prompts.

## Publish to npm

```bash
npm login
npm publish --access public
```

## Basic flow

```bash
cr setup --agents codex,anti --main anti
cr task
```

Or one line:

```bash
cr task "Fix duplicate job apply bug"
cr task "Fix duplicate job apply bug" --compact --max-notes 2
```

Manual flow:

```bash
WORKER=codex
cr repo scan --root . --out .chay-index/project_map.json
cr context plan --task "Fix duplicate job apply bug" --out memory/context_package.json
cr workpack make \
  --worker "$WORKER" \
  --goal "Fix duplicate job apply bug" \
  --compact \
  --out "memory/${WORKER}_work_note.json"
cr boundary check-note --file memory/task_note.json
cr boundary check-note --file "memory/${WORKER}_work_note.json" --kind work
cr dispatch "$WORKER" --agent="$WORKER" --max-retries 3
cr dispatch "$WORKER" --agent="$WORKER" --max-retries 3 --isolate
cr experience snapshot --out memory/experience_spectrum.json
```

`cr repo scan` reuses unchanged file metadata from the previous project map
with an `mtime + size` cache, so UI task creation does not need to reread every
source file on each run.

## Agent flow

Use Chạy Runtime as the runtime boundary. The main agent creates compact JSON notes, and worker agents read only those notes plus scoped source files.

```bash
# main/controller agent
cr setup --agents codex,anti --main anti
cr repo scan --root . --out .chay-index/project_map.json
cr context plan \
  --task "Fix duplicate apply service" \
  --index .chay-index/project_map.json \
  --out memory/context_package.json

# main/controller assigns a small worker task
cr workpack make \
  --worker codex \
  --goal "Fix duplicate apply service" \
  --allowed-files "src/applyService.js" \
  --out memory/codex_work_note.json

# worker/reviewer boundary checks
cr boundary check-note --file memory/task_note.json --kind task
cr boundary check-note --file memory/codex_work_note.json --kind work
cr dispatch codex --agent=codex --max-retries 3
```

`examples/agent-flow.sh` contains the same flow as a runnable script.

## Experience compression

Chạy Runtime supports the Experience Compression Spectrum pattern with three compact
layers:

- Memory: `task_note`, `context_package`, `plan_ledger`, and result notes.
- Skills: short procedural names in the work note.
- Rules: `policy_ref` pointing to `policies/chay_policy.json`.

Use `cr workpack make --compact` to avoid copying long policy/rule text into
each work note, and `cr experience snapshot` to inspect the memory/skills/rules
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
- dispatching a worker command with progress, result validation, optional test command, retry cap, and patch check
- pre-dispatch token compaction before worker execution
- compact experience compression work notes, plan ledger updates, and spectrum snapshots
- user-selected controller LLM, worker LLM, and worker skills
- realtime Chạy Console state without raw logs
- task/work/result note validation
- audit Markdown compilation
- patch boundary rejection for out-of-scope files and forbidden anti-patterns
- Claude integration creates `chay-main`, `chay-reviewer`, and `chay-<worker>-worker`

`npm run build` runs the smoke test and `npm pack --dry-run`.

## Claude Code integration

```bash
cr integration install --target claude --workers codex,antigravity
```

This creates `.claude/settings.json` and these agents:
- `chay-main`: controller that prepares notes and dispatches work
- `chay-<worker>-worker`: bounded worker for scoped code edits
- `chay-reviewer`: compact result-note reviewer

## Codex integration

```bash
cr integration install --target codex
```

Then use `CHAY_CODEX_INSTRUCTIONS.md` as the worker instruction. Dispatch uses
`codex exec --model <worker.llm>` when the work note has a model other than
`user-selected`.

## Antigravity integration

```bash
cr integration install --target antigravity
```

Then use `CHAY_ANTIGRAVITY_INSTRUCTIONS.md` as the worker instruction. Dispatch
uses `antigravity run --prompt-file <file> --model <worker.llm>` when the work
note has a model other than `user-selected`.

## Safety model

Chạy Runtime rejects:
- notes that are too long
- result notes that do not match schema
- patches that change too many files
- patches that add too many lines
- edits outside allowed files
- isolated worker edits outside allowed files before they reach the real project
- agents reading audit Markdown
- worker notes that omit architecture/SOLID rules
- large free-form result logs

The default dispatch path is a runtime guardrail, not an OS security sandbox:
it validates the worker result and full diff before accepting the patch. Use
`cr dispatch <worker> --isolate` to run the worker in a temporary scoped
workspace. Isolated dispatch copies only runtime notes, policy/schema files,
selected context files, and `allowed_files` into the workspace, validates the
full sandbox diff, then copies only `allowed_files` back to the real project
after the patch boundary passes.

Isolated dispatch prevents accidental out-of-scope writes from being copied
back into the real project. A hostile process with the same user permissions can
still read or write files outside the temporary workspace, so use an OS/container
sandbox for hard security boundaries.

Default token budgets are bounded but not overly tight:
- task/work notes: `maxNoteTokens` 1200
- result notes: `maxResultTokens` 900
- context planning: 5 selected files unless `--max-notes` is provided
- dispatch token compaction: `maxTokenCompactionPasses` 2

Before dispatching a worker, `cr dispatch` runs a token preflight loop. If the
task/context/work notes exceed policy budgets, it compacts the context package
and work note into policy references before spawning the worker. Use
`--no-auto-compact` to fail fast instead, or `--skip-token-check` when a human
has intentionally accepted a larger context.

When a worker returns invalid output, `cr boundary validate-output` returns a compact `retry_instruction`. The main/controller agent should send that instruction back to the worker and loop until the worker returns valid `result_note` JSON or reports `blocked`.

`cr dispatch <worker>` automates that worker loop for configured agents. It reads
`memory/<worker>_work_note.json`, runs the selected worker agent, writes live progress,
accepts JSON returned on stdout or in `memory/<worker>_result_note.json`, retries invalid
result notes up to `maxDispatchRetries` (default `3`), optionally runs
`--test-command "<command>"`, and then runs the patch boundary check before marking
the worker done. Dispatch also creates short-lived file locks for `allowed_files`,
which keeps overlapping workers from editing the same scoped file at the same time.

Progress steps are explicit about what dispatch is doing:
`assigned`, `reading`, `planning`, `editing`, `validate_result`, optional
`testing`, `patch_check`, `done`, or `blocked`. `validate_result` means schema
and contract validation for `result_note`; `testing` is only emitted when
`--test-command` is provided.
