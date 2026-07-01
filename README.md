# chay-runtime

chay-runtime is a note-based policy runtime for multi-agent coding CLIs.

## Core idea

- Agents read compact JSON notes from `memory/*.json`.
- Humans inspect Markdown notes from `audit/*.md`.
- Boundary tools validate note size, output schema, patch size, and scope.
- Architecture rules require workers to follow existing design patterns and SOLID principles.
- Repo intelligence selects a small context package before agents read code.
- Claude can act as the main controller.
- Codex and Antigravity can act as bounded workers.

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

Non-interactive setup:

```bash
cr setup \
  --agents claude,codex \
  --main claude \
  --main-llm sonnet \
  --workers codex \
  --worker-llms codex:gpt-5 \
  --skills repo_search,context_reading,solid_refactor,test_runner,patch_guard,minimal_patch
```

After setup, `cr workpack make --worker codex ...` automatically uses `memory/host_config.json` for controller, worker LLM, and skills unless flags override them.

Native workflow UI:

```bash
cr ui serve --port 7770
```

Open `http://127.0.0.1:7770`. The UI shows workflow columns, agents, task state, selected files, and chat. The maintainable console template lives at `site/console.html`; `src/commands/ui.js` only serves the file and owns the local API.
It polls `/api/state` and writes chat to `memory/chat/messages.json`.
The same UI can create compact tasks, spawn `cr dispatch` in the background,
stream progress over Server-Sent Events, and show the plan ledger / experience
compression snapshot.

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
cr setup --agents claude,codex --main claude --main-llm sonnet --workers codex --worker-llms codex:gpt-5
cr task
```

Or one line:

```bash
cr task "Fix duplicate job apply bug"
cr task "Fix duplicate job apply bug" --compact --max-notes 2
```

Manual flow:

```bash
cr repo scan --root . --out .chay-index/project_map.json
cr context plan --task "Fix duplicate job apply bug" --out memory/context_package.json
cr workpack make \
  --worker codex \
  --goal "Fix duplicate job apply bug" \
  --compact \
  --out memory/codex_work_note.json
cr boundary check-note --file memory/task_note.json
cr boundary check-note --file memory/codex_work_note.json --kind work
cr dispatch codex --agent=codex --max-retries 3
cr experience snapshot --out memory/experience_spectrum.json
```

`cr repo scan` reuses unchanged file metadata from the previous project map
with an `mtime + size` cache, so UI task creation does not need to reread every
source file on each run.

## Agent flow

Use Chạy Runtime as the runtime boundary. The main agent creates compact JSON notes, and worker agents read only those notes plus scoped source files.

```bash
# main/controller agent
cr setup --agents claude,codex --main claude --main-llm sonnet --workers codex --worker-llms codex:gpt-5 --skills repo_search,context_reading,solid_refactor,test_runner,patch_guard,minimal_patch
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

`npm test` runs a smoke project in a temp directory and verifies:
- project initialization
- repo scan and context planning
- workpack generation for a smaller `codex` worker
- dispatching a worker command with progress, result validation, retry cap, and patch check
- compact experience compression work notes, plan ledger updates, and spectrum snapshots
- user-selected controller LLM, worker LLM, and worker skills
- realtime Chạy Console state without raw logs
- task/work/result note validation
- audit Markdown compilation
- patch boundary rejection for out-of-scope files and forbidden anti-patterns
- Claude integration creates `chay-main`, `chay-codex-worker`, and `chay-reviewer`

`npm run build` runs the smoke test and `npm pack --dry-run`.

## Claude Code integration

```bash
cr integration install --target claude
```

This creates `.claude/settings.json` and these agents:
- `chay-main`: controller that prepares notes and dispatches work
- `chay-codex-worker`: bounded worker for scoped code edits
- `chay-reviewer`: compact result-note reviewer

## Codex integration

```bash
cr integration install --target codex
```

Then use `CHAY_CODEX_INSTRUCTIONS.md` as the worker instruction.

## Antigravity integration

```bash
cr integration install --target antigravity
```

Then use `CHAY_ANTIGRAVITY_INSTRUCTIONS.md` as the worker instruction.

## Safety model

Chạy Runtime rejects:
- notes that are too long
- result notes that do not match schema
- patches that change too many files
- patches that add too many lines
- edits outside allowed files
- agents reading audit Markdown
- worker notes that omit architecture/SOLID rules
- large free-form result logs

Default token budgets are bounded but not overly tight:
- task/work notes: `maxNoteTokens` 1200
- result notes: `maxResultTokens` 900
- context planning: 5 selected files unless `--max-notes` is provided

When a worker returns invalid output, `cr boundary validate-output` returns a compact `retry_instruction`. The main/controller agent should send that instruction back to the worker and loop until the worker returns valid `result_note` JSON or reports `blocked`.

`cr dispatch <worker>` automates that worker loop for configured agents. It reads
`memory/<worker>_work_note.json`, runs the selected worker agent, writes live progress,
accepts JSON returned on stdout or in `memory/<worker>_result_note.json`, retries invalid
result notes up to `maxDispatchRetries` (default `3`), and then runs the patch boundary
check before marking the worker done. Dispatch also creates short-lived file locks for
`allowed_files`, which keeps overlapping workers from editing the same scoped file at
the same time.
