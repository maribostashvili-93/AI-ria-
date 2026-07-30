import { writeRiaFile } from "../core/paths.js";
import { estimateTokens, trimToBudget } from "../compression/tokenizer.js";
import { demoteHeadings } from "../output/markdown.js";
import { collectAgentPack } from "../agentpack/agent-pack.js";

export type Provider = "claude" | "cursor" | "codex" | "compact" | "visual" | "security";

export const PROVIDERS: readonly Provider[] = ["claude", "cursor", "codex", "compact", "visual", "security"];

/** Provider profiles: token budget + voice. Inspired by provider-adapter designs (free-claude-code). */
const PROFILES: Record<Provider, { budget: number; file: string; header: string; agent: string }> = {
  claude: {
    budget: 12_000,
    file: "CLAUDE_CONTEXT.md",
    header: "You are continuing work on this project. Read the sections below before editing. Respect every warning and design rule.",
    agent: "claude",
  },
  cursor: {
    budget: 8_000,
    file: "CURSOR_CONTEXT.md",
    header: "Project rules and context for Cursor. Treat the rules below like .cursorrules.",
    agent: "cursor",
  },
  codex: {
    budget: 6_000,
    file: "CODEX_CONTEXT.md",
    header: "Concise project context. Follow the constraints strictly.",
    agent: "codex",
  },
  compact: {
    budget: 2_500,
    file: "COMPACT_CONTEXT.md",
    header: "Minimal context pack. Only the essentials survived compression.",
    agent: "compact",
  },
  visual: {
    budget: 10_000,
    file: "VISUAL_CONTEXT.md",
    header: "Context for a UI-building agent. Design rules and tokens come first; follow them exactly, do not invent new colors or spacing.",
    agent: "visual-agent",
  },
  security: {
    budget: 6_000,
    file: "SECURITY_CONTEXT.md",
    header: "Context for a security-review agent. Findings come first, ordered by severity; verify each one before dismissing it.",
    agent: "security-agent",
  },
};

/**
 * Per-provider section reprioritization (lower = kept first). The visual pack
 * leads with design knowledge, the security pack with findings; everything
 * else keeps the agent-pack default priorities.
 */
const PRIORITY_OVERRIDES: Partial<Record<Provider, Record<string, number>>> = {
  visual: { "Design Pack": 0, "Figma Summary": 1, "Security Warnings": 5, "Compressed Repo Context": 4, "Token Report": 7 },
  security: { "Security Findings": 0, "Security Warnings": 1, "Design Pack": 7, "Token Report": 7 },
};

const SEVERITY_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

/** Provider-specific sections beyond the shared agent-pack set. */
async function extraSections(root: string, provider: Provider): Promise<{ name: string; priority: number; content: string }[]> {
  const { readRiaFile } = await import("../core/paths.js");
  if (provider === "visual") {
    const figma = await readRiaFile(root, "figma/FIGMA_SUMMARY.md");
    return figma ? [{ name: "Figma Summary", priority: 1, content: figma }] : [];
  }
  if (provider === "security") {
    const raw = await readRiaFile(root, "security-report.json");
    if (!raw) return [];
    try {
      const report = JSON.parse(raw);
      const findings = [...(report.findings ?? [])]
        .sort((a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9))
        .slice(0, 40)
        .map((f: { severity: string; rule: string; file: string; line: number; message: string }) => `- [${f.severity}] ${f.file}:${f.line} (${f.rule}) — ${f.message}`);
      if (!findings.length) return [{ name: "Security Findings", priority: 0, content: "No findings — last scan was clean." }];
      return [{ name: "Security Findings", priority: 0, content: findings.join("\n") }];
    } catch {
      return [];
    }
  }
  return [];
}

export interface ProviderPackResult {
  provider: Provider;
  file: string;
  tokens: number;
  budget: number;
  removedSections: string[];
}

/**
 * `ria pack <provider>` — same knowledge, different token budget per agent.
 * Sections are dropped lowest-priority-first; the pack always says what was removed.
 */
export async function buildProviderPack(root: string, provider: Provider): Promise<ProviderPackResult> {
  const profile = PROFILES[provider];
  const data = await collectAgentPack(root);
  const overrides = PRIORITY_OVERRIDES[provider] ?? {};
  const sections = [...data.sections, ...(await extraSections(root, provider))]
    .map((s) => ({ ...s, priority: overrides[s.name] ?? s.priority }));
  const ordered = sections.sort((a, b) => a.priority - b.priority);

  const headerText = `# ${provider.toUpperCase()} Context Pack\n\n${profile.header}\n\nGenerated: ${data.generatedAt} · budget ~${profile.budget} tokens\n\n`;
  let used = estimateTokens(headerText);
  const included: string[] = [];
  const removedSections: string[] = [];

  for (const s of ordered) {
    const block = `## ${s.name}\n\n${demoteHeadings(s.content, 2)}\n\n---\n\n`;
    const cost = estimateTokens(block);
    if (used + cost <= profile.budget) {
      included.push(block);
      used += cost;
    } else if (used < profile.budget * 0.9 && s.priority <= 2) {
      // critical section that doesn't fit whole: trim it instead of dropping
      const { text } = trimToBudget(block, profile.budget - used);
      included.push(text + "\n\n");
      used = profile.budget;
      removedSections.push(`${s.name} (trimmed)`);
    } else {
      removedSections.push(s.name);
    }
  }

  const footer = removedSections.length
    ? `## Removed for Budget\n\nThese sections exist in \`.ria/agent-pack/AGENT_PACK.md\` but were ${provider === "compact" ? "cut" : "removed"} to fit the budget:\n\n${removedSections.map((s) => `- ${s}`).join("\n")}\n`
    : "## Removed for Budget\n\nNothing — everything fit.\n";

  const markdown = headerText + included.join("") + footer;
  const file = await writeRiaFile(root, `exports/${profile.file}`, markdown);
  const tokens = estimateTokens(markdown);

  // Token accounting: raw baseline = what the agent would have read without AI RIA.
  let rawTokens = data.tokens;
  try {
    const { readRiaFile } = await import("../core/paths.js");
    const report = await readRiaFile(root, "context/token-report.json");
    if (report) rawTokens = Math.max(rawTokens, Number(JSON.parse(report).rawTokens) || 0);
  } catch { /* ignore */ }
  const { recordPackGeneration } = await import("../tokens/token-ledger.js");
  await recordPackGeneration(root, { agent: profile.agent, task: "provider pack export", pack: profile.file, rawTokens, compressedTokens: tokens });

  return { provider, file, tokens, budget: profile.budget, removedSections };
}
