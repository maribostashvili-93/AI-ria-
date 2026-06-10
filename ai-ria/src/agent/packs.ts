import { analyzeDesign } from "../design/analyzer.js";
import { figmaSummaryMarkdown } from "../figma/client.js";
import { buildContextPack, compressRepoMap, estimateTokens } from "../compression/compressor.js";
import { readRiaFile } from "../core/paths.js";
import { FigmaTokensSchema, RepoMap, SecurityReport } from "../core/types.js";
import { loadHandoff } from "../memory/memory-handoff.js";
import { loadDesignMemory, loadMemories } from "../memory/memory-store.js";
import { scanRepo } from "../repo/scanner.js";
import { scanSecurity } from "../security/scanner.js";

export interface TokenReport {
  generatedAt: string;
  rawTokenCount: number;
  compressedTokenCount: number;
  compressionRatio: number;
  preserved: string[];
  removed: string[];
  whyEnough: string;
}

function buildTokenReport(rawTokenCount: number, compressedTokenCount: number, preserved: string[], removed: string[], whyEnough: string): TokenReport {
  return {
    generatedAt: new Date().toISOString(),
    rawTokenCount,
    compressedTokenCount,
    compressionRatio: Number((compressedTokenCount / Math.max(rawTokenCount, 1)).toFixed(4)),
    preserved,
    removed,
    whyEnough,
  };
}

async function loadImportedFigmaTokens(root: string) {
  const raw = (await readRiaFile(root, "figma/figma-tokens.json")) ?? (await readRiaFile(root, "figma-tokens.json"));
  if (!raw) return null;
  try {
    return FigmaTokensSchema.parse(JSON.parse(raw));
  } catch {
    return null;
  }
}

export async function buildDesignPack(root: string): Promise<{ markdown: string; report: TokenReport }> {
  const design = await analyzeDesign(root);
  const memory = await loadDesignMemory(root);
  const figmaTokens = await loadImportedFigmaTokens(root);
  const figmaSummary = figmaTokens ? figmaSummaryMarkdown(figmaTokens, []) : "";

  const lines = [
    "# Design Pack",
    "",
    "## Brand Colors",
    "",
    ...(design.tokens.filter((token) => /color/i.test(token.name)).map((token) => `- ${token.name}: \`${token.value}\``)),
    "",
    "## Typography",
    "",
    ...(figmaTokens?.typography.map((token) => `- ${token.name}: ${token.fontFamily} ${token.fontSize}px`) ?? []),
    "",
    "## Spacing Rules",
    "",
    ...(figmaTokens?.spacing.map((token) => `- ${token.name}: \`${token.value}\``) ?? []),
    "",
    "## Component Rules",
    "",
    ...(memory?.rules.map((rule) => `- ${rule}`) ?? ["- Reuse existing React components before creating new ones."]),
    "",
    "## Page Layout Rules",
    "",
    "- Keep layout changes consistent with existing route structure and shared shell patterns.",
    "- Preserve role-based routing boundaries and auth flow assumptions.",
    "",
    "## Do-Not-Change Rules",
    "",
    "- Do not introduce new visual systems alongside the existing one without explicit intent.",
    "- Do not bypass shared layout/auth patterns for one-off pages.",
    "",
    "## Visual Consistency Warnings",
    "",
    ...(figmaSummary ? figmaSummary.split("\n").map((line) => line.trim()).filter(Boolean).map((line) => `- ${line.replace(/^[-# ]+/, "")}`) : ["- No imported Figma summary found; relying on code-derived design signals only."]),
    "",
  ];

  const markdown = lines.join("\n");
  const rawTokenCount = estimateTokens(JSON.stringify({ design, memory, figmaTokens }));
  const compressedTokenCount = estimateTokens(markdown);
  return {
    markdown,
    report: buildTokenReport(
      rawTokenCount,
      compressedTokenCount,
      ["colors", "typography", "spacing", "component rules", "layout rules"],
      ["raw component trees", "duplicate token listings", "verbose design chatter"],
      "This pack preserves the design rules an implementation agent needs without shipping the full design export.",
    ),
  };
}

function relevantFileLines(map: RepoMap): string[] {
  return map.importantFiles.concat(map.entryPoints, map.components.slice(0, 8), map.routes.slice(0, 8)).slice(0, 16);
}

function warningLines(security: SecurityReport, memories: Awaited<ReturnType<typeof loadMemories>>, handoffWarnings: string[]): string[] {
  return [...new Set([
    ...handoffWarnings,
    ...memories.filter((entry) => entry.type === "warning" || entry.type === "security-note").map((entry) => entry.title),
    ...security.findings.slice(0, 5).map((finding) => `${finding.severity}: ${finding.message} (${finding.file}:${finding.line})`),
  ])];
}

export async function buildAgentPack(root: string): Promise<{ markdown: string; report: TokenReport }> {
  const map = await scanRepo(root);
  const context = await buildContextPack(root, map);
  const design = await analyzeDesign(root);
  const security = await scanSecurity(root);
  const handoff = await loadHandoff(root);
  const memories = await loadMemories(root);
  const designMemory = await loadDesignMemory(root);
  const summary = compressRepoMap(map).summary;
  const latestDecisions = memories
    .filter((entry) => entry.type === "decision" || entry.type === "architecture-note")
    .slice(-6)
    .reverse()
    .map((entry) => `${entry.title}${entry.content ? ` - ${entry.content}` : ""}`);

  const warnings = warningLines(security, memories, handoff?.warnings ?? []);
  const relevantFiles = relevantFileLines(map);

  const lines = [
    "# AGENT PACK",
    "",
    "## Project Summary",
    "",
    summary,
    "",
    "## Architecture Summary",
    "",
    `Framework: ${map.framework}`,
    `Routes: ${map.routes.length}`,
    `Components: ${map.components.length}`,
    `Entry points: ${map.entryPoints.join(", ") || "none"}`,
    "",
    "## Design Summary",
    "",
    `Code tokens detected: ${design.tokenCount}`,
    `Design memory rules: ${designMemory?.rules.length ?? 0}`,
    "",
    "## Latest Decisions",
    "",
    ...(latestDecisions.length ? latestDecisions.map((item) => `- ${item}`) : ["- No saved decisions yet."]),
    "",
    "## Active Task",
    "",
    ...(handoff ? [`- ${handoff.task}`] : ["- No active handoff yet."]),
    "",
    "## Handoff Notes",
    "",
    ...(handoff ? [...handoff.completed.map((item) => `- Done: ${item}`), ...handoff.remaining.map((item) => `- Remaining: ${item}`), ...(handoff.nextAction ? [`- Next: ${handoff.nextAction}`] : [])] : ["- No handoff notes yet."]),
    "",
    "## Warnings",
    "",
    ...(warnings.length ? warnings.map((item) => `- ${item}`) : ["- No active warnings."]),
    "",
    "## Most Relevant Files",
    "",
    ...relevantFiles.map((file) => `- ${file}`),
    "",
    "## Token Saving Report",
    "",
    `- Context pack: ~${context.totalTokens} vs ~${context.originalTokenEstimate} raw (ratio ${context.compressionRatio})`,
    `- Relevant files included: ${relevantFiles.length}`,
    `- Memory items referenced: ${latestDecisions.length}`,
    "",
  ];

  const markdown = lines.join("\n");
  const rawTokenCount = estimateTokens(JSON.stringify({ map, design, security, handoff, memories, context }));
  const compressedTokenCount = estimateTokens(markdown);
  return {
    markdown,
    report: buildTokenReport(
      rawTokenCount,
      compressedTokenCount,
      ["repo summary", "architecture", "design rules", "decisions", "handoff", "warnings", "relevant files"],
      ["full file bodies", "duplicate context", "non-essential history"],
      "This pack is enough for the next agent because it preserves the active task state and the highest-value repo/design signals.",
    ),
  };
}
