/**
 * Token Estimator (v0.1 Token Accounting Engine).
 * Single source for token math — re-exports the shared estimator so the
 * ledger, reports, packs and compression all count tokens the same way.
 */
export { estimateTokens, estimateRepoTokens } from "../compression/compressor.js";
import { estimateTokens } from "../compression/compressor.js";
import { promises as fs } from "node:fs";

/** Estimate tokens of a file on disk; 0 if unreadable. */
export async function estimateFileTokens(file: string): Promise<number> {
  try {
    return estimateTokens(await fs.readFile(file, "utf8"));
  } catch {
    return 0;
  }
}

/** Human-friendly number: 168000 -> "168,000". */
export function fmt(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

/** Savings percentage: raw 180000, compressed 12000 -> 93.3. */
export function savingsPercent(raw: number, compressed: number): number {
  if (raw <= 0) return 0;
  return Number((((raw - compressed) / raw) * 100).toFixed(1));
}
