import { estimateTokens } from "../compression/compressor.js";
import { Handoff } from "../core/types.js";
import { loadHandoff } from "./memory-handoff.js";
import { loadMemories } from "./memory-store.js";

export interface MemoryLayerPack {
  short: string;
  working: string;
  deep: string;
}

function unique(items: string[]): string[] {
  return [...new Set(items.filter(Boolean))];
}

function section(title: string, items: string[]): string[] {
  if (!items.length) return [];
  return [`## ${title}`, "", ...items.map((item) => `- ${item}`), ""];
}

function summarizeHandoff(handoff: Handoff | null): string[] {
  if (!handoff) return [];
  return unique([
    `Task: ${handoff.task}`,
    ...handoff.completed.map((item) => `Done: ${item}`),
    ...handoff.remaining.map((item) => `Remaining: ${item}`),
    ...handoff.warnings.map((item) => `Warning: ${item}`),
    handoff.nextAction ? `Next: ${handoff.nextAction}` : "",
  ]);
}

export async function buildMemoryLayers(root: string): Promise<MemoryLayerPack> {
  const memories = await loadMemories(root);
  const handoff = await loadHandoff(root);
  const recent = memories.slice(-8).reverse();
  const decisions = memories.filter((entry) => entry.type === "decision" || entry.type === "architecture-note").slice(-8).reverse();
  const warnings = memories.filter((entry) => entry.type === "warning" || entry.type === "security-note").slice(-6).reverse();

  const shortLines = [
    "# Short Memory",
    "",
    `~${estimateTokens(JSON.stringify(recent))} raw memory tokens distilled for daily agent startup.`,
    "",
    ...section("Latest Decisions", decisions.map((entry) => `${entry.title}${entry.content ? ` - ${entry.content}` : ""}`)),
    ...section("Active Warnings", warnings.map((entry) => entry.title)),
    ...section("Latest Handoff", summarizeHandoff(handoff)),
  ];

  const workingLines = [
    "# Working Memory",
    "",
    ...section("Active Task State", summarizeHandoff(handoff)),
    ...section("Recent Changed Files", unique(recent.flatMap((entry) => entry.files)).slice(0, 20)),
    ...section("Recent Memory Entries", recent.map((entry) => `[${entry.type}] ${entry.title}${entry.content ? ` - ${entry.content}` : ""}`)),
  ];

  const deepLines = [
    "# Deep Memory",
    "",
    ...section("Full Memory History", memories.map((entry) => `${entry.createdAt} [${entry.type}] ${entry.title}${entry.content ? ` - ${entry.content}` : ""}`)),
    ...section("Latest Handoff Snapshot", summarizeHandoff(handoff)),
  ];

  return {
    short: shortLines.join("\n"),
    working: workingLines.join("\n"),
    deep: deepLines.join("\n"),
  };
}
