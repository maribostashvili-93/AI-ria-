import { promises as fs } from "node:fs";
import { estimateTokens } from "../compression/tokenizer.js";
import { addMemory } from "./memory-store.js";

export interface ConversationSummary {
  markdown: string;
  decisions: string[];
  warnings: string[];
  nextSteps: string[];
  filesMentioned: string[];
  rawTokens: number;
  summaryTokens: number;
  savedMemories: number;
}

const DECISION_RE = /\b(decided|decision|we will|let's use|chose|chosen|going with|instead of|switched to|agreed)\b/i;
const WARNING_RE = /\b(do not|don't|never|avoid|warning|careful|must not|breaking|danger)\b/i;
const NEXT_RE = /\b(next step|todo|to do|remaining|still need|follow.?up|later we)\b/i;
const FILE_RE = /[\w./-]+\.(tsx?|jsx?|css|scss|html?|json|md|py|vue|svelte)\b/g;

function clean(line: string): string {
  return line.replace(/^[-*>#\s]+/, "").trim();
}

/**
 * Compress an agent conversation log into durable project memory.
 * Heuristic, offline, agent-neutral: pulls decisions, warnings, next steps,
 * and file mentions out of the noise — inspired by claude-mem's observe→compress→store loop.
 */
export async function compressConversation(root: string, conversationFile: string, opts: { save?: boolean; agent?: string } = {}): Promise<ConversationSummary> {
  const raw = await fs.readFile(conversationFile, "utf8");
  const lines = raw.split("\n");

  const decisions = new Set<string>();
  const warnings = new Set<string>();
  const nextSteps = new Set<string>();
  const filesMentioned = new Set<string>();

  for (const line of lines) {
    const c = clean(line);
    if (c.length < 8 || c.length > 300) continue;
    if (DECISION_RE.test(c)) decisions.add(c);
    else if (WARNING_RE.test(c)) warnings.add(c);
    else if (NEXT_RE.test(c)) nextSteps.add(c);
    for (const m of c.matchAll(FILE_RE)) filesMentioned.add(m[0]);
  }

  const section = (title: string, items: Set<string>, cap = 20) =>
    items.size ? [`## ${title}`, "", ...[...items].slice(0, cap).map((i) => `- ${i}`), ""] : [];

  const markdown = [
    "# Conversation Summary",
    "",
    `Source: ${conversationFile} · ${new Date().toISOString()}`,
    "",
    ...section("Decisions", decisions),
    ...section("Warnings", warnings),
    ...section("Next Steps", nextSteps),
    ...section("Files Mentioned", filesMentioned, 30),
  ].join("\n");

  let savedMemories = 0;
  if (opts.save !== false) {
    for (const d of [...decisions].slice(0, 10)) {
      await addMemory(root, { type: "decision", title: d, tags: ["conversation"], agent: opts.agent });
      savedMemories++;
    }
    for (const w of [...warnings].slice(0, 10)) {
      await addMemory(root, { type: "warning", title: w, tags: ["conversation"], agent: opts.agent });
      savedMemories++;
    }
  }

  return {
    markdown,
    decisions: [...decisions],
    warnings: [...warnings],
    nextSteps: [...nextSteps],
    filesMentioned: [...filesMentioned],
    rawTokens: estimateTokens(raw),
    summaryTokens: estimateTokens(markdown),
    savedMemories,
  };
}
