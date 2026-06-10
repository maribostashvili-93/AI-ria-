import { estimateTokens } from "../compression/compressor.js";
import { MemoryEntry, MemoryPack, MemoryPackSchema, MemoryType } from "../core/types.js";
import { loadMemories } from "./memory-index.js";

const SECTION_ORDER: MemoryType[] = ["decision", "architecture", "design", "security", "note"];
const SECTION_TITLES: Record<MemoryType, string> = {
  decision: "Decisions",
  architecture: "Architecture Notes",
  design: "Design Decisions",
  security: "Security Notes",
  note: "Other Notes",
};
const MAX_NOTES = 5;

/**
 * Semantic compression over memory: preserve every decision/rule/warning as a
 * one-liner, dedupe repeats, and trim free-form notes (the noise) to the latest few.
 */
export function compressEntries(entries: MemoryEntry[]): MemoryPack {
  const original = JSON.stringify(entries);
  const lines: string[] = ["# Project Memory (compressed)", ""];

  for (const type of SECTION_ORDER) {
    let group = entries.filter((e) => e.type === type);
    if (!group.length) continue;
    if (type === "note") group = group.slice(-MAX_NOTES);

    const seen = new Set<string>();
    const bullets: string[] = [];
    for (const e of [...group].reverse()) {
      const key = e.decision.toLowerCase().trim();
      if (seen.has(key)) continue;
      seen.add(key);
      bullets.push(`- ${e.decision}${e.reason ? ` — ${e.reason}` : ""}${e.files.length ? ` [${e.files.join(", ")}]` : ""}`);
    }
    lines.push(`## ${SECTION_TITLES[type]}`, "", ...bullets, "");
  }

  const markdown = lines.join("\n");
  const tokenEstimate = estimateTokens(markdown);
  const originalTokenEstimate = Math.max(estimateTokens(original), 1);
  return MemoryPackSchema.parse({
    generatedAt: new Date().toISOString(),
    entryCount: entries.length,
    markdown,
    tokenEstimate,
    originalTokenEstimate,
    compressionRatio: Number((tokenEstimate / originalTokenEstimate).toFixed(4)),
  });
}

/** Load all memories for a repo and compress them into one pack. */
export async function compressMemories(root: string): Promise<MemoryPack> {
  return compressEntries(await loadMemories(root));
}
