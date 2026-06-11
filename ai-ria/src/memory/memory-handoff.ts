import { promises as fs } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { ensureRiaDir } from "../core/paths.js";
import { Handoff, HandoffSchema } from "../core/types.js";
import { loadDesignMemory, loadMemories } from "./memory-store.js";

export const HANDOFFS_DIR = "handoffs";
export const LATEST_HANDOFF = "latest-handoff.json";
export const HANDOFF_MD = "HANDOFF.md";
const MAX_INJECTED_DECISIONS = 10;

async function ensureHandoffsDir(root: string): Promise<string> {
  const dir = path.join(await ensureRiaDir(root), HANDOFFS_DIR);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

export interface CreateHandoffInput {
  task: string;
  agent?: string;
  nextAgent?: string;
  completed?: string[];
  remaining?: string[];
  warnings?: string[];
  designRules?: string[];
  changedFiles?: string[];
  filesToAvoid?: string[];
  risks?: string[];
  nextAction?: string;
}

export async function createHandoff(root: string, input: CreateHandoffInput): Promise<{ handoff: Handoff; file: string }> {
  const createdAt = new Date().toISOString();
  const hash = createHash("sha256").update(`${input.task}|${createdAt}`).digest("hex").slice(0, 8);

  const memories = await loadMemories(root);
  const decisions = memories
    .filter((entry) => entry.type === "decision" || entry.type === "architecture-note")
    .slice(-MAX_INJECTED_DECISIONS)
    .map((entry) => `${entry.title}${entry.content ? ` - ${entry.content}` : ""}`);

  const designMemory = await loadDesignMemory(root);
  const designRules = [...new Set([...(input.designRules ?? []), ...(designMemory?.rules ?? [])])];
  const changedFiles = [...new Set([...(input.changedFiles ?? []), ...memories.flatMap((entry) => entry.files)])];
  const warnings = [
    ...new Set([
      ...(input.warnings ?? []),
      ...(input.filesToAvoid ?? []).map((file) => `Avoid: ${file}`),
      ...(input.risks ?? []),
      ...memories.filter((entry) => entry.type === "warning" || entry.type === "security-note").map((entry) => entry.title),
    ]),
  ];

  const handoff = HandoffSchema.parse({
    id: `h-${createdAt.replace(/[-:T]/g, "").slice(0, 14)}-${hash}`,
    task: input.task,
    agent: input.agent ?? "unknown",
    nextAgent: input.nextAgent ?? "",
    createdAt,
    completed: input.completed ?? [],
    remaining: input.remaining ?? [],
    changedFiles,
    warnings,
    nextAction: input.nextAction ?? "",
    memoryRefs: memories.slice(-MAX_INJECTED_DECISIONS).map((entry) => entry.id),
    designRules,
    decisions,
    safetyNotes: [...new Set(input.risks ?? [])],
  });

  const dir = await ensureHandoffsDir(root);
  const json = JSON.stringify(handoff, null, 2) + "\n";
  const file = path.join(dir, `${handoff.id}.json`);
  await fs.writeFile(file, json, "utf8");
  await fs.writeFile(path.join(dir, LATEST_HANDOFF), json, "utf8");
  await fs.writeFile(path.join(dir, HANDOFF_MD), handoffToMarkdown(handoff) + "\n", "utf8");
  return { handoff, file };
}

export async function loadHandoff(root: string, id?: string): Promise<Handoff | null> {
  const dir = await ensureHandoffsDir(root);
  const name = id ? `${id}.json` : LATEST_HANDOFF;
  try {
    return HandoffSchema.parse(JSON.parse(await fs.readFile(path.join(dir, name), "utf8")));
  } catch {
    return null;
  }
}

export function handoffToMarkdown(handoff: Handoff): string {
  const section = (title: string, items: string[]) => (items.length ? [`## ${title}`, "", ...items.map((item) => `- ${item}`), ""] : []);
  return [
    `# Handoff: ${handoff.task}`,
    "",
    `From: ${handoff.agent} | ${handoff.createdAt} | id: ${handoff.id}`,
    ...(handoff.nextAgent ? [`Next agent: ${handoff.nextAgent}`, ""] : [""]),
    ...section("Completed", handoff.completed),
    ...section("Remaining", handoff.remaining),
    ...section("Changed Files", handoff.changedFiles),
    ...section("Warnings", handoff.warnings),
    ...section("Design Rules", handoff.designRules),
    ...section("Previous Decisions", handoff.decisions),
    ...section("Safety Notes", handoff.safetyNotes),
    ...(handoff.nextAction ? ["## Next Action", "", handoff.nextAction, ""] : []),
  ].join("\n");
}
