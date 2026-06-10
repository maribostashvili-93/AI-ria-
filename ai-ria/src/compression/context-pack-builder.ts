import { promises as fs } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { RepoMap } from "../core/types.js";
import { compressRepoMap } from "./compressor.js";
import { estimateTokens, estimateRepoTokens, ratio } from "./tokenizer.js";
import { rankFiles, RankedFile } from "./file-ranker.js";
import { compressFile, CompressedFile } from "./semantic-compressor.js";

export const TokenReportSchema = z.object({
  generatedAt: z.string(),
  rawTokens: z.number().int().nonnegative(),
  compressedTokens: z.number().int().nonnegative(),
  compressionRatio: z.number().nonnegative(),
  budgetTokens: z.number().int().positive(),
  includedFiles: z.array(z.object({ path: z.string(), tokens: z.number(), reasons: z.array(z.string()) })),
  excludedFiles: z.array(z.object({ path: z.string(), reason: z.string() })),
});
export type TokenReport = z.infer<typeof TokenReportSchema>;

export interface ContextPackV2 {
  summary: string;
  files: (CompressedFile & { reasons: string[] })[];
  report: TokenReport;
}

const DEFAULT_BUDGET = 12_000;

/**
 * Build the v2 context pack: ranked critical files, semantically compressed,
 * within a token budget — with a reason recorded for every keep/drop decision.
 */
export async function buildContextPackV2(root: string, map: RepoMap, budgetTokens = DEFAULT_BUDGET): Promise<ContextPackV2> {
  const { kept, ignored } = rankFiles(map);
  const summary = compressRepoMap(map).summary;
  let used = estimateTokens(summary);

  const files: (CompressedFile & { reasons: string[] })[] = [];
  const droppedForBudget: RankedFile[] = [];

  for (const ranked of kept) {
    if (used >= budgetTokens) {
      droppedForBudget.push(ranked);
      continue;
    }
    let content: string;
    try {
      content = await fs.readFile(path.join(path.resolve(root), ranked.path), "utf8");
    } catch {
      continue;
    }
    const compressed = compressFile(ranked.path, content);
    if (used + compressed.tokens > budgetTokens && files.length > 0) {
      droppedForBudget.push(ranked);
      continue;
    }
    files.push({ ...compressed, reasons: ranked.reasons });
    used += compressed.tokens;
  }

  const report = TokenReportSchema.parse({
    generatedAt: new Date().toISOString(),
    rawTokens: Math.max(estimateRepoTokens(map), 1),
    compressedTokens: used,
    compressionRatio: ratio(used, estimateRepoTokens(map)),
    budgetTokens,
    includedFiles: files.map((f) => ({ path: f.path, tokens: f.tokens, reasons: f.reasons })),
    excludedFiles: [
      ...ignored.map((f) => ({ path: f.path, reason: f.reasons.join("; ") })),
      ...droppedForBudget.map((f) => ({ path: f.path, reason: "over token budget" })),
    ],
  });

  return { summary, files, report };
}

/** Render the v2 context pack as agent-ready markdown. */
export function contextPackV2ToMarkdown(pack: ContextPackV2): string {
  const r = pack.report;
  const lines: string[] = [
    "# Context Pack",
    "",
    `~${r.compressedTokens} tokens (raw ≈ ${r.rawTokens}, ratio ${r.compressionRatio}, budget ${r.budgetTokens})`,
    "",
    "## Project Summary",
    "",
    pack.summary,
    "",
    "## Critical Files",
    "",
  ];
  for (const f of pack.files) {
    lines.push(`### ${f.path}`, "", `_kept because: ${f.reasons.join(", ")}${f.truncated ? " · truncated" : ""}_`, "", "```", f.excerpt, "```", "");
  }
  if (r.excludedFiles.length) {
    lines.push("## Excluded", "");
    for (const f of r.excludedFiles.slice(0, 50)) lines.push(`- ${f.path} — ${f.reason}`);
    if (r.excludedFiles.length > 50) lines.push(`- … ${r.excludedFiles.length - 50} more`);
  }
  return lines.join("\n");
}
