# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Project inference.** `plan-ui` and `orchestrate` now derive the plan from
  the repository instead of a keyword template: routes become pages, existing
  component files become components to reuse rather than rebuild, the project's
  own CSS custom properties become the palette, and dependencies and file paths
  decide which flows need a security review (`stripe` → payments, `next-auth` →
  sessions, `prisma` → personal data). The template is now a fallback that
  carries greenfield projects only. Every plan records the source of each part
  (`repository routes` vs `template`) in `UI_PLAN.md`, `agent-routing.json` and
  the CLI output, so it can be audited rather than trusted.

### Changed

- Template matching weighs the goal above the project description and matches
  whole words. A README mentioning "dashboard" or "platform" used to outvote the
  goal the user typed, and `crm` matched inside `crumbs`.
- `orchestrate` scans the repository once and shares the map with planning,
  compression and the security pass.

### Fixed

- CI could not install: pnpm 11 requires Node >= 22.13 while the workflow pinned
  Node 20 to match `engines`. Now installs with pnpm 10 and runs the full verify
  across a Node 20 + 22 matrix, so the declared minimum is actually tested.

## [0.2.0] — 2026-07-29

First public release.

### Added

- **Context compression** — `ria analyze`, `ria compress`, `ria context build`:
  ranked, semantically compressed context packs with a per-run token report.
- **Layered memory** — short / working / deep memory, a searchable JSONL store,
  an importance-weighted memory graph, and conversation compression.
- **Agent handoff** — structured `handoffs/latest.json` + `HANDOFF.md` with
  decisions and design rules injected automatically.
- **Agent pack** — `AGENT_PACK.md`, the single file the next agent reads.
- **Provider packs** — `ria pack claude|cursor|codex|compact|visual|security`,
  each with its own token budget; the pack always states what was dropped.
- **Figma bridge** — API mode plus tokenless import of plugin/MCP exports,
  `figma to-design-md`, and draft code generation.
- **Security intelligence** — secrets, unsafe shell commands, suspicious install
  hooks, prompt injection in agent-instruction files, unpinned dependencies.
  Scan-and-report only; nothing is ever executed.
- **Orchestration** — `ria orchestrate --goal "…"` plans, routes agents and
  builds exactly the packs the routed agents need.
- **Studio** — `ria studio`, a local read-only dashboard over `.ria/` with a
  live JSON API, auto-discovered brand logo and GSAP motion that respects
  `prefers-reduced-motion`.
- **MCP server** — `ria mcp` exposes the tools to any MCP-capable agent.
- **Token accounting** — per-agent ledger, budgets and reports.
- CI (typecheck, lint, build, tests, self security scan), ESLint config,
  `LICENSE`, `CONTRIBUTING.md`.

### Fixed

- **Conversation compression grew the input.** Each line was matched against
  seven category regexes and written to every bucket it matched, so a summary
  could be several times larger than the conversation while still reporting a
  "compression ratio". Lines are now classified into exactly one category
  (explicit labels first, keywords second), near-duplicates collapse, and a
  token budget caps the result. A 1,549-token sample went from 11,017 tokens
  (ratio 7.11) to 102 tokens (ratio 0.066).
- **Security findings were mostly fixtures.** Tests, examples and the scanner's
  own rule definitions were being reported as vulnerabilities, and
  `ria security` exited non-zero on them — so it could never pass CI. Fixture
  paths are excluded by default (`--include-fixtures` restores them), lines
  marked `ria-security-ignore` are skipped, and `--fail-on <severity>` controls
  the exit code. On a 2,280-file project this went from 71 findings
  (13 critical/high) to 5 (3 critical/high).
- **Token savings were counted once per run instead of once per pack.** The
  ledger is append-only, so re-running `orchestrate` kept adding the same saving
  and reported totals larger than the repository itself (31M "saved" tokens for
  a 2.59M-token repo). Totals now describe the current set of packs and are
  stable across re-runs.
- **Duplicate memories.** Memory ids included the creation timestamp, so saving
  the same decision twice always created a new entry and repeated
  `memory compress-conversation` runs flooded the agent pack. Ids are now
  content-addressed and identical entries collapse.
- **Redundant disk scans.** `ria analyze` walked and read the entire repository
  four times (scan, design, security, compression). It now scans once and passes
  the `RepoMap` down.
- Version drift between `package.json`, `ria --version`, `summary.json` and the
  Studio "About" page — all now read a single source.
- Truncated final row in the CLI reference table.

[Unreleased]: https://github.com/maribostashvili-93/AI-ria-/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/maribostashvili-93/AI-ria-/releases/tag/v0.2.0
