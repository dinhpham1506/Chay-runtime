# Legacy `cr setup` Workflow

Use this only when you need the older bounded worker automation with a recorded main/controller agent and one or more workers.

For most users, prefer [`cr start`](start.md). `cr start` is simpler: it creates feature contracts and IDE handoff files for the chatbot you already use.

## When To Use Legacy Mode

Use `cr setup` if you need:

- `chay-memory/host_config.json`
- a main/controller agent plus worker agents
- `cr task`, `cr pack`, `cr run`, or `cr dispatch`
- retry loops around result-note validation
- optional isolated worker workspace copying

Do not use `cr setup` as the first onboarding path for new users.

## Setup

```bash
cr setup --agents codex,claude --main claude
cr setup --agents codex,anti --main anti
```

Any two supported agents can be selected from:

- `claude`
- `codex`
- `antigravity`

`anti` is accepted as a short alias for `antigravity`. If `--workers` is omitted, every enabled agent except `--main` becomes a worker.

`--main-llm` and `--worker-llms` are optional model labels, not login credentials. The matching CLI or IDE must already be installed and authenticated.

## Agent Flow

```bash
cr setup --agents codex,claude --main claude --workers codex
cr scan
cr plan "Fix duplicate apply service"
cr pack "Fix duplicate apply service" --worker codex --files src/applyService.js --compact
cr boundary check-note --file chay-memory/task_note.json --kind task
cr boundary check-note --file chay-memory/codex_work_note.json --kind work
cr run codex --max-retries 3
```

With a known feature graph:

```bash
cr graph "Fix duplicate apply service" --files src/applyService.js
cr task --from-graph chay-memory/feature_graph.json --compact
cr handoff
cr run codex
```

Without a graph:

```bash
cr task "Fix duplicate apply service" --files src/applyService.js --compact
cr run codex
```

Manual lower-level flow:

```bash
WORKER=codex
cr scan
cr plan "Fix duplicate apply service"
cr pack "Fix duplicate apply service" --worker "$WORKER" --files src/applyService.js --compact
cr boundary check-note --file chay-memory/task_note.json
cr boundary check-note --file "chay-memory/${WORKER}_work_note.json" --kind work
cr run "$WORKER" --max-retries 3
cr run "$WORKER" --max-retries 3 --isolate
cr experience snapshot --out chay-memory/experience_spectrum.json
```

`examples/agent-flow.sh` contains the same pattern as a runnable script.

## Integration Maturity

| Agent | Legacy role | Packaged integration |
| --- | --- | --- |
| Claude | main/controller or worker | Claude Code agents for `chay-main`, `chay-reviewer`, and `chay-<worker>-worker` |
| Codex | main/controller or worker | Worker instruction/template for bounded `cr run` tasks |
| Antigravity | main/controller or worker | Best-effort worker instruction/template; non-interactive runs require a local wrapper |

`host_config.json` can record any supported agent as main, but the packaged controller integration is currently most complete for Claude Code. Codex is supported as a bounded worker path. Antigravity is more fragile because it depends on a user-provided wrapper for non-interactive execution.

## Antigravity Caveat

Antigravity IDE currently manages chat and login in the GUI and does not expose a stable non-interactive `run --prompt-file --model` command.

For `cr run antigravity`, set:

```bash
CHAY_ANTIGRAVITY_COMMAND="your-antigravity-worker-command"
```

The wrapper must:

- read `CHAY_DISPATCH_PROMPT_FILE`
- perform the worker task
- write the required result note JSON

Treat Antigravity automation as best-effort until a stable official automation surface exists.

## Verify

```bash
cr check
cr auth
cr login codex
cr auth --agents codex,claude --login
```

`cr check` reports CLI presence, auth status, configured model/provider, and provider reachability where each tool exposes that information.
