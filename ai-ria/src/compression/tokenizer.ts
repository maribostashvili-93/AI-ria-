/**
 * Tokenizer (v0.1 Context Compression Engine).
 * Single place for token math so every module reports consistent numbers.
 */
export { estimateTokens, estimateRepoTokens } from "./compressor.js";
import { estimateTokens } from "./compressor.js";

/** Trim text to roughly fit a token budget, cutting at line boundaries. */
export function trimToBudget(text: string, budgetTokens: number): { text: string; trimmed: boolean } {
  if (estimateTokens(text) <= budgetTokens) return { text, trimmed: false };
  const lines = text.split("\n");
  const out: string[] = [];
  let used = 0;
  for (const line of lines) {
    const cost = estimateTokens(line + "\n");
    if (used + cost > budgetTokens) break;
    out.push(line);
    used += cost;
  }
  return { text: out.join("\n") + "\n…(trimmed to token budget)", trimmed: true };
}

/** Compression ratio rounded to 4 decimals; original is floored at 1 to avoid /0. */
export function ratio(compressed: number, original: number): number {
  return Number((compressed / Math.max(original, 1)).toFixed(4));
}
