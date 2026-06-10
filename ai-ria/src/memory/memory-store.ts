import { promises as fs } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { ensureRiaDir } from "../core/paths.js";
import { MemoryEntry, MemoryEntrySchema, MemoryType } from "./memory-schema.js";
import { rebuildIndex } from "./memory-index.js";

export const MEMORY_DIR = "memory";
export const MEMORIES_FILE = "memories.jsonl";

/** Ensure `<root>/.ria/memory/` exists and return its absolute path. */
export async function ensureMemoryDir(root: string): Promise<string> {
  const dir = path.join(await ensureRiaDir(root), MEMORY_DIR);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

/** Absolute path of `<root>/.ria/memory/memories.jsonl`. */
export async function memoriesFile(root: string): Promise<string> {
  return path.join(await ensureMemoryDir(root), MEMORIES_FILE);
}

/** Load all memory entries from memories.jsonl. Invalid lines are skipped. */
export async function loadMemories(root: string): Promise<MemoryEntry[]> {
  let raw: string;
  try {
    raw = await fs.readFile(await memoriesFile(root), "utf8");
  } catch {
    return [];
  }
  const entries: MemoryEntry[] = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      entries.push(MemoryEntrySchema.parse(JSON.parse(trimmed)));
    } catch {
      /* skip invalid lines */
    }
  }
  return entries;
}

export interface AddMemoryInput {
  type?: MemoryType;
  title: string;
  content?: string;
  files?: string[];
  tags?: string[];
  agent?: string;
}

/** Append one memory entry to memories.jsonl, then refresh the index. */
export async function addMemory(root: string, input: AddMemoryInput): Promise<MemoryEntry> {
  const createdAt = new Date().toISOString();
  const hash = createHash("sha256").update(`${input.title}|${input.content ?? ""}|${createdAt}`).digest("hex").slice(0, 10);
  const entry = MemoryEntrySchema.parse({
    id: `mem_${hash}`,
    type: input.type ?? "decision",
    title: input.title,
    content: input.content ?? "",
    files: input.files ?? [],
    tags: input.tags ?? [],
    agent: input.agent ?? "unknown",
    createdAt,
  });
  await fs.appendFile(await memoriesFile(root), JSON.stringify(entry) + "\n", "utf8");
  await rebuildIndex(root, await loadMemories(root));
  return entry;
}
