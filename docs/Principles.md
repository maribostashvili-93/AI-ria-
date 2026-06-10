# Principles

Core principles that guide every design and implementation decision in AI RIA. When trade-offs arise, these are the tiebreakers.

## 1. AI-First

AI RIA is built for AI agents as the primary consumers, not humans. Interfaces, data formats, and responses are optimized for machine consumption: structured, predictable, compact. Human-readable views exist, but the agent experience comes first.

*In practice:* every feature is designed by asking "how does an agent call this, and what does it cost the agent to use it?"

## 2. Token-Efficient

Tokens are the scarcest resource in agent workflows. Every byte AI RIA sends to an agent must earn its place. Compression, deduplication, and relevance filtering are not features — they are the default behavior of every module.

*In practice:* responses respect declared token budgets; we measure and publish token savings; verbosity is a bug.

## 3. Design-Aware

Generated software should look and feel intentional. AI RIA treats design systems and design files (Figma) as first-class sources of truth, equal in weight to code. Consistency with the design system is validated, not hoped for.

*In practice:* UI-related responses always carry design-system context; deviations from established patterns are flagged automatically.

## 4. Security-Focused

Agent-generated code ships at machine speed; security review must too. Safety checks are built into the layer, not bolted on. Insecure output should be caught before a human ever sees it.

*In practice:* security validation runs on agent output by default; secrets never enter the knowledge layer; policies are enforceable, not advisory.

## 5. Documentation-Driven

Knowledge that isn't written down is lost. AI RIA both generates documentation as code evolves and uses documentation as a primary knowledge source. The project itself is documentation-first: vision, architecture, and roadmap exist before production code.

*In practice:* docs update alongside code automatically; stale documentation is treated as a defect; this repository practices what it preaches.

## 6. Open-Source Friendly

AI RIA is open infrastructure. Open protocols (MCP first), no vendor lock-in, no dependence on a single AI provider, and an architecture designed for community-contributed modules. Project knowledge belongs to the project, not to a hosted service.

*In practice:* every capability is reachable through open interfaces; local-first operation; permissive licensing; contributions shape the roadmap.

---

## Applying the Principles

When principles conflict, prefer the option that:

1. Costs agents fewer tokens,
2. keeps users in control of their data, and
3. remains open and vendor-neutral.

## Related Documents

- [Vision](Vision.md) · [Roadmap](Roadmap.md) · [Architecture](Architecture.md)
