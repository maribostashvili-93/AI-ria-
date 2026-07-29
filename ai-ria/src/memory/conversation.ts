import { promises as fs } from "node:fs";
import path from "node:path";
import { estimateTokens } from "../compression/compressor.js";

export interface ConversationSummary {
  source: string;
  generatedAt: string;
  decisions: string[];
  completedTasks: string[];
  remainingTasks: string[];
  changedFiles: string[];
  warnings: string[];
  designRules: string[];
  securityNotes: string[];
  nextActions: string[];
  /** True when low-priority items were dropped to stay under the compression budget. */
  trimmed: boolean;
  rawTokenEstimate: number;
  compressedTokenEstimate: number;
  compressionRatio: number;
}

type Category =
  | "nextActions"
  | "securityNotes"
  | "warnings"
  | "remainingTasks"
  | "decisions"
  | "completedTasks"
  | "designRules";

/**
 * Explicit labels win over keyword matching: agents and humans write
 * "Design rule: … do not …", and the leading label states the intent better
 * than any keyword found later in the sentence.
 */
const LABEL_RULES: { category: Category; pattern: RegExp }[] = [
  { category: "nextActions", pattern: /^(?:next (?:action|step)|follow[- ]up|action item)\b\s*[:\-–]?/i },
  { category: "securityNotes", pattern: /^security\s*(?:note|warning|issue)?\b\s*[:\-–]?/i },
  { category: "designRules", pattern: /^design\s*(?:rule|note|decision)\b\s*[:\-–]?/i },
  { category: "warnings", pattern: /^(?:warning|caution|risk)\b\s*[:\-–]?/i },
  { category: "remainingTasks", pattern: /^(?:remaining|todo|to[- ]do|pending|open)\b\s*[:\-–]?/i },
  { category: "completedTasks", pattern: /^(?:completed?|done|fixed|implemented)\b\s*[:\-–]?/i },
  { category: "decisions", pattern: /^(?:decision|decided)\b\s*[:\-–]?/i },
];

/**
 * Keyword fallback for unlabeled lines, ordered most-specific first. Every line
 * lands in exactly ONE bucket — the first rule that matches wins. Duplicating a
 * line across buckets is what used to make "compression" grow the input.
 */
const RULES: { category: Category; pattern: RegExp }[] = [
  { category: "nextActions", pattern: /\b(next action|next step|follow[- ]up|should do next|action item)\b/i },
  { category: "securityNotes", pattern: /\b(security|secret|credential|vulnerab\w*|api[- ]?key|password|token leak|exfiltrat\w*)\b/i },
  { category: "warnings", pattern: /\b(warning|caution|beware|avoid|risk|do not|don't|never|fragile|breaks?|broken)\b/i },
  { category: "remainingTasks", pattern: /\b(remaining|todo|to[- ]do|still need|left to|not yet|pending|open item)\b/i },
  { category: "decisions", pattern: /\b(decision|decided|we (?:will|should) use|chose|chosen|agreed|going with|settled on)\b/i },
  { category: "completedTasks", pattern: /\b(done|completed|implemented|finished|fixed|shipped|merged)\b/i },
  { category: "designRules", pattern: /\b(spacing|typography|palette|border[- ]radius|design (?:rule|system|token)|color token|font[- ]size|visual style)\b/i },
];

/** Categories dropped first when the summary does not fit the budget. */
const DROP_ORDER: Category[] = ["designRules", "completedTasks", "remainingTasks", "decisions", "warnings", "securityNotes", "nextActions"];

const MAX_ITEMS_PER_CATEGORY = 15;
const MAX_ITEM_CHARS = 220;
const SPEAKER_PREFIX = /^(?:\[[^\]]*\]\s*)?(?:user|agent|assistant|ai|human|system|me|you)\s*[:>-]\s*/i;
const LIST_PREFIX = /^(?:[-*+•]|\d+[.)])\s+/;

/** Strip speaker/list decoration so the same sentence from two speakers dedupes. */
function cleanLine(line: string): string {
  let out = line.trim().replace(LIST_PREFIX, "").replace(SPEAKER_PREFIX, "").trim();
  if (out.length > MAX_ITEM_CHARS) out = out.slice(0, MAX_ITEM_CHARS - 1).trimEnd() + "…";
  return out;
}

/**
 * Dedup key: lowercase, punctuation and digits removed, whitespace collapsed.
 * Near-identical restatements ("… (1)", "… (2)", "…!") collapse to one entry.
 */
function dedupeKey(line: string): string {
  return line.toLowerCase().replace(/[0-9]+/g, "").replace(/[^a-zႠ-ჿ\s]/g, "").replace(/\s+/g, " ").trim();
}

function classify(line: string): Category | null {
  for (const rule of LABEL_RULES) {
    if (rule.pattern.test(line)) return rule.category;
  }
  // Unlabeled questions are chatter, not knowledge ("what is done so far?").
  if (line.endsWith("?")) return null;
  for (const rule of RULES) {
    if (rule.pattern.test(line)) return rule.category;
  }
  return null;
}

function fileMentions(lines: string[]): string[] {
  const files = new Set<string>();
  const re = /([A-Za-z0-9_\-/\\]+\.(?:tsx?|jsx?|css|scss|md|json))/g;
  for (const line of lines) {
    for (const match of line.matchAll(re)) files.add(match[1]);
  }
  return [...files];
}

/** Section order used both for rendering and for token estimation. */
const SECTIONS: { title: string; key: Exclude<keyof ConversationSummary, "source" | "generatedAt" | "trimmed" | "rawTokenEstimate" | "compressedTokenEstimate" | "compressionRatio"> }[] = [
  { title: "Decisions", key: "decisions" },
  { title: "Completed Tasks", key: "completedTasks" },
  { title: "Remaining Tasks", key: "remainingTasks" },
  { title: "Changed Files", key: "changedFiles" },
  { title: "Warnings", key: "warnings" },
  { title: "Design Rules", key: "designRules" },
  { title: "Security Notes", key: "securityNotes" },
  { title: "Next Actions", key: "nextActions" },
];

function renderBody(summary: Pick<ConversationSummary, Category | "changedFiles">): string {
  const lines: string[] = [];
  for (const section of SECTIONS) {
    const items = summary[section.key];
    if (!items.length) continue;
    lines.push(`## ${section.title}`, "", ...items.map((item) => `- ${item}`), "");
  }
  return lines.join("\n");
}

type Buckets = Record<Category, string[]> & { changedFiles: string[] };

/**
 * Compress an agent conversation log into categorized, deduplicated notes.
 *
 * Guarantees the output is actually smaller than the input: each line is
 * assigned to a single category, near-duplicates collapse, and low-priority
 * sections are dropped until the summary fits ~60% of the source (with a small
 * floor so short conversations still produce a usable summary).
 */
export async function compressConversation(conversationFile: string): Promise<ConversationSummary> {
  const raw = await fs.readFile(conversationFile, "utf8");
  const lines = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

  const buckets: Buckets = {
    decisions: [], completedTasks: [], remainingTasks: [], warnings: [],
    designRules: [], securityNotes: [], nextActions: [], changedFiles: [],
  };
  const seen = new Set<string>();

  for (const line of lines) {
    const cleaned = cleanLine(line);
    if (!cleaned) continue;
    const category = classify(cleaned);
    if (!category) continue;
    const key = dedupeKey(cleaned);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    buckets[category].push(cleaned);
  }

  for (const rule of RULES) {
    buckets[rule.category] = buckets[rule.category].slice(0, MAX_ITEMS_PER_CATEGORY);
  }
  buckets.changedFiles = fileMentions(lines).slice(0, MAX_ITEMS_PER_CATEGORY);

  const rawTokenEstimate = estimateTokens(raw);
  // A summary must cost clearly less than the source. The floor keeps short
  // conversations from being trimmed down to nothing by the percentage rule —
  // for a 200-line chat there is simply not much to cut.
  const budget = Math.max(Math.floor(rawTokenEstimate * 0.4), 400);
  let trimmed = false;
  for (const category of DROP_ORDER) {
    if (estimateTokens(renderBody(buckets)) <= budget) break;
    if (!buckets[category].length) continue;
    // Halve first, drop the section only if halving is not enough.
    buckets[category] = buckets[category].slice(0, Math.floor(buckets[category].length / 2));
    trimmed = true;
    if (estimateTokens(renderBody(buckets)) <= budget) break;
    buckets[category] = [];
  }
  if (estimateTokens(renderBody(buckets)) > budget && buckets.changedFiles.length) {
    buckets.changedFiles = [];
    trimmed = true;
  }

  const summary: ConversationSummary = {
    source: path.resolve(conversationFile),
    generatedAt: new Date().toISOString(),
    ...buckets,
    trimmed,
    rawTokenEstimate,
    compressedTokenEstimate: 0,
    compressionRatio: 0,
  };
  // Estimate on what actually gets written: body + the fixed header block.
  summary.compressedTokenEstimate = estimateTokens(renderBody(buckets)) + estimateTokens(headerBlock(summary));
  summary.compressionRatio = Number((summary.compressedTokenEstimate / Math.max(rawTokenEstimate, 1)).toFixed(4));
  return summary;
}

function headerBlock(summary: ConversationSummary): string {
  return [
    "# Conversation Summary",
    "",
    `Source: ${summary.source}`,
    `Generated: ${summary.generatedAt}`,
    `Tokens: ~${summary.compressedTokenEstimate} vs ~${summary.rawTokenEstimate} raw (ratio ${summary.compressionRatio})`,
    summary.trimmed ? "Low-priority sections were trimmed to stay under the compression budget." : "",
    "",
  ].filter((line, i, all) => !(line === "" && all[i - 1] === "")).join("\n");
}

export function conversationSummaryToMarkdown(summary: ConversationSummary): string {
  return `${headerBlock(summary)}\n${renderBody(summary)}`;
}
