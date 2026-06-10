import { promises as fs } from "node:fs";
import path from "node:path";
import { ensureRiaDir } from "../core/paths.js";
import { MemoryEntry, MemoryIndex, MemoryIndexSchema } from "./memory-schema.js";

export const INDEX_FILE = "memory/memory-index.json";

/** Rebuild `<root>/.ria/memory/memory-index.json` from the given entries. */
export async function rebuildIndex(root: string, entries: MemoryEntry[]): Promise<MemoryIndex> {
  const byType: Record<string, number> = {};
  for (const e of entries) byType[e.type] = (byType[e.type] ?? 0) + 1;
  const index = MemoryIndexSchema.parse({
    updatedAt: new Date().toISOString(),
    count: entries.length,
    byType,
    entries: entries.map((e) => ({ id: e.id, type: e.type, title: e.title, tags: e.tags, files: e.files, createdAt: e.createdAt })),
  });
  const file = path.join(await ensureRiaDir(root), INDEX_FILE);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(index, null, 2) + "\n", "utf8");
  return index;
}

/** Load the index from disk, or null if missing/invalid (caller may rebuild). */
export async function loadIndex(root: string): Promise<MemoryIndex | null> {
  try {
    const file = path.join(path.resolve(root), ".ria", INDEX_FILE);
    return MemoryIndexSchema.parse(JSON.parse(await fs.readFile(file, "utf8")));
  } catch {
    return null;
  }
}
