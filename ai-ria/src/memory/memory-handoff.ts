import { promises as fs } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { ensureRiaDir } from "../core/paths.js";
import { Handoff, HandoffSchema } from "../core/types.js";
import { loadMemories } from "./memory-index.js";
import { loadDesignMemory } from "./memory-store.js";

export const HANDOFFS_DIR = "handoffs";
export const LATEST_HANDOFF = "latest.json";
const MAX_INJECTED_DECISIONS = 10;

async function ensureHandoffsDir(root: string): Promise<string> {
  const dir = path.join(await ensureRiaDir(root), HANDOFFS_DIR);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

export interface CreateHandoffInput {
  task: string;
  agent?: string;
  completed?: string[];
  remaining?: string[];
  warnings?: string[];
  designRules?: string[];
}

/**
 * Create `.ria/handoffs/<id>.json` (+ `latest.json`).
 * A handoff is a task-scoped view of memory: recent decisions and design
 * rules are injected automatically so the next agent starts fully informed.
 */
export async function createHandoff(root: string, input: CreateHandoffInput): Promise<{ handoff: Handoff; file: string }> {
  const createdAt = new Date().toISOString();
  const hash = createHash("sha256").update(`${input.task}|${createdAt}`).digest("hex").slice(0, 8);

  const memories = await loadMemories(root);
  const decisions = memories
    .filter((e) => e.type === "decision" || e.type === "architecture")
    .slice(-MAX_INJECTED_DECISIONS)
    .map((e) => `${e.decision}${e.reason ? ` — ${e.reason}` : ""}`);

  const designMemory = await loadDesignMemory(root);
  const designRules = [...new Set([...(input.designRules ?? []), ...(designMemory?.rules ?? [])])];

  const warnings = [
    ...new Set([...(input.warnings ?? []), ...memories.filter((e) => e.type === "security").map((e) => e.decision)]),
  ];

  const handoff = HandoffSchema.parse({
    id: `h-${createdAt.replace(/[-:T]/g, "").slice(0, 14)}-${hash}`,
    task: input.task,
    agent: input.agent ?? "unknown",
    createdAt,
    completed: input.completed ?? [],
    remaining: input.remaining ?? [],
    warnings,
    designRules,
    decisions,
  });

  const dir = await ensureHandoffsDir(root);
  const json = JSON.stringify(handoff, null, 2) + "\n";
  const file = path.join(dir, `${handoff.id}.json`);
  await fs.writeFile(file, json, "utf8");
  await fs.writeFile(path.join(dir, LATEST_HANDOFF), json, "utf8");
  return { handoff, file };
}

/** Load a handoff — the latest by default, or a specific id. */
export async function loadHandoff(root: string, id?: string): Promise<Handoff | null> {
  const dir = await ensureHandoffsDir(root);
  const name = id ? `${id}.json` : LATEST_HANDOFF;
  try {
    return HandoffSchema.parse(JSON.parse(await fs.readFile(path.join(dir, name), "utf8")));
  } catch {
    return null;
  }
}

/** Render a handoff as agent-ready markdown so the next agent resumes instantly. */
export function handoffToMarkdown(h: Handoff): string {
  const section = (title: string, items: string[]) =>
    items.length ? [`## ${title}`, "", ...items.map((i) => `- ${i}`), ""] : [];
  return [
    `# Handoff: ${h.task}`,
    "",
    `From: ${h.agent} · ${h.createdAt} · id: ${h.id}`,
    "",
    ...section("Completed", h.completed),
    ...section("Remaining", h.remaining),
    ...section("Warnings", h.warnings),
    ...section("Design Rules", h.designRules),
    ...section("Previous Decisions", h.decisions),
  ].join("\n");
}
