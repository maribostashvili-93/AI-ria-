import { writeRiaFile } from "../core/paths.js";
import { estimateTokens, trimToBudget } from "../compression/tokenizer.js";
import { collectAgentPack } from "../agentpack/agent-pack.js";

export type Provider = "claude" | "cursor" | "codex" | "compact";

/** Provider profiles: token budget + voice. Inspired by provider-adapter designs (free-claude-code). */
const PROFILES: Record<Provider, { budget: number; file: string; header: string }> = {
  claude: {
    budget: 12_000,
    file: "CLAUDE_CONTEXT.md",
    header: "You are continuing work on this project. Read the sections below before editing. Respect every warning and design rule.",
  },
  cursor: {
    budget: 8_000,
    file: "CURSOR_CONTEXT.md",
    header: "Project rules and context for Cursor. Treat the rules below like .cursorrules.",
  },
  codex: {
    budget: 6_000,
    file: "CODEX_CONTEXT.md",
    header: "Concise project context. Follow the constraints strictly.",
  },
  compact: {
    budget: 2_500,
    file: "COMPACT_CONTEXT.md",
    header: "Minimal context pack. Only the essentials survived compression.",
  },
};

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
  const ordered = [...data.sections].sort((a, b) => a.priority - b.priority);

  const headerText = `# ${provider.toUpperCase()} Context Pack\n\n${profile.header}\n\nGenerated: ${data.generatedAt} · budget ~${profile.budget} tokens\n\n`;
  let used = estimateTokens(headerText);
  const included: string[] = [];
  const removedSections: string[] = [];

  for (const s of ordered) {
    const block = `# ${s.name}\n\n${s.content}\n\n---\n\n`;
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
  await recordPackGeneration(root, { agent: provider, task: "provider pack export", pack: profile.file, rawTokens, compressedTokens: tokens });

  return { provider, file, tokens, budget: profile.budget, removedSections };
}
