import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { scanRepo } from "../repo/scanner.js";
import { generateArchitectureMd, generateFeaturesMd, generateAgentsMd, generateAgentContextMd } from "../repo/analyzer.js";
import { buildContextPack } from "../compression/compressor.js";
import { analyzeDesign } from "../design/analyzer.js";
import { generateDesignMd } from "../design/generator.js";
import { scanSecurity } from "../security/scanner.js";
import { runSkill, listSkills } from "../skills/registry.js";
import { FigmaClient, extractFromFigmaFile } from "../figma/client.js";
import { compareFigmaToCode, diffToMarkdown } from "../figma/compare.js";
import { saveMemory, buildDesignMemory, loadDesignMemory, designMemoryToMarkdown } from "../memory/memory-store.js";
import { searchMemories, hitsToMarkdown } from "../memory/memory-search.js";
import { compressMemories } from "../memory/memory-compress.js";
import { createHandoff, loadHandoff, handoffToMarkdown } from "../memory/memory-handoff.js";
import { loadMemories } from "../memory/memory-index.js";

const text = (s: string) => ({ content: [{ type: "text" as const, text: s }] });
const json = (v: unknown) => text(JSON.stringify(v, null, 2));
const pathArg = { path: z.string().default(".").describe("Repository path") };

/**
 * v0.1: MCP server. Exposes AI RIA to Cursor, Claude Code, Windsurf, etc.
 * Tool names use underscores (MCP naming rules): repo.scan → repo_scan.
 */
export function createServer(): McpServer {
  const server = new McpServer({ name: "ai-ria", version: "0.2.0" });

  server.tool("repo_scan", "Scan a repository and return its intelligence map", pathArg, async ({ path }) => json(await scanRepo(path)));

  server.tool("repo_analyze", "Generate agent-readable knowledge docs (architecture, features, agent rules, agent context)", pathArg, async ({ path }) => {
    const map = await scanRepo(path);
    return json({
      architecture: generateArchitectureMd(map),
      features: generateFeaturesMd(map),
      agents: generateAgentsMd(map),
      agentContext: generateAgentContextMd(map),
    });
  });

  server.tool("context_compress", "Build a token-efficient context pack for the repository", pathArg, async ({ path }) => {
    const map = await scanRepo(path);
    return json(await buildContextPack(path, map));
  });

  server.tool("design_generate", "Generate DESIGN.md content from detected design tokens", pathArg, async ({ path }) => {
    const map = await scanRepo(path);
    const report = await analyzeDesign(path);
    return text(generateDesignMd(report, map));
  });

  server.tool(
    "figma_extract",
    "Extract design tokens and components from a Figma file (API via FIGMA_TOKEN, or local JSON export)",
    { fileKey: z.string().optional().describe("Figma file key (API mode)"), localFile: z.string().optional().describe("Path to a local Figma JSON export") },
    async ({ fileKey, localFile }) => {
      const client = new FigmaClient();
      const file = localFile ? await client.loadLocalFile(localFile) : await client.fetchFile(fileKey ?? "");
      return json(extractFromFigmaFile(file));
    },
  );

  server.tool(
    "figma_compare",
    "Compare extracted Figma tokens against the repository's code tokens",
    { ...pathArg, figmaTokensFile: z.string().describe("Path to figma-tokens.json (from figma_extract)") },
    async ({ path, figmaTokensFile }) => {
      const { promises: fs } = await import("node:fs");
      const figma = JSON.parse(await fs.readFile(figmaTokensFile, "utf8"));
      const code = await analyzeDesign(path);
      const diff = compareFigmaToCode(figma, code);
      return text(diffToMarkdown(diff, figma.source ?? figmaTokensFile));
    },
  );

  server.tool("security_scan", "Scan the repository for secrets and unsafe patterns (report only)", pathArg, async ({ path }) => json(await scanSecurity(path)));

  server.tool(
    "skill_run",
    `Run an executable agent skill. Available: ${listSkills().map((s) => s.name).join(", ")}`,
    { ...pathArg, skill: z.string().describe("Skill name") },
    async ({ path, skill }) => json(await runSkill(skill, path)),
  );

  server.tool(
    "memory_save",
    "Save a project-scoped memory entry (decision, architecture, design, security, note) other agents will see",
    {
      ...pathArg,
      task: z.string().describe("What was being worked on"),
      decision: z.string().describe("What was decided"),
      reason: z.string().optional().describe("Why"),
      type: z.enum(["decision", "architecture", "design", "security", "note"]).default("decision"),
      files: z.array(z.string()).default([]).describe("Affected files"),
      tags: z.array(z.string()).default([]),
      agent: z.string().optional().describe("Which agent made the decision"),
    },
    async ({ path, ...input }) => json(await saveMemory(path, input)),
  );

  server.tool(
    "memory_search",
    "Search project memory by topic — returns previous decisions, reasons, and affected files",
    { ...pathArg, query: z.string().describe("Topic, e.g. 'product cards'"), limit: z.number().int().positive().default(10) },
    async ({ path, query, limit }) => text(hitsToMarkdown(query, await searchMemories(path, query, limit))),
  );

  server.tool("memory_compress", "Distill all project memories into one compact markdown pack (decisions kept, noise dropped)", pathArg, async ({ path }) => {
    const pack = await compressMemories(path);
    return text(pack.markdown);
  });

  server.tool(
    "handoff_create",
    "Create a handoff.json so another agent can resume this task; recent decisions and design rules are injected automatically",
    {
      ...pathArg,
      task: z.string(),
      completed: z.array(z.string()).default([]),
      remaining: z.array(z.string()).default([]),
      warnings: z.array(z.string()).default([]),
      agent: z.string().optional(),
    },
    async ({ path, ...input }) => json((await createHandoff(path, input)).handoff),
  );

  server.tool(
    "handoff_load",
    "Load the latest handoff (or a specific id) as agent-ready markdown to resume where the previous agent stopped",
    { ...pathArg, id: z.string().optional() },
    async ({ path, id }) => {
      const h = await loadHandoff(path, id);
      return h ? text(handoffToMarkdown(h)) : text("No handoff found.");
    },
  );

  server.tool("design_recall", "Recall Design Memory (rules, tokens, component→code map); built from code/Figma tokens if missing", pathArg, async ({ path }) => {
    let memory = await loadDesignMemory(path);
    if (!memory) {
      const report = await analyzeDesign(path);
      const designEntries = (await loadMemories(path)).filter((e) => e.type === "design");
      memory = await buildDesignMemory(path, report.tokens, designEntries);
    }
    return text(designMemoryToMarkdown(memory));
  });

  return server;
}

export const MCP_TOOLS = [
  "repo_scan", "repo_analyze", "context_compress", "design_generate",
  "figma_extract", "figma_compare", "security_scan", "skill_run",
  "memory_save", "memory_search", "memory_compress", "handoff_create", "handoff_load", "design_recall",
];

export async function startServer(): Promise<void> {
  const server = createServer();
  await server.connect(new StdioServerTransport());
  console.error(`ai-ria MCP server running on stdio. Tools: ${MCP_TOOLS.join(", ")}`);
}
