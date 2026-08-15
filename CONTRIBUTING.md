# Contributing

Thanks for helping improve Chay Runtime.

## Project Direction

Chay Runtime is feature-centric:

- before code: create feature memory with user flow, inferred runtime sequence, API/code relation, folder map, acceptance checks, and code targets
- after code: verify the patch stayed inside the feature boundary

Prefer changes that make this loop clearer, smaller, or more reliable. Avoid broad framework rewrites or new integrations unless they are backed by tests and a clear user workflow.

## Development

```bash
npm install
npm test
npm run build
```

`npm test` runs smoke projects in temporary directories. `npm run build` runs the smoke test and `npm pack --dry-run`.

## Pull Requests

Keep PRs focused. A good PR usually includes:

- the user-facing problem
- the command or workflow affected
- tests for changed behavior
- documentation updates when CLI behavior changes

For feature graph changes, include a smoke test that reads `chay-memory/feature_graph.json` or generated `chay-structure` files.

## Safety Boundary

Chay Runtime is a runtime guardrail, not an OS sandbox. Do not describe it as absolute containment. For untrusted worker commands, document `--isolate` plus container/VM/OS sandbox recommendations.

## Issue Triage

Useful reports include:

- `cr --version` or package version
- Node version
- operating system
- command run
- expected behavior
- actual behavior
- sanitized output or generated Chay Runtime files when relevant

Do not attach secrets, `.env`, credentials, raw logs, or full prompts.
