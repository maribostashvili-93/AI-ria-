import { promises as fs } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { ensureRiaDir } from "../core/paths.js";
import { ratio } from "../compression/tokenizer.js";
import { resolveProfile } from "./token-budget.js";

export const TOKENS_DIR = "tokens";
export const LEDGER_FILE = "token-ledger.jsonl";

/** One row in the token ledger — who spent what, on which task, with which pack. */
export const TokenLedgerEntrySchema = z.object({
  agent: z.string().default("unknown"),
  task: z.string().default(""),
  pack: z.string().default(""),
  inputTokens: z.number().int().nonnegative().default(0),
  outputTokens: z.number().int().nonnegative().default(0),
  rawTokensBeforeCompression: z.number().int().nonnegative().default(0),
  compressedTokens: z.number().int().nonnegative().default(0),
  savedTokens: z.number().int().default(0),
  compressionRatio: z.number().nonnegative().default(0),
  limit: z.number().int().nonnegative().default(0),
  remainingBudget: z.number().int().default(0),
  createdAt: z.string(),
});
export type TokenLedgerEntry = z.infer<typeof TokenLedgerEntrySchema>;

async function ledgerFile(root: string): Promise<string> {
  const dir = path.join(await ensureRiaDir(root), TOKENS_DIR);
  await fs.mkdir(dir, { recursive: true });
  return path.join(dir, LEDGER_FILE);
}

/** Load all ledger entries; invalid lines are skipped. */
export async function loadLedger(root: string): Promise<TokenLedgerEntry[]> {
  let raw: string;
  try {
    raw = await fs.readFile(await ledgerFile(root), "utf8");
  } catch {
    return [];
  }
  const entries: TokenLedgerEntry[] = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      entries.push(TokenLedgerEntrySchema.parse(JSON.parse(trimmed)));
    } catch {
      /* skip invalid lines */
    }
  }
  return entries;
}

/** Append a raw ledger entry. */
export async function appendLedgerEntry(root: string, entry: TokenLedgerEntry): Promise<void> {
  await fs.appendFile(await ledgerFile(root), JSON.stringify(entry) + "\n", "utf8");
}

export interface RecordPackInput {
  agent?: string;
  task?: string;
  pack: string;
  rawTokens: number;
  compressedTokens: number;
  inputTokens?: number;
  outputTokens?: number;
}

/**
 * Record one pack generation in the ledger. Computes saved tokens, ratio,
 * the agent's limit, and the remaining budget from cumulative usage.
 * Every pack generator calls this — token reduction is the core product value.
 */
export async function recordPackGeneration(root: string, input: RecordPackInput): Promise<TokenLedgerEntry> {
  const profile = await resolveProfile(root, input.agent);
  const previous = await loadLedger(root);
  const usedBefore = previous
    .filter((e) => e.agent === profile.name)
    .reduce((sum, e) => sum + e.inputTokens + e.outputTokens + (e.inputTokens || e.outputTokens ? 0 : e.compressedTokens), 0);
  const inputTokens = input.inputTokens ?? input.compressedTokens;
  const outputTokens = input.outputTokens ?? 0;

  const entry = TokenLedgerEntrySchema.parse({
    agent: profile.name,
    task: input.task ?? "",
    pack: input.pack,
    inputTokens,
    outputTokens,
    rawTokensBeforeCompression: Math.max(input.rawTokens, 0),
    compressedTokens: input.compressedTokens,
    savedTokens: Math.max(input.rawTokens - input.compressedTokens, 0),
    compressionRatio: ratio(input.compressedTokens, input.rawTokens),
    limit: profile.tokenLimit,
    remainingBudget: profile.tokenLimit - usedBefore - inputTokens - outputTokens,
    createdAt: new Date().toISOString(),
  });
  await appendLedgerEntry(root, entry);
  return entry;
}
