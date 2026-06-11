import { estimateTokens } from "../compression/compressor.js";
import { MemoryEntry, MemoryPack, MemoryPackSchema, MemoryType } from "./memory-schema.js";
import { loadMemories } from "./memory-store.js";

const SECTION_ORDER: MemoryType[] = ["decision", "architecture-note", "design-rule", "warning", "security-note", "figma-note", "task"];
const SECTION_TITLES: Record<MemoryType, string> = {
  decision: "Decisions",
  "architecture-note": "Architecture Notes",
  "design-rule": "Design Rules",
  warning: "Warnings",
  "security-note": "Security Notes",
  "figma-note": "Figma Notes",
  task: "Recent Tasks",
};
const MAX_TASKS = 10;

/**
 * Semantic compression over memory: every decision/rule/warning survives as a
 * one-liner, duplicates collapse, and noisy task logs trim to the latest few.
 */
export function compressEntries(entries: MemoryEntry[]): MemoryPack {
  const original = JSON.stringify(entries);
  const lines: string[] = ["# Project Memory (compressed)", ""];

  for (const type of SECTION_ORDER) {
    let group = entries.filter((e) => e.type === type);
    if (!group.length) continue;
    if (type === "task") group = group.slice(-MAX_TASKS);

    const seen = new Set<string>();
    const bullets: string[] = [];
    for (const e of [...group].reverse()) {
      const key = `${e.title}|${e.content}`.toLowerCase().trim();
      if (seen.has(key)) continue;
      seen.add(key);
      bullets.push(`- ${e.title}${e.content ? ` — ${e.content}` : ""}${e.files.length ? ` [${e.files.join(", ")}]` : ""}`);
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

/** Short memory — the compressed pack an agent reads first (.ria/memory/short-memory.md). */
export async function buildShortMemory(root: string): Promise<string> {
  const pack = await compressMemories(root);
  return pack.markdown;
}

/** Deep memory — every entry in full, for agents that need complete history (.ria/memory/deep-memory.md). */
export async function buildDeepMemory(root: string): Promise<string> {
  const entries = await loadMemories(root);
  const lines: string[] = ["# Project Memory (deep)", "", `${entries.length} entries, oldest first.`, ""];
  for (const e of entries) {
    lines.push(`## ${e.title}`, "", `- id: ${e.id} · type: ${e.type} · agent: ${e.agent} · ${e.createdAt}`);
    if (e.tags.length) lines.push(`- tags: ${e.tags.join(", ")}`);
    if (e.files.length) lines.push(`- files: ${e.files.join(", ")}`);
    if (e.content) lines.push("", e.content);
    lines.push("");
  }
  return lines.join("\n");
}
