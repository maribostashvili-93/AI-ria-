# AI RIA Plugin System

AI RIA is an Agent Intelligence Layer that compresses context, preserves memory, routes agents, converts Figma into DESIGN.md, and visualizes project memory, tokens, security, and design knowledge.

This document is the target shape of the system: a small core plus focused plugins, all writing to the shared `.ria/` knowledge layer, topped by a visual dashboard.

```text
AI RIA Core
├── Token Compressor Plugin
├── Memory Plugin
├── Visual Memory Plugin
├── Figma Plugin
├── Security Plugin
├── Agent Router Plugin
├── Handoff Plugin
└── Studio Dashboard
```

## 1. Core

The core does:

```text
project scan
context compression
agent pack creation
memory save
token accounting
safe mode
```

Commands:

```bash
ria init <project>
ria analyze <project>
ria orchestrate <project> --goal "..."
ria agent-pack <project>
```

## 2. Token Compressor Plugin

The headline feature.

```bash
ria context build <project>
ria tokens report <project>
```

Creates:

```text
.ria/context/context-pack.md
.ria/tokens/TOKEN_REPORT.md
```

Shows:

```text
Raw tokens: 300,000
Compressed: 12,000
Saved: 288,000
Savings: 96%
```

## 3. Memory Plugin

Agent conversations and decisions persist across sessions.

```bash
ria memory add <project>
ria memory search <project> "button design"
ria memory graph <project>
```

Creates:

```text
.ria/memory/short-memory.md
.ria/memory/deep-memory.md
.ria/memory/memory-graph.json
```

## 4. Visual Memory Plugin

Design knowledge stored as connected chains:

```text
Design decision
↓
Component
↓
Figma node
↓
Code file
↓
Agent task
```

```bash
ria visual memory <project>
ria visual graph <project>
```

Files:

```text
.ria/visual/
├── visual-memory.json
├── component-map.json
├── VISUAL_MEMORY.md
└── design-graph.json
```

## 5. Figma Plugin

Turns Figma design into agent-readable form.

```bash
ria figma import <project> figma-export.json
ria figma to-design-md <project>
ria design-pack <project>
ria pack visual <project>
```

Creates:

```text
.ria/design/DESIGN.md
.ria/design/DESIGN_PACK.md
.ria/exports/VISUAL_CONTEXT.md
```

Inside:

```text
colors
typography
spacing
components
layout rules
responsive rules
implementation hints
```

## 6. Security Plugin

For the security agent.

```bash
ria security <project>
ria pack security <project>
```

Creates:

```text
.ria/SECURITY_REPORT.md
.ria/exports/SECURITY_CONTEXT.md
```

Checks:

```text
.env
API keys
tokens
dangerous scripts
unsafe commands
sensitive files
prompt injection risks
```

## 7. Agent Router Plugin

AI RIA decides which agents the project needs.

```bash
ria orchestrate <project> --goal "Build UI from Figma"
```

Creates:

```text
.ria/orchestration/agent-routing.json
.ria/orchestration/ORCHESTRATION.md
```

For example:

```text
visual-agent needed
code-agent needed
security-agent needed
documentation-agent optional
```

## 8. Visual Dashboard / AI RIA Studio

The visual layer.

```bash
ria studio <project>
```

Opens locally:

```text
http://localhost:3333
```

Pages:

```text
Dashboard
Memory Graph
Agent Graph
Visual Memory
Design System
Token Savings
Security Map
Figma Components
```

Technology:

```text
Next.js
React Flow
Tailwind
Mermaid
JSON graph files
```

Sidebar:

```text
- Overview
- Memory Graph
- Agent Routing
- Visual Memory
- Figma Design
- Token Usage
- Security
- Handoffs
```

## Main Workflow

```bash
ria init <project>
ria orchestrate <project> --goal "Build UI from Figma"
ria figma import <project> figma-export.json
ria figma to-design-md <project>
ria pack visual <project>
ria pack security <project>
ria memory graph <project>
ria studio <project>
```

Result:

```text
AI RIA creates:
- compressed context
- visual agent pack
- security agent pack
- memory graph
- design graph
- token report
- visual dashboard
```

## Build Order

1. ✅ **Visual Memory JSON + graph files** — `ria visual memory` / `ria visual graph` (the data layer Studio reads)
2. ✅ **`ria studio` dashboard v1** — zero-dependency embedded server + SPA over live `/api/*` JSON (all 8 pages)
3. **Studio v2** — Next.js + React Flow + Tailwind frontend on the same `/api/*` contract, once interactivity outgrows the embedded page

## Related Documents

- [Vision](Vision.md) · [Architecture](Architecture.md) · [Roadmap](Roadmap.md) · [Principles](Principles.md)
