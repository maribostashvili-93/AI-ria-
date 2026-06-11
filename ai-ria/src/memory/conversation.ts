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
  rawTokenEstimate: number;
  compressedTokenEstimate: number;
  compressionRatio: number;
}

function collect(lines: string[], predicate: (line: string) => boolean, map?: (line: string) => string): string[] {
  return [...new Set(lines.filter(predicate).map((line) => (map ? map(line) : line.trim())).filter(Boolean))];
}

function fileMentions(lines: string[]): string[] {
  const files = new Set<string>();
  const re = /([A-Za-z0-9_\-/\\]+\.(?:tsx?|jsx?|css|scss|md|json))/g;
  for (const line of lines) {
    for (const match of line.matchAll(re)) files.add(match[1]);
  }
  return [...files];
}

export async function compressConversation(conversationFile: string): Promise<ConversationSummary> {
  const raw = await fs.readFile(conversationFile, "utf8");
  const lines = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const decisions = collect(lines, (line) => /(decision|decided|choose|keep|use )/i.test(line));
  const completedTasks = collect(lines, (line) => /(done|completed|implemented|finished|fixed)/i.test(line));
  const remainingTasks = collect(lines, (line) => /(remaining|todo|next|left to|still need)/i.test(line));
  const warnings = collect(lines, (line) => /(warning|avoid|risk|do not|don't)/i.test(line));
  const designRules = collect(lines, (line) => /(design|spacing|color|typography|radius|component|visual)/i.test(line));
  const securityNotes = collect(lines, (line) => /(security|secret|token|auth|credential|vulnerability)/i.test(line));
  const nextActions = collect(lines, (line) => /(next action|next step|should do next|follow-up)/i.test(line));
  const changedFiles = fileMentions(lines);

  const markdown = [
    "# Conversation Summary",
    "",
    "## Decisions",
    ...decisions.map((item) => `- ${item}`),
    "",
    "## Completed Tasks",
    ...completedTasks.map((item) => `- ${item}`),
    "",
    "## Remaining Tasks",
    ...remainingTasks.map((item) => `- ${item}`),
    "",
    "## Changed Files",
    ...changedFiles.map((item) => `- ${item}`),
    "",
    "## Warnings",
    ...warnings.map((item) => `- ${item}`),
    "",
    "## Design Rules",
    ...designRules.map((item) => `- ${item}`),
    "",
    "## Security Notes",
    ...securityNotes.map((item) => `- ${item}`),
    "",
    "## Next Actions",
    ...nextActions.map((item) => `- ${item}`),
    "",
  ].join("\n");

  const rawTokenEstimate = estimateTokens(raw);
  const compressedTokenEstimate = estimateTokens(markdown);
  return {
    source: path.resolve(conversationFile),
    generatedAt: new Date().toISOString(),
    decisions,
    completedTasks,
    remainingTasks,
    changedFiles,
    warnings,
    designRules,
    securityNotes,
    nextActions,
    rawTokenEstimate,
    compressedTokenEstimate,
    compressionRatio: Number((compressedTokenEstimate / Math.max(rawTokenEstimate, 1)).toFixed(4)),
  };
}

export function conversationSummaryToMarkdown(summary: ConversationSummary): string {
  const lines: string[] = [
    "# Conversation Summary",
    "",
    `Source: ${summary.source}`,
    `Generated: ${summary.generatedAt}`,
    `Tokens: ~${summary.compressedTokenEstimate} vs ~${summary.rawTokenEstimate} raw (ratio ${summary.compressionRatio})`,
    "",
  ];
  const add = (title: string, items: string[]) => {
    if (!items.length) return;
    lines.push(`## ${title}`, "", ...items.map((item) => `- ${item}`), "");
  };
  add("Decisions", summary.decisions);
  add("Completed Tasks", summary.completedTasks);
  add("Remaining Tasks", summary.remainingTasks);
  add("Changed Files", summary.changedFiles);
  add("Warnings", summary.warnings);
  add("Design Rules", summary.designRules);
  add("Security Notes", summary.securityNotes);
  add("Next Actions", summary.nextActions);
  return lines.join("\n");
}
