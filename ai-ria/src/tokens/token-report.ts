import path from "node:path";
import { writeRiaFile } from "../core/paths.js";
import { estimateFileTokens, fmt, savingsPercent } from "./token-estimator.js";
import { loadLedger, TokenLedgerEntry } from "./token-ledger.js";
import { resolveProfile } from "./token-budget.js";
import { AGENT_PROFILES } from "./token-limits.js";

export interface TokenSummary {
  generatedAt: string;
  entryCount: number;
  totalRawTokens: number;
  totalCompressedTokens: number;
  totalSavedTokens: number;
  savingsPercent: number;
  byAgent: Record<string, { entries: number; inputTokens: number; outputTokens: number; savedTokens: number; limit: number; remainingBudget: number }>;
  byTask: Record<string, number>;
  byPack: Record<string, number>;
  biggestConsumers: { agent: string; pack: string; tokens: number }[];
  warnings: string[];
}

function groupSum(entries: TokenLedgerEntry[], key: (e: TokenLedgerEntry) => string, value: (e: TokenLedgerEntry) => number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const e of entries) {
    const k = key(e) || "(none)";
    out[k] = (out[k] ?? 0) + value(e);
  }
  return out;
}

/**
 * Keep only the newest ledger row per pack.
 *
 * The ledger is append-only, so re-running `analyze`/`orchestrate` rewrites the
 * same packs and appends new rows. Summing every row would count the same
 * saving once per run and report savings larger than the repository itself.
 * Totals describe the CURRENT set of packs; `entryCount` still reports how many
 * rows the ledger holds.
 */
function latestPerPack(entries: TokenLedgerEntry[]): TokenLedgerEntry[] {
  const latest = new Map<string, TokenLedgerEntry>();
  for (const e of entries) latest.set(`${e.agent}::${e.pack}`, e);
  return [...latest.values()];
}

/** Aggregate the ledger into a token summary, with budget warnings. */
export async function buildTokenSummary(root: string, agentFilter?: string): Promise<TokenSummary> {
  let allEntries = await loadLedger(root);
  if (agentFilter) allEntries = allEntries.filter((e) => e.agent === agentFilter.toLowerCase());
  const entries = latestPerPack(allEntries);

  const totalRawTokens = entries.reduce((s, e) => s + e.rawTokensBeforeCompression, 0);
  const totalCompressedTokens = entries.reduce((s, e) => s + e.compressedTokens, 0);
  const totalSavedTokens = entries.reduce((s, e) => s + e.savedTokens, 0);

  const byAgent: TokenSummary["byAgent"] = {};
  for (const e of entries) {
    const a = (byAgent[e.agent] ??= { entries: 0, inputTokens: 0, outputTokens: 0, savedTokens: 0, limit: e.limit, remainingBudget: e.remainingBudget });
    a.entries += 1;
    a.inputTokens += e.inputTokens;
    a.outputTokens += e.outputTokens;
    a.savedTokens += e.savedTokens;
    a.limit = e.limit;
    a.remainingBudget = Math.min(a.remainingBudget, e.remainingBudget);
  }

  const warnings: string[] = [];
  for (const e of entries) {
    const profile = await resolveProfile(root, e.agent);
    if (e.compressedTokens > profile.packBudget) {
      warnings.push(`${e.pack} is ${fmt(e.compressedTokens)} tokens — over ${e.agent}'s preferred pack size (${fmt(profile.packBudget)})`);
    }
    if (e.remainingBudget < 0) {
      warnings.push(`${e.agent} is ${fmt(-e.remainingBudget)} tokens OVER its ${fmt(e.limit)} limit`);
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    entryCount: allEntries.length,
    totalRawTokens,
    totalCompressedTokens,
    totalSavedTokens,
    savingsPercent: Math.max(0, savingsPercent(totalRawTokens, totalCompressedTokens)),
    byAgent,
    byTask: groupSum(entries, (e) => e.task, (e) => e.inputTokens + e.outputTokens),
    byPack: groupSum(entries, (e) => e.pack, (e) => e.compressedTokens),
    biggestConsumers: [...entries]
      .sort((a, b) => b.inputTokens + b.outputTokens - (a.inputTokens + a.outputTokens))
      .slice(0, 5)
      .map((e) => ({ agent: e.agent, pack: e.pack, tokens: e.inputTokens + e.outputTokens })),
    warnings: [...new Set(warnings)],
  };
}

/** Render TOKEN_REPORT.md. */
export function tokenSummaryToMarkdown(s: TokenSummary): string {
  const lines: string[] = [
    "# Token Report",
    "",
    `Generated: ${s.generatedAt} · ${s.entryCount} ledger entries`,
    "",
    `- Raw context: **${fmt(s.totalRawTokens)} tokens**`,
    `- Compressed context: **${fmt(s.totalCompressedTokens)} tokens**`,
    `- Saved: **${fmt(s.totalSavedTokens)} tokens**`,
    `- Savings: **${s.savingsPercent}%**`,
    "",
  ];
  const table = (title: string, record: Record<string, number>) => {
    const keys = Object.keys(record);
    if (!keys.length) return;
    lines.push(`## ${title}`, "", "| Name | Tokens |", "|---|---|");
    for (const k of keys.sort((a, b) => record[b] - record[a])) lines.push(`| ${k} | ${fmt(record[k])} |`);
    lines.push("");
  };
  if (Object.keys(s.byAgent).length) {
    lines.push("## Tokens by Agent", "", "| Agent | Entries | Input | Output | Saved | Limit | Remaining |", "|---|---|---|---|---|---|---|");
    for (const [agent, a] of Object.entries(s.byAgent)) {
      lines.push(`| ${agent} | ${a.entries} | ${fmt(a.inputTokens)} | ${fmt(a.outputTokens)} | ${fmt(a.savedTokens)} | ${fmt(a.limit)} | ${fmt(a.remainingBudget)} |`);
    }
    lines.push("");
  }
  table("Tokens by Task", s.byTask);
  table("Tokens by Pack", s.byPack);
  if (s.biggestConsumers.length) {
    lines.push("## Biggest Consumers", "");
    for (const c of s.biggestConsumers) lines.push(`- ${c.agent} · ${c.pack || "(no pack)"} — ${fmt(c.tokens)} tokens`);
    lines.push("");
  }
  if (s.warnings.length) {
    lines.push("## Warnings", "");
    for (const w of s.warnings) lines.push(`- ⚠ ${w}`);
    lines.push("");
  }
  return lines.join("\n");
}

/** Write TOKEN_REPORT.md + token-summary.json and return the summary. */
export async function writeTokenReport(root: string): Promise<{ summary: TokenSummary; files: string[] }> {
  const summary = await buildTokenSummary(root);
  const files = [
    await writeRiaFile(root, "tokens/TOKEN_REPORT.md", tokenSummaryToMarkdown(summary)),
    await writeRiaFile(root, "tokens/token-summary.json", JSON.stringify(summary, null, 2)),
  ];
  return { summary, files };
}

/** Compare every generated pack's size against each agent profile's preferred budget. */
export async function comparePacks(root: string): Promise<string> {
  const packs: [string, string][] = [
    ["AGENT_PACK", path.join(root, ".ria", "agent-pack", "AGENT_PACK.md")],
    ["context-pack", path.join(root, ".ria", "context", "context-pack.md")],
    ["DESIGN_PACK", path.join(root, ".ria", "design", "DESIGN_PACK.md")],
    ["CLAUDE_CONTEXT", path.join(root, ".ria", "exports", "CLAUDE_CONTEXT.md")],
    ["CURSOR_CONTEXT", path.join(root, ".ria", "exports", "CURSOR_CONTEXT.md")],
    ["CODEX_CONTEXT", path.join(root, ".ria", "exports", "CODEX_CONTEXT.md")],
    ["COMPACT_CONTEXT", path.join(root, ".ria", "exports", "COMPACT_CONTEXT.md")],
  ];
  const lines = ["Pack sizes vs agent budgets:", ""];
  for (const [name, file] of packs) {
    const tokens = await estimateFileTokens(file);
    if (!tokens) continue;
    const fits = Object.values(AGENT_PROFILES)
      .map((p) => `${p.name}${tokens <= p.packBudget ? " ✓" : " ✗"}`)
      .join("  ");
    lines.push(`  ${name.padEnd(16)} ~${fmt(tokens).padStart(8)} tokens   ${fits}`);
  }
  if (lines.length === 2) lines.push("  (no packs generated yet — run `ria agent-pack` or `ria pack <provider>`)");
  return lines.join("\n");
}
