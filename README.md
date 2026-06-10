# AI RIA

<div align="center">
  <img src="./assets/airialogo.png" alt="AI RIA logo" width="520" />

  <p><strong>Runtime Intelligence for AI Agents</strong></p>
  <p>
    Open-source infrastructure that gives AI coding agents
    <strong>Context Compression</strong>,
    <strong>Agent Memory</strong>,
    <strong>Agent Handoff</strong>,
    <strong>Figma Intelligence</strong>,
    <strong>Repo Intelligence</strong>, and
    <strong>Security Intelligence</strong>.
  </p>

  <p>
    <a href="./docs/Vision.md">Vision</a> •
    <a href="./docs/Architecture.md">Architecture</a> •
    <a href="./docs/Roadmap.md">Roadmap</a> •
    <a href="./ai-ria/README.md">CLI Docs</a>
  </p>
</div>

---

<div align="center">
  <h2>🚀 GitHub-Style Hero</h2>
  <p>
    <strong>AI RIA is not another agent.</strong><br />
    It is the intelligence layer between agents and the repositories they work on.
  </p>
</div>

AI agents are fast, but they still waste tokens re-reading code, lose decisions between sessions, drift from design systems, and hand work off poorly. AI RIA solves that at the infrastructure level by generating a persistent `.ria/` knowledge layer any agent can consume.

## ✨ What AI RIA Does

| Capability | What it means in practice |
| --- | --- |
| 🗜️ Context Compression | Turns large repos into token-cheap context packs agents can actually afford |
| 🧠 Agent Memory | Stores decisions, rules, warnings, and design knowledge across sessions |
| 🤝 Agent Handoff | Produces structured handoff files so one agent can resume another agent's work without loss |
| 🎨 Figma Intelligence | Connects design files to code, tokens, components, and UI consistency checks |
| 🗂️ Repo Intelligence | Builds architecture, feature, route, component, and convention awareness from the repo itself |
| 🔐 Security Intelligence | Scans for secrets, risky patterns, unsafe commands, and agent-generated security issues |

## 📌 Short Project Description

AI RIA is an open-source CLI and MCP-ready intelligence layer for AI coding workflows. It analyzes a repository, compresses its working context, preserves cross-agent memory, bridges design-to-code with Figma-aware outputs, and produces security-aware agent guidance inside a portable `.ria/` folder.

## 🧭 Why It Exists

| Problem | AI RIA Response |
| --- | --- |
| Agents repeatedly burn tokens on the same repo | Generate compressed context once and reuse it |
| Sessions forget architecture decisions | Save durable project memory and searchable decisions |
| Multi-agent work creates duplicate effort | Use shared memory plus structured handoffs |
| Generated UI drifts from design systems | Build design memory and compare code against Figma |
| Agent output can introduce risk | Run security scanning before changes land |

## 🏗️ Architecture

```mermaid
flowchart TD
    A[AI Agents<br/>Codex • Cursor • Claude Code • Custom Agents]
    B[Open Protocol Layer<br/>CLI • MCP • APIs]
    C[AI RIA Core]
    D[Repo Intelligence]
    E[Context Compression]
    F[Agent Memory]
    G[Agent Handoff]
    H[Figma Intelligence]
    I[Security Intelligence]
    J[Knowledge Layer<br/>.ria outputs]
    K[Repositories]
    L[Design Files]
    M[Docs and Policies]

    A --> B --> C
    C --> D
    C --> E
    C --> F
    C --> G
    C --> H
    C --> I
    D --> J
    E --> J
    F --> J
    G --> J
    H --> J
    I --> J
    K --> D
    K --> E
    K --> I
    L --> H
    M --> F
    M --> I
```

### Core Flow

| Layer | Responsibility |
| --- | --- |
| Agent Layer | Any coding agent can consume the outputs |
| Protocol Layer | CLI and MCP expose RIA capabilities without vendor lock-in |
| Intelligence Modules | Repo, compression, memory, handoff, Figma, and security modules do the heavy lifting |
| Knowledge Layer | All generated outputs land in `.ria/` for reuse by any agent |

## 🛠️ Installation

AI RIA currently ships as a Node.js CLI inside [`ai-ria`](./ai-ria/README.md).

### Requirements

| Tool | Version |
| --- | --- |
| Node.js | `>=20` |
| npm / pnpm | Any modern version |

### Setup

```bash
cd ai-ria
npm install
npm run build
```

### Run Without Global Install

```bash
npm run ria -- analyze ./examples/demo-app
```

### Optional: Local CLI Shortcut

```bash
npx tsx src/cli/index.ts --help
```

## 💻 CLI Usage Examples

### Quick Start

```bash
cd ai-ria
npm install
npm run build

# Generate the complete intelligence layer for a repo
npm run ria -- analyze ./examples/demo-app
```

### Common Commands

| Goal | Command | Output |
| --- | --- | --- |
| Scan a repo | `npm run ria -- scan ./my-app` | `.ria/repo-map.json`, `.ria/repo-summary.md` |
| Generate full intelligence pack | `npm run ria -- analyze ./my-app` | Full `.ria/` knowledge folder |
| Compress context | `npm run ria -- compress ./my-app` | `.ria/context-pack.md`, `.ria/context-pack.json` |
| Generate design knowledge | `npm run ria -- design ./my-app` | `.ria/DESIGN.md` |
| Run security scan | `npm run ria -- security ./my-app` | `.ria/SECURITY_REPORT.md`, `.ria/security-report.json` |
| Save project memory | `npm run ria -- memory save ./my-app --task "Navbar refactor" --decision "Moved navbar to shared layout"` | `.ria/memory/*.json` |
| Create handoff | `npm run ria -- handoff create ./my-app --task "Checkout improvements"` | `.ria/handoffs/latest.json` |
| Start MCP server | `npm run ria -- mcp` | MCP server over stdio |

### Figma Workflow

```bash
# Verify token
npm run ria -- figma connect

# Extract from a local export
npm run ria -- figma extract ./my-app --from ./examples/figma-export.json

# Compare design tokens against code
npm run ria -- figma compare ./my-app
```

## 🧪 Real Project Example: LearnSpace Assistant Program

AI RIA was run against a real local project: `asistentprogram`, a Vite + React learning assistant app with role-based routing, room pages, dashboards, and authentication context.

### 1. Analyze the repository

```bash
cd ai-ria
npm run ria -- analyze "C:\samushao\ასისტენტის როლი\asistentprogram"
```

### 2. Real output summary

| Metric | Result |
| --- | --- |
| Framework | `React` |
| Package manager | `npm` |
| Files scanned | `38` |
| Total lines | `4652` |
| Routes detected | `9` |
| Components detected | `20` |
| Stylesheets detected | `1` |
| Design tokens detected | `0` |
| Security findings | `0` |
| Context pack | `~5858 tokens` vs `~32351 raw` |

### 3. Generated output

```text
C:\samushao\ასისტენტის როლი\asistentprogram\.ria\
├── AGENT_CONTEXT.md
├── AGENTS.md
├── ARCHITECTURE.md
├── DESIGN.md
├── FEATURES.md
├── SECURITY_REPORT.md
├── context-pack.json
├── context-pack.md
├── repo-map.json
├── repo-summary.md
├── security-report.json
└── summary.json
```

### 4. What AI RIA understood about the app

| Area | What AI RIA detected |
| --- | --- |
| App type | Learning assistant / dashboard-style React app |
| Routing | Public, protected, and role-based routes |
| Feature areas | Main hub, video room, materials room, assignment room, help room |
| Access model | Login flow plus assistant/admin route separation |
| Architecture signals | `src/` layout, React components, context-based auth, Vite setup |

### 5. What the next agent gets

| File | Why it matters |
| --- | --- |
| `.ria/AGENT_CONTEXT.md` | Fast onboarding context for the repo |
| `.ria/ARCHITECTURE.md` | High-level repo structure and navigation points |
| `.ria/FEATURES.md` | Feature inventory and page coverage |
| `.ria/DESIGN.md` | Current design-system understanding from code |
| `.ria/context-pack.md` | Compressed repo context for token-efficient agent use |
| `.ria/SECURITY_REPORT.md` | Security scan result for the project |

## 📁 Generated `.ria/` Folder Example

Example structure based on the current CLI outputs:

```text
.ria/
├── AGENT_CONTEXT.md
├── AGENTS.md
├── ARCHITECTURE.md
├── DESIGN.md
├── FEATURES.md
├── SECURITY_REPORT.md
├── context-pack.json
├── context-pack.md
├── repo-map.json
├── repo-summary.md
├── security-report.json
├── summary.json
├── design-memory.json
├── memory-pack.md
├── memory/
│   ├── <entry>.json
│   └── ...
├── handoffs/
│   ├── latest.json
│   └── <handoff-id>.json
├── figma-tokens.json
├── figma-components.json
├── figma-design-summary.md
├── FIGMA_CODE_DIFF.md
├── UI_FIX_REPORT.md
└── ui-fix.patch
```

### Agent Prompt Pattern

```text
Before editing this project, read .ria/AGENT_CONTEXT.md, .ria/DESIGN.md,
and .ria/ARCHITECTURE.md. Follow .ria/AGENTS.md rules.
```

## 🗺️ Roadmap

| Version | Focus | Outcome |
| --- | --- | --- |
| `v0.1` | Repo Intelligence, Context Compression, Agent Memory, Agent Handoff | Persistent project knowledge with token-cheap context |
| `v0.2` | Design Intelligence, Figma Intelligence | Design-aware agents and code-to-design validation |
| `v0.3` | Security Intelligence, Skills Runtime | Safer agent workflows and reusable procedures |
| `v0.4` | Auto UI Fix, Multi-Agent Routing | Shared-state collaboration and guided autonomous execution |

See the full plan in [docs/Roadmap.md](./docs/Roadmap.md).

## 🤝 Contributing

Contributions are welcome. The most useful contributions right now are:

| Area | Examples |
| --- | --- |
| Core intelligence | Repo scanning, compression quality, token budgeting |
| Memory and handoff | Better schemas, search, ranking, continuity workflows |
| Design and Figma | Token extraction, component mapping, diff quality |
| Security | New detectors, policy models, safer defaults |
| Developer experience | CLI ergonomics, docs, examples, MCP integrations |

### Suggested Workflow

```bash
cd ai-ria
npm install
npm run build
npm test
```

### Contribution Guidelines

1. Open an issue or discussion for larger changes.
2. Keep changes focused and easy to review.
3. Add or update tests when behavior changes.
4. Update docs when commands, outputs, or workflows change.

## 📚 Project Docs

| Document | Purpose |
| --- | --- |
| [Vision](./docs/Vision.md) | Why AI RIA exists |
| [Architecture](./docs/Architecture.md) | High-level system design |
| [Roadmap](./docs/Roadmap.md) | Versioned execution plan |
| [CLI README](./ai-ria/README.md) | Package-level usage details |

## 📄 License

The CLI package in `ai-ria/` is licensed under `MIT`. The top-level project is being prepared for open-source release and should align to the same release posture.
