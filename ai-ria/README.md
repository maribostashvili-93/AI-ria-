# ai-ria

**AI RIA — Runtime Intelligence Assistant.** An intelligence layer for AI coding agents.

Not another agent: a CLI + MCP server that gives agents compact, structured knowledge about a repository — its architecture, design system, and security posture — at a fraction of the token cost of reading raw files. All outputs land in the target repo's **`.ria/`** folder, ready for any agent to consume.

## Quick Start (clone experience)

```bash
pnpm install
pnpm build

# One command generates the complete .ria/ knowledge folder:
pnpm ria analyze ./examples/demo-app

# Or run the phases individually:
pnpm ria scan ./examples/demo-app
pnpm ria compress ./examples/demo-app
pnpm ria design ./examples/demo-app
pnpm ria security ./examples/demo-app
```

Then point it at your own project:

```bash
pnpm ria analyze ../your-project
```

After that, `your-project/.ria/` contains:

```
.ria/
├── repo-map.json          ← machine-readable repo intelligence
├── repo-summary.md
├── ARCHITECTURE.md        ← agent-readable knowledge map
├── FEATURES.md
├── DESIGN.md              ← generated design contract
├── AGENTS.md              ← working rules for agents
├── AGENT_CONTEXT.md       ← token-cheap entry point for agents
├── context-pack.md/.json  ← compressed full context
├── SECURITY_REPORT.md/.json
└── summary.json           ← one machine-readable rollup
```

`pnpm test` runs the Vitest suite (35 tests). `pnpm dev <command>` runs the CLI without building.

## Using It With Your AI Agent

AI RIA prepares context for other AI agents. After `ria analyze`, tell Cursor / Claude Code / Codex:

> Before editing this project, read `.ria/AGENT_CONTEXT.md`, `.ria/DESIGN.md` and `.ria/ARCHITECTURE.md`. Follow `.ria/AGENTS.md` rules.

The agent gets the whole project's knowledge for a few hundred tokens instead of re-reading the repo. Real measurement: on this repository itself, the context pack is ~2,400 tokens vs ~42,000 raw — a 94% reduction.

## Commands by Version

| Version | Command | Output in `.ria/` |
|---|---|---|
| v0.1 Repository Scanner | `ria scan <path>` | `repo-map.json`, `repo-summary.md` — framework (Next.js/React/Vue/Astro/…), package manager, routes, components, styles, configs |
| v0.1 Repo Brain | `ria analyze <path>` | `ARCHITECTURE.md`, `FEATURES.md`, `AGENTS.md`, `AGENT_CONTEXT.md` |
| v0.1 Context Compression | `ria compress <path>` | `context-pack.md/.json` — ignores junk dirs, dedupes, summarizes long files, enforces a token budget (never includes `.env`) |
| v0.2 DESIGN.md Generator | `ria design <path>` | `DESIGN.md` — colors, typography, spacing, radius, components, layout rules |
| v0.3 Agent Skills | `ria skill <name> <path>` | `SKILL_<name>.md` — runnable skills with input/steps/checks/output/evidence: `ui-review`, `security-review`, `code-review`, `compress` |
| v0.3 Security Brain | `ria security <path>` | `SECURITY_REPORT.md/.json` — exposed `.env`, hardcoded keys, `curl \| sh`, dangerous commands, dependency risks, prompt injection in agent files. **Scan-and-report only.** Exits 1 on high/critical |
| v0.2 Figma Bridge | `ria figma connect` / `extract` / `compare` | `figma-tokens.json`, `figma-components.json`, `figma-design-summary.md`, `FIGMA_CODE_DIFF.md` |
| v0.4 UI Patch Preview | `ria ui-fix <path> --preview` | `ui-fix.patch`, `UI_FIX_REPORT.md` — suggestions only, never rewrites files |
| v0.1 MCP Server | `ria mcp` | stdio server exposing all capabilities to agents |

Every command accepts `--json` for machine output. `ria summary <path>` prints the one-screen compressed context to stdout.

## Figma Integration

```bash
export FIGMA_TOKEN=...           # Figma → Settings → Security → personal access token
ria figma connect                # verify the token
ria figma extract ./my-app --file <FILE_KEY>     # API mode
ria figma extract ./my-app --from export.json    # offline mode (try examples/figma-export.json)
ria figma compare ./my-app       # → .ria/FIGMA_CODE_DIFF.md
ria ui-fix ./my-app --preview    # → patch suggestions aligned with Figma
```

Pipeline: `Figma API/MCP → adapter → figma-tokens.json → DESIGN.md → consistency check → patch preview`.

## MCP Server (Cursor, Claude Code, Windsurf, …)

```bash
ria mcp
```

Exposed tools: `repo_scan`, `repo_analyze`, `context_compress`, `design_generate`, `figma_extract`, `figma_compare`, `security_scan`, `skill_run`.

Example client config (`.mcp.json`):

```json
{
  "mcpServers": {
    "ai-ria": { "command": "npx", "args": ["-y", "tsx", "src/cli/index.ts", "mcp"] }
  }
}
```

## Module Map

| Directory | Purpose |
|---|---|
| `src/cli/` | Commander.js CLI |
| `src/core/` | Zod schemas + `.ria/` path helpers |
| `src/repo/` | Scanner + analyzer/repo brain (v0.1) |
| `src/compression/` | Token estimation, summary, context pack (v0.1) |
| `src/design/` | Token analyzer, DESIGN.md generator (v0.2), ui-fix (v0.4) |
| `src/figma/` | Figma adapter + diff (v0.2) |
| `src/skills/` | Executable skill runtime (v0.3) |
| `src/security/` | Security brain (v0.3) |
| `src/mcp/` | MCP server (v0.1) |
| `src/output/` | Markdown/JSON renderers |
| `tests/` | Vitest suite |
| `examples/demo-app/` | Intentionally imperfect fixture for the clone experience |
| `examples/figma-export.json` | Offline Figma file for `--from` mode |

Note: `examples/demo-app` contains intentionally insecure fixture files (fake `.env`, unsafe `deploy.sh`, a prompt-injection line in `AGENTS.md`) so that `ria security` has something real to find. Don't run its scripts.

## Project Docs

Vision, roadmap, architecture, and principles live in the parent folder's `docs/`.
