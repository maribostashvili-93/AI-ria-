# Architecture

High-level architecture of AI RIA. This describes the planned structure — no production code exists yet. Details will evolve as phases of the [Roadmap](Roadmap.md) are implemented.

## Overview

AI RIA sits between AI agents and their work surfaces (repositories, design files, documentation). Agents connect through open protocols; AI RIA Core routes their queries to specialized modules and returns compact, high-value answers.

```
┌─────────────────────────────────────────────────────────┐
│                       AI Agents                         │
│     Claude Code · Cursor · Copilot · custom agents      │
└────────────────────────────┬────────────────────────────┘
                             │  MCP / API (open protocols)
┌────────────────────────────▼────────────────────────────┐
│                       AI RIA Core                       │
│   protocol handling · module routing · orchestration    │
├──────────────┬──────────────┬──────────────┬────────────┤
│  Repository  │   Context    │   Design     │  Security  │
│ Intelligence │ Compression  │ Intelligence │   Engine   │
├──────────────┼──────────────┼──────────────┼────────────┤
│    Agent     │    Figma     │     Knowledge Layer       │
│    Skills    │ Integration  │   (shared persistence)    │
└──────────────┴──────────────┴───────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────┐
│        Repositories · Design files · Documentation      │
└─────────────────────────────────────────────────────────┘
```

## AI RIA Core

The Core is the entry point and coordinator. It does not contain domain logic — it:

- **Handles protocols**: exposes module capabilities to agents via MCP and APIs
- **Routes requests**: directs agent queries to the right module(s)
- **Orchestrates**: combines results from multiple modules into a single compact response
- **Enforces budgets**: respects token limits the agent declares, shaping responses to fit

## Modules

### Repository Intelligence
Builds and maintains a structured model of the codebase: file/module structure, dependency graph, conventions, entry points, hot paths. Updates incrementally on change. Other modules and agents query it instead of reading raw files. *(Roadmap v0.1)*

### Context Compression
Turns large context — files, history, docs, session memory — into compact representations. Performs smart context selection (only what's relevant to the task) and deduplication (never send what the agent already has). *(Roadmap v0.1)*

### Design Intelligence
Models the project's design system: tokens, components, patterns. Validates generated UI for consistency and steers agents toward reusing existing components. Works with Figma Integration to treat design files as the source of truth. *(Roadmap v0.2)*

### Security Engine
Validates agent-generated changes before they land: vulnerability patterns, secret detection, dependency safety, project-defined policies. Produces audit trails. *(Roadmap v0.3)*

### Agent Skills
Packaged, reusable capabilities agents can invoke — task-specific procedures, validated workflows, and best practices encoded once and shared by every connected agent.

### Figma Integration
Connects Figma design files to the system: reads frames, components, and tokens; maps designs to code; enables design-to-implementation validation by the Design Intelligence module.

### Knowledge Layer
The shared persistence foundation under all modules. Stores repository models, compressed context, design knowledge, security findings, and generated documentation. What one module (or agent) learns, all can access. Powers documentation generation and cross-session / cross-agent memory. *(v0.1 core — underpins agent memory, handoff, and v0.4 multi-agent routing)*

## Key Architectural Decisions (planned)

1. **Protocol-first**: agents interact only through open protocols (MCP first). No vendor lock-in.
2. **Modules are independent**: each module can be used alone; the Core composes them.
3. **Incremental over batch**: knowledge updates as things change, never full re-scans.
4. **Token budget as a first-class constraint**: every response is shaped to a declared budget.
5. **Local-first**: project knowledge stays with the project; nothing requires a hosted service.

## Related Documents

- [Vision](Vision.md) · [Roadmap](Roadmap.md) · [Principles](Principles.md)
