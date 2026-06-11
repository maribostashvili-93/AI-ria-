# ai-ria

**AI RIA — Git for AI context and memory.** An intelligence layer for AI coding agents.

Not another agent: a CLI + MCP server that enters an existing project, compresses its context, keeps persistent agent memory, and builds handoffs and agent packs — so the next AI agent (Claude, Cursor, Codex, …) starts fully informed at a fraction of the token cost. All outputs land in the target repo's **`.ria/`** folder, ready for any agent to consume.

```
Git Repo / Agent Conversation / Figma / DESIGN.md
        ↓
      AI RIA
        ↓
Compressed Agent Pack  (.ria/agent-pack/AGENT_PACK.md)
        ↓
    Next Agent
```

## Core Workflow

```bash
pnpm ria analyze <project>                                    # repo intelligence → .ria/
pnpm ria context build <project>                              # compressed context + token report
pnpm ria memory compress-conversation <project> ./conv.txt    # conversation → durable memory
pnpm ria handoff create <project> --task "Improve checkout"   # handoff for the next agent
pnpm ria design-pack <project>                                # design rules for UI agents
pnpm ria agent-pack <project>                                 # THE file the next agent reads
pnpm ria pack compact <project>                               # budgeted export (claude|cursor|codex|compact)
```

The next agent reads only `.ria/agent-pack/AGENT_PACK.md`. If it needs more, it reads `.ria/memory/deep-memory.md`.

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
| v0.1 Context Engine | `ria context build <path> [--budget N]` | `context/context-pack.md/.json`, `context/token-report.json` — ranked critical files, a reason per keep/drop, raw vs compressed tokens |
| v0.1 Agent Memory | `ria memory add <path> --title "..." [--type decision]` | `memory/memories.jsonl`, `memory/memory-index.json` — types: decision, task, design-rule, architecture-note, warning, security-note, figma-note |
| v0.1 Agent Memory | `ria memory search <path> "query"` / `ria memory list <path>` | search/list over project memory |
| v0.1 Agent Memory | `ria memory short <path>` / `ria memory deep <path>` / `ria memory compress <path>` | `memory/short-memory.md`, `working-memory.md`, `deep-memory.md`, `summary.md` |
| v0.1 Agent Memory | `ria memory compress-conversation <path> <file>` | `memory/conversation-summary.md` + decisions/warnings saved as memories (claude-mem-style observe→compress→store) |
| v0.1 Handoff | `ria handoff create <path> --task "..." [--completed a,b] [--remaining c] [--avoid payment.js] [--next-action "..."]` | `handoffs/latest-handoff.json`, `handoffs/HANDOFF.md` — memory decisions and design rules injected automatically |
| v0.1 Handoff | `ria handoff load <path>` | prints the latest handoff as agent-ready markdown |
| v0.1 Agent Pack | `ria agent-pack <path>` | `agent-pack/AGENT_PACK.md` + `agent-pack.json` — combines context, short memory, handoff, design pack, security warnings |
| v0.1 Provider Packs | `ria pack claude\|cursor\|codex\|compact <path>` | `exports/<PROVIDER>_CONTEXT.md` — per-agent token budgets (12k/8k/6k/2.5k); always says what was removed |
| v0.2 Figma Import | `ria figma import <path> <tokens.json>` | `figma/figma-tokens.json`, `figma/FIGMA_SUMMARY.md` + merged into `design-memory.json` (colors, typography, spacing, radius, shadows, components) |
| v0.2 Figma Codegen | `ria figma generate-code <path>` | `figma/generated/` — draft HTML/CSS + Tailwind suggestions (starter code, not production) |
| v0.2 DESIGN.md Bridge | `ria design-md import <path> <DESIGN.md>` / `ria design-pack <path>` | rules + tokens into design memory; `design/DESIGN_PACK.md` for UI agents |
| v0.1 Token Accounting | `ria tokens report <path>` | `tokens/TOKEN_REPORT.md`, `tokens/token-summary.json` — raw vs compressed vs saved tokens, by agent/task/pack, budget warnings |
| v0.1 Token Accounting | `ria tokens agent <path> <name>` / `ria tokens compare <path>` | per-agent usage; pack sizes vs every agent's preferred budget |
| v0.1 Token Accounting | `ria tokens budget <path> --agent claude --limit 200000` | `tokens/budgets.json` — custom token limits per agent |
| v0.2 UI/UX Planning | `ria plan-ui <path> --goal "Build dashboard UI for LMS platform"` | `design/UI_PLAN.md`, `design/DESIGN.md`, `design/DESIGN_PACK.md`, `agent-pack/VISUAL_AGENT_PACK.md`, `orchestration/agent-routing.json` — project type, pages, components (purpose/rules/hints/Tailwind/security), agents + budgets |
| v0.2 Design Suggest | `ria design suggest <path> --goal "LMS dashboard"` | style direction + `design/DESIGN.md` + compact visual pack (awesome-design-md / design.md-style structure) |
| v0.4 Orchestrate | `ria orchestrate <path> --goal "..."` | plan + compress + all packs for routed agents + token report in one run |
| v0.1 Repository Scanner | `ria scan <path>` | `repo-map.json`, `repo-summary.md` — framework (Next.js/React/Vue/Astro/…), package manager, routes, components, styles, configs |
| v0.1 Repo Brain | `ria analyze <path>` | `ARCHITECTURE.md`, `FEATURES.md`, `AGENTS.md`, `AGENT