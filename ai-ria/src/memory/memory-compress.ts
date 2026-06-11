import { estimateTokens } from "../compression/compressor.js";
import { MemoryEntry, MemoryPack, MemoryPackSchema, MemoryType } from "../core/types.js";
import { loadMemories } from "./memory-store.js";

const SECTION_ORDER: MemoryType[] = ["decision", "architecture-note", "design-rule", "warning", "security-note", "figma-note", "task"];
const SECTION_TITLES: Record<MemoryType, string> = {
  decision: "Decisions",
  "architecture-note": "Architecture Notes",
  "design-rule": "Design Rules",
  warning: "Warnings",
  "security-note": "Security Notes",
  "figma-note": "Figma Notes",
  task: "Tasks and Notes",
};
const MAX_TASKS = 5;

export function compressEntries(entries: MemoryEntry[]): MemoryPack {
  const original = JSON.stringify(entries);
  const lines: string[] = ["# Project Memory (compressed)", ""];

  for (const type of SECTION_ORDER) {
    let group = entries.filter((entry) => entry.type === type);
    if (!group.length) continue;
    if (type === "task") group = group.slice(-MAX_TASKS);

    const seen = new Set<string>();
    const bullets: string[] = [];
    for (const entry of [...group].reverse()) {
      const key = `${entry.title}|${entry.content}`.toLowerCase().trim();
      if (seen.has(key)) continue;
      seen.add(key);
      bullets.push(`- ${entry.title}${entry.content ? ` - ${entry.content}` : ""}${entry.files.length ? ` [${entry.files.join(", ")}]` : ""}`);
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

export async function compressMemories(root: string): Promise<MemoryPack> {
  return compressEntries(await loadMemories(root));
}
