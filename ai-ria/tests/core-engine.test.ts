import { describe, it, expect, beforeAll } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { addMemory, loadMemories } from "../src/memory/memory-store.js";
import { searchMemories } from "../src/memory/memory-search.js";
import { compressMemories } from "../src/memory/memory-compressor.js";
import { compressConversation, conversationSummaryToMarkdown } from "../src/memory/conversation.js";
import { buildMemoryLayers } from "../src/memory/layers.js";
import { createHandoff, loadHandoff, handoffToMarkdown } from "../src/memory/memory-handoff.js";
import { loadIndex } from "../src/memory/memory-index.js";
import { scanRepo } from "../src/repo/scanner.js";
import { buildContextPackV2, contextPackV2ToMarkdown } from "../src/compression/context-pack-builder.js";
import { rankFiles } from "../src/compression/file-ranker.js";
import { compressFile } from "../src/compression/semantic-compressor.js";
import { normalizeFigmaExport, importFigmaTokens } from "../src/figma/figma-token-importer.js";
import { generateFigmaCode } from "../src/figma/figma-codegen.js";
import { importDesignMd, buildDesignPack } from "../src/design/designmd.js";
import { buildAgentPack } from "../src/agentpack/agent-pack.js";
import { buildProviderPack } from "../src/exports/provider-packs.js";

let root: string;

beforeAll(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "ria-core-"));
  await fs.writeFile(path.join(root, "package.json"), JSON.stringify({ name: "demo", version: "1.0.0" }), "utf8");
  await fs.writeFile(path.join(root, "index.html"), "<!doctype html><html><body><h1>Demo</h1></body></html>", "utf8");
  await fs.writeFile(path.join(root, "app.js"), "export function main() { return 1; }\n", "utf8");
  await fs.writeFile(path.join(root, "style.css"), ":root { --primary: #FCC204; }\n.btn { color: var(--primary); }", "utf8");
});

describe("memory engine (v0.1)", () => {
  it("adds memories to memories.jsonl and indexes them", async () => {
    await addMemory(root, { type: "decision", title: "Keep project static HTML", content: "No React migration", tags: ["architecture"] });
    await addMemory(root, { type: "warning", title: "Do not edit payment.js", files: ["payment.js"] });
    await addMemory(root, { type: "design-rule", title: "Primary color is #FCC204" });
    const entries = await loadMemories(root);
    expect(entries.length).toBe(3);
    expect(entries[0].id).toMatch(/^mem_/);
    const index = await loadIndex(root);
    expect(index?.count).toBe(3);
    expect(index?.byType["decision"]).toBe(1);
  });

  it("searches memory by topic", async () => {
    const hits = await searchMemories(root, "static HTML");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].entry.title).toContain("static HTML");
  });

  it("compresses memories into short/working/deep layers", async () => {
    const pack = await compressMemories(root);
    expect(pack.markdown).toContain("Decisions");
    expect(pack.markdown).toContain("Warnings");
    const layers = await buildMemoryLayers(root);
    expect(layers.short).toContain("Keep project static HTML");
    expect(layers.deep).toContain("Full Memory History");
    expect(layers.working).toContain("Recent Memory Entries");
  });

  it("compresses a conversation into a summary", async () => {
    const conv = path.join(root, "conversation.txt");
    await fs.writeFile(conv, [
      "User: what did we decide?",
      "Agent: We decided to keep Bootstrap instead of Tailwind.",
      "Agent: Warning - do not edit payment.js, it is fragile.",
      "Agent: Next step is to refactor products.css.",
    ].join("\n"), "utf8");
    const summary = await compressConversation(conv);
    expect(summary.decisions.length).toBeGreaterThan(0);
    expect(summary.warnings.length).toBeGreaterThan(0);
    expect(summary.changedFiles).toContain("payment.js");
    const md = conversationSummaryToMarkdown(summary);
    expect(md).toContain("Decisions");
  });
});

describe("handoff protocol (v0.1)", () => {
  it("creates and loads a handoff with injected memory", async () => {
    const { handoff } = await createHandoff(root, {
      task: "Improve checkout",
      completed: ["header"],
      remaining: ["cart"],
      filesToAvoid: ["payment.js"],
      nextAction: "Refactor cart.js",
    });
    expect(handoff.decisions.length).toBeGreaterThan(0);
    expect(handoff.warnings.some((w) => w.includes("payment.js"))).toBe(true);
    const loaded = await loadHandoff(root);
    expect(loaded?.task).toBe("Improve checkout");
    expect(handoffToMarkdown(loaded!)).toContain("Next Action");
    const md = await fs.readFile(path.join(root, ".ria", "handoffs", "HANDOFF.md"), "utf8");
    expect(md).toContain("Improve checkout");
  });
});

describe("context compression engine (v0.1)", () => {
  it("ranks files with reasons", async () => {
    const map = await scanRepo(root);
    const { kept, ignored } = rankFiles(map);
    expect(kept.length).toBeGreaterThan(0);
    expect(kept.every((f) => f.reasons.length > 0)).toBe(true);
    expect([...kept, ...ignored].length).toBeGreaterThanOrEqual(map.files.length - 1);
  });

  it("semantically compresses files", () => {
    const code = Array.from({ length: 200 }, (_, i) => `export function f${i}() { return ${i}; }`).join("\n");
    const compressed = compressFile("big.ts", code);
    expect(compressed.truncated).toBe(true);
    expect(compressed.tokens).toBeLessThan(code.length / 4);
  });

  it("builds a budgeted context pack with token report", async () => {
    const map = await scanRepo(root);
    const pack = await buildContextPackV2(root, map, 5000);
    expect(pack.report.compressedTokens).toBeLessThanOrEqual(5000);
    expect(pack.report.rawTokens).toBeGreaterThan(0);
    expect(pack.report.includedFiles.length).toBeGreaterThan(0);
    const md = contextPackV2ToMarkdown(pack);
    expect(md).toContain("kept because");
  });
});

describe("figma + design.md bridge (v0.2)", () => {
  it("normalizes a flat designer token file", () => {
    const pack = normalizeFigmaExport({ colors: { primary: "#FCC204" }, radius: { md: "12px" }, shadows: { card: "0 2px 4px #0002" }, components: ["Button", "Card"] }, "test.json");
    expect(pack.colors[0].value).toBe("#FCC204");
    expect(pack.radius[0].value).toBe("12px");
    expect(pack.shadows.length).toBe(1);
    expect(pack.components.length).toBe(2);
  });

  it("imports figma tokens and generates starter code", async () => {
    const file = path.join(root, "tokens.json");
    await fs.writeFile(file, JSON.stringify({ colors: { primary: "#FCC204" }, components: ["Button"] }), "utf8");
    const { pack } = await importFigmaTokens(root, file);
    expect(pack.colors.length).toBe(1);
    const generated = await generateFigmaCode(root);
    expect(generated.some((f) => f.endsWith("draft.css")));
    const css = await fs.readFile(generated.find((f) => f.endsWith("draft.css"))!, "utf8");
    expect(css).toContain("#FCC204");
  });

  it("imports DESIGN.md rules and builds a design pack", async () => {
    const file = path.join(root, "DESIGN-import.md");
    await fs.writeFile(file, ["# Design", "## Colors", "- primary: #FCC204", "## Do Not Change", "- Never change the logo color"].join("\n"), "utf8");
    const result = await importDesignMd(root, file);
    expect(result.tokens.length).toBe(1);
    expect(result.doNotChange.length).toBe(1);
    const packMd = await buildDesignPack(root);
    expect(packMd).toContain("Design Pack");
  });
});

describe("agent pack + provider exports (v0.1)", () => {
  it("builds AGENT_PACK.md combining everything", async () => {
    const { data } = await buildAgentPack(root);
    expect(data.sections.some((s) => s.name === "Short Memory")).toBe(true);
    expect(data.sections.some((s) => s.name === "Latest Handoff")).toBe(true);
    const md = await fs.readFile(path.join(root, ".ria", "agent-pack", "AGENT_PACK.md"), "utf8");
    expect(md).toContain("AGENT PACK");
    expect(md).toContain("Improve checkout");
  });

  it("builds provider packs within budget and reports removals", async () => {
    const compact = await buildProviderPack(root, "compact");
    expect(compact.tokens).toBeLessThanOrEqual(compact.budget + 200);
    const claude = await buildProviderPack(root, "claude");
    expect(claude.tokens).toBeGreaterThan(0);
    const md = await fs.readFile(path.join(root, ".ria", "exports", "COMPACT_CONTEXT.md"), "utf8");
    expect(md).toContain("Removed for Budget");
  });
});
