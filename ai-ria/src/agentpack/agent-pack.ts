import { readRiaFile, writeRiaFile } from "../core/paths.js";
import { demoteHeadings } from "../output/markdown.js";
import { estimateTokens } from "../compression/tokenizer.js";
import { compressMemories } from "../memory/memory-compressor.js";
import { loadHandoff, handoffToMarkdown } from "../memory/memory-handoff.js";
import { buildDesignPack } from "../design/designmd.js";

export interface AgentPackSection {
  name: string;
  /** lower = more important; provider packs drop high numbers first */
  priority: number;
  content: string;
}

export interface AgentPackData {
  generatedAt: string;
  sections: AgentPackSection[];
  missing: string[];
  tokens: number;
}

const excerpt = (text: string, maxLines: number) => {
  const lines = text.split("\n");
  return lines.length <= maxLines ? text : lines.slice(0, maxLines).join("\n") + "\n…(see source file for the rest)";
};

/**
 * Collect everything AI RIA knows into ordered sections.
 * AGENT_PACK.md is the one file the next agent reads before editing.
 */
export async function collectAgentPack(root: string): Promise<AgentPackData> {
  const sections: AgentPackSection[] = [];
  const missing: string[] = [];

  const agentContext = await readRiaFile(root, "AGENT_CONTEXT.md");
  if (agentContext) sections.push({ name: "Project", priority: 1, content: excerpt(agentContext, 60) });
  else missing.push("AGENT_CONTEXT.md (run `ria analyze`)");

  const contextPack = (await readRiaFile(root, "context/context-pack.md")) ?? (await readRiaFile(root, "context-pack.md"));
  if (contextPack) sections.push({ name: "Compressed Repo Context", priority: 3, content: excerpt(contextPack, 120) });
  else missing.push("context pack (run `ria context build`)");

  const tokenReport = await readRiaFile(root, "context/token-report.json");
  if (tokenReport) {
    try {
      const r = JSON.parse(tokenReport);
      sections.push({
        name: "Token Report",
        priority: 6,
        content: `~${r.compressedTokens} tokens vs ~${r.rawTokens} raw (ratio ${r.compressionRatio}). Included ${r.includedFiles?.length ?? 0} files, excluded ${r.excludedFiles?.length ?? 0}.`,
      });
    } catch { /* ignore */ }
  }

  const memoryPack = await compressMemories(root);
  if (memoryPack.entryCount > 0) sections.push({ name: "Short Memory", priority: 2, content: memoryPack.markdown });
  else missing.push("memories (use `ria memory add`)");

  const handoff = await loadHandoff(root);
  if (handoff) sections.push({ name: "Latest Handoff", priority: 1, content: handoffToMarkdown(handoff) });
  else missing.push("handoff (run `ria handoff create`)");

  const designPack = await buildDesignPack(root);
  sections.push({ name: "Design Pack", priority: 4, content: excerpt(designPack, 80) });

  const security = await readRiaFile(root, "security-report.json");
  if (security) {
    try {
      const report = JSON.parse(security);
      const serious = (report.findings ?? []).filter((f: { severity: string }) => f.severity === "critical" || f.severity === "high");
      if (serious.length) {
        sections.push({
          name: "Security Warnings",
          priority: 1,
          content: serious.slice(0, 15).map((f: { file: string; line: number; message: string }) => `- ${f.file}:${f.line} — ${f.message}`).join("\n"),
        });
      }
    } catch { /* ignore */ }
  } else missing.push("security report (run `ria security`)");

  const generatedAt = new Date().toISOString();
  const tokens = sections.reduce((sum, s) => sum + estimateTokens(s.content), 0);
  return { generatedAt, sections, missing, tokens };
}

/** Render the full AGENT_PACK.md. */
export function agentPackToMarkdown(data: AgentPackData): string {
  const lines: string[] = [
    "# AGENT PACK",
    "",
    `Generated: ${data.generatedAt} · ~${data.tokens} tokens`,
    "",
    "**Read this file before editing the project.** Deeper context: `.ria/memory/deep-memory.md`, `.ria/context/context-pack.md`.",
    "",
  ];
  for (const s of [...data.sections].sort((a, b) => a.priority - b.priority)) {
    // Section titles are h2; the document embedded under them starts at h3.
    lines.push(`## ${s.name}`, "", demoteHeadings(s.content, 2), "", "---", "");
  }
  if (data.missing.length) {
    lines.push("## Missing Inputs", "", ...data.missing.map((m) => `- ${m}`), "");
  }
  return lines.join("\n");
}

/** `ria agent-pack` — write .ria/agent-pack/AGENT_PACK.md + agent-pack.json. */
export async function buildAgentPack(root: string): Promise<{ data: AgentPackData; files: string[] }> {
  const data = await collectAgentPack(root);
  const markdown = agentPackToMarkdown(data);
  const files = [
    await writeRiaFile(root, "agent-pack/AGENT_PACK.md", markdown),
    await writeRiaFile(root, "agent-pack/agent-pack.json", JSON.stringify({
      generatedAt: data.generatedAt,
      tokens: data.tokens,
      sections: data.sections.map((s) => ({ name: s.name, priority: s.priority, tokens: estimateTokens(s.content) })),
      missing: data.missing,
    }, null, 2)),
  ];

  // Token accounting: every pack generation lands in the ledger.
  let rawTokens = data.tokens;
  const tokenReport = await readRiaFile(root, "context/token-report.json");
  if (tokenReport) {
    try {
      rawTokens = Math.max(rawTokens, Number(JSON.parse(tokenReport).rawTokens) || 0);
    } catch { /* ignore */ }
  }
  const { recordPackGeneration } = await import("../tokens/token-ledger.js");
  await recordPackGeneration(root, { agent: "any", task: "agent pack build", pack: "AGENT_PACK.md", rawTokens, compressedTokens: estimateTokens(markdown) });

  return { data, files };
}
