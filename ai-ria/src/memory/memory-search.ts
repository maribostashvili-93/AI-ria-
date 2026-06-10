import { MemoryEntry, MemorySearchHit, MemorySearchHitSchema } from "./memory-schema.js";
import { loadMemories } from "./memory-store.js";

function terms(query: string): string[] {
  return query.toLowerCase().split(/[^a-z0-9#@_-]+/).filter((t) => t.length > 1);
}

function scoreEntry(entry: MemoryEntry, queryTerms: string[]): number {
  const fields: [string, number][] = [
    [entry.title, 3],
    [entry.tags.join(" "), 2],
    [entry.content, 2],
    [entry.files.join(" "), 1],
    [entry.type, 1],
  ];
  let score = 0;
  for (const term of queryTerms) {
    for (const [field, weight] of fields) {
      if (field.toLowerCase().includes(term)) score += weight;
    }
  }
  return score;
}

/** Search project memory by topic. Most relevant first, newest first on ties. */
export async function searchMemories(root: string, query: string, limit = 10): Promise<MemorySearchHit[]> {
  const queryTerms = terms(query);
  const entries = await loadMemories(root);
  return entries
    .map((entry) => MemorySearchHitSchema.parse({ entry, score: scoreEntry(entry, queryTerms) }))
    .filter((hit) => hit.score > 0)
    .sort((a, b) => b.score - a.score || b.entry.createdAt.localeCompare(a.entry.createdAt))
    .slice(0, limit);
}

/** Render search hits as agent-ready markdown. */
export function hitsToMarkdown(query: string, hits: MemorySearchHit[]): string {
  if (!hits.length) return `No memories found for "${query}".`;
  const lines = [`Previous work found for "${query}":`, ""];
  for (const { entry } of hits) {
    lines.push(`- [${entry.type}] **${entry.title}**${entry.content ? ` — ${entry.content}` : ""}`);
    if (entry.files.length) lines.push(`  files: ${entry.files.join(", ")}`);
  }
  return lines.join("\n");
}
