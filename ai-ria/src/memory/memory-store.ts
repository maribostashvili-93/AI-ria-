import { promises as fs } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { ensureRiaDir, readRiaFile, writeRiaFile } from "../core/paths.js";
import { DesignMemory, DesignMemorySchema, DesignToken } from "../core/types.js";
import { MemoryEntry, MemoryEntrySchema, MemoryType } from "./memory-schema.js";
import { rebuildIndex } from "./memory-index.js";

export const MEMORY_DIR = "memory";
export const MEMORIES_FILE = "memories.jsonl";
export const DESIGN_MEMORY_FILE = "design-memory.json";

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
  type?: string;
  title: string;
  content?: string;
  files?: string[];
  tags?: string[];
  agent?: string;
}

function normalizeMemoryType(type?: string): MemoryType {
  switch (type) {
    case "architecture":
    case "architecture-note":
      return "architecture-note";
    case "design":
    case "design-rule":
      return "design-rule";
    case "security":
    case "security-note":
      return "security-note";
    case "warning":
      return "warning";
    case "figma":
    case "figma-note":
      return "figma-note";
    case "task":
    case "note":
      return "task";
    case "decision":
    default:
      return "decision";
  }
}

/** Append one memory entry to memories.jsonl, then refresh the index. */
export async function addMemory(root: string, input: AddMemoryInput): Promise<MemoryEntry> {
  const createdAt = new Date().toISOString();
  const hash = createHash("sha256").update(`${input.title}|${input.content ?? ""}|${createdAt}`).digest("hex").slice(0, 10);
  const entry = MemoryEntrySchema.parse({
    id: `mem_${hash}`,
    type: normalizeMemoryType(input.type),
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

export interface SaveMemoryInput {
  task: string;
  decision: string;
  reason?: string;
  type?: string;
  files?: string[];
  tags?: string[];
  agent?: string;
}

/** Backward-compatible CLI/MCP wrapper over the memory store. */
export async function saveMemory(root: string, input: SaveMemoryInput): Promise<MemoryEntry> {
  const title = input.decision;
  const content = [input.task ? `Task: ${input.task}` : "", input.reason ? `Reason: ${input.reason}` : ""].filter(Boolean).join(" | ");
  return addMemory(root, {
    type: input.type,
    title,
    content,
    files: input.files,
    tags: input.tags,
    agent: input.agent,
  });
}

export async function loadDesignMemory(root: string): Promise<DesignMemory | null> {
  const raw = await readRiaFile(root, DESIGN_MEMORY_FILE);
  if (!raw) return null;
  try {
    return DesignMemorySchema.parse(JSON.parse(raw));
  } catch {
    return null;
  }
}

export async function buildDesignMemory(root: string, tokens: DesignToken[], designEntries: MemoryEntry[]): Promise<DesignMemory> {
  const existing = await loadDesignMemory(root);
  const sources = new Set<string>(existing?.sources ?? []);
  const tokenMap = new Map<string, DesignToken>();
  for (const token of [...(existing?.tokens ?? []), ...tokens]) {
    tokenMap.set(`${token.source}:${token.name}:${token.value}`, token);
    sources.add(token.source);
  }

  const rules = [
    ...(existing?.rules ?? []),
    ...designEntries.map((entry) => entry.title),
    ...designEntries.map((entry) => entry.content).filter(Boolean),
  ].filter(Boolean);

  const memory = DesignMemorySchema.parse({
    updatedAt: new Date().toISOString(),
    sources: [...sources],
    rules: [...new Set(rules)],
    tokens: [...tokenMap.values()],
    components: existing?.components ?? {},
  });

  await writeRiaFile(root, DESIGN_MEMORY_FILE, JSON.stringify(memory, null, 2));
  return memory;
}

export async function mapDesignComponent(root: string, component: string, files: string[]): Promise<DesignMemory> {
  const memory = (await loadDesignMemory(root)) ?? DesignMemorySchema.parse({
    updatedAt: new Date().toISOString(),
    sources: [],
    rules: [],
    tokens: [],
    components: {},
  });

  memory.components[component] = {
    props: memory.components[component]?.props ?? {},
    files,
  };
  memory.updatedAt = new Date().toISOString();

  await writeRiaFile(root, DESIGN_MEMORY_FILE, JSON.stringify(memory, null, 2));
  return memory;
}

export function designMemoryToMarkdown(memory: DesignMemory): string {
  const lines: string[] = [
    "# Design Memory",
    "",
    `Updated: ${memory.updatedAt}`,
    `Sources: ${memory.sources.join(", ") || "none"}`,
    "",
  ];

  if (memory.rules.length) {
    lines.push("## Rules", "");
    for (const rule of memory.rules) lines.push(`- ${rule}`);
    lines.push("");
  }

  if (memory.tokens.length) {
    lines.push("## Tokens", "", "| Name | Value | Source |", "|---|---|---|");
    for (const token of memory.tokens.slice(0, 60)) lines.push(`| ${token.name} | \`${token.value}\` | ${token.source} |`);
    if (memory.tokens.length > 60) lines.push(`| ... | ${memory.tokens.length - 60} more | |`);
    lines.push("");
  }

  const names = Object.keys(memory.components).sort();
  if (names.length) {
    lines.push("## Component Map", "");
    for (const name of names) {
      const component = memory.components[name];
      lines.push(`- ${name}: ${component.files.join(", ") || "no files mapped"}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
