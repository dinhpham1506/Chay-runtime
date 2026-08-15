# Changelog

All notable changes to Chay Runtime are documented here.

This project uses a pragmatic changelog format based on Keep a Changelog. Dates use `YYYY-MM-DD`.

## [Unreleased]

### Added

- Added a clearer GitHub Pages product page explaining what the repo does: feature contract creation, inferred runtime sequence, IDE AI handoff, direct chatbot rules, local-first console, and patch boundary verification.
- Added an SVG logo at `site/assets/chay-logo.svg` and wired it into the GitHub Pages navbar, favicon, Apple touch icon, Open Graph image, and Twitter image metadata.
- Added `CHANGELOG.md` and included it in the npm package files.

### Changed

- Updated README onboarding so the first screen explains the product, live GitHub Pages URL, npm package, quickstart, AI read order, verification flow, and generated artifacts.
- Clarified positioning as a feature-context runtime and IDE AI contract layer, not a generic coding orchestrator.
- Improved GitHub Pages copy so visitors can understand the repo without reading source code first.

### Fixed

- Fixed GitHub Pages motion state so the preview sidebar is driven by runtime animation classes instead of a hard-coded active state.
- Added an `IntersectionObserver` fallback so reveal animations do not leave sections hidden in older browsers.

## [0.1.0] - 2026-08-15

### Added

- Added the recommended `cr start` external IDE AI workflow.
- Added `cr go` to scan a repo, select scoped files, create feature contracts, generate folder/API structure, create PlantUML diagrams, write work notes, and refresh `ai_handoff.json`.
- Added feature contracts under `chay-structure/features/<feature_id>.md`.
- Added generated diagrams under `chay-structure/diagrams/`:
  - user/program flow
  - inferred sequence
  - API flowchart
- Added `chay-memory/feature_graph.json` as the machine-readable source of truth for feature flow, code targets, API links, inferred runtime sequence, and acceptance checks.
- Added `chay-memory/ai_handoff.json` as compact resume context for fresh Codex, Claude, Cursor, Kiro, GitHub Copilot, and IDE AI sessions.
- Added direct chatbot/rule installation through `cr chat install` and `cr chatbot install`.
- Added Codex Skill installation through `cr rules install --codex-skill`.
- Added IDE rule templates for Codex, Cursor, GitHub Copilot, Kiro, Windsurf, Claude Code, and Antigravity instruction files.
- Added `cr verify` / patch boundary checks for allowed files, sensitive paths, human-owned paths, forbidden patterns, changed-file count, and patch size.
- Added isolated worker validation for bounded `cr run --isolate` workflows.
- Added real untracked-file diff generation so new untracked files are checked by forbidden-pattern and patch-size guardrails.
- Added CI workflow, GitHub Pages deploy workflow, issue templates, and `CONTRIBUTING.md`.
- Added separate docs for:
  - recommended `cr start` workflow
  - legacy `cr setup` workflow
  - C4 architecture model
  - experience compression

### Changed

- Split recommended `cr start` onboarding from legacy `cr setup` docs to reduce confusion for new users.
- Replaced generic feature sequence diagrams with `Inferred Runtime Sequence` output built from selected targets, detected API routes, relative imports, and file roles.
- Added confidence, evidence, unknowns, and human-review notes to runtime sequence inference.
- Included `runtime_sequence` in handoff source-of-truth data.
- Updated README and project docs to state clearly that Chay Runtime is a runtime guardrail, not an OS sandbox.
- Updated Claude templates from stale `memory/` paths to `chay-memory/`.
- Clarified Antigravity integration as best-effort and wrapper-based for non-interactive execution.

### Fixed

- Fixed deleted-file diff analysis by reading paths from `diff --git a/... b/...` headers, including deletions and renames.
- Fixed untracked-file validation so real file contents are scanned instead of a synthetic placeholder line.
- Fixed UI worker spawn file descriptor handling by closing the parent log file descriptor after `spawn()`.
- Added smoke coverage for deleted sensitive files, unsafe untracked files, stale template paths, UI file descriptor cleanup, Case A/B/C positioning, direct chatbot install, and inferred runtime sequence output.

### Security

- Documented the security boundary clearly: Chay Runtime is a runtime guardrail, not absolute containment.
- Sensitive paths, forbidden patterns, human-owned files, and out-of-scope changes are rejected by patch validation.
- For hard isolation, users should run untrusted worker commands inside a container, VM, or OS sandbox.
