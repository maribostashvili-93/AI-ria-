import { describe, it, expect, beforeAll } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildProviderPack } from "../src/exports/provider-packs.js";
import { importFigmaTokens, figmaToDesignMd, figmaPackToDesignMd } from "../src/figma/figma-token-importer.js";
import { orchestrate, routeProviders } from "../src/orchestration/orchestrator.js";
import { buildUiPlan } from "../src/planning/ui-planner.js";
import { loadDesignMemory } from "../src/memory/memory-store.js";

let root: string;

const ria = (...parts: string[]) => path.join(root, ".ria", ...parts);

beforeAll(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "ria-orch-"));
  await fs.writeFile(path.join(root, "package.json"), JSON.stringify({ name: "shop-demo", description: "e-commerce store with checkout", version: "1.0.0" }), "utf8");
  await fs.writeFile(path.join(root, "index.js"), "const apiKey = \"sk_live_1234567890abcdef\";\nexport function main() { return 1; }\n", "utf8");
  await fs.writeFile(path.join(root, "tokens.json"), JSON.stringify({ colors: { primary: "#FCC204" }, spacing: { md: "16px" }, components: ["Button", "ProductCard"] }), "utf8");
  await importFigmaTokens(root, path.join(root, "tokens.json"));
});

describe("figma to-design-md (v0.4)", () => {
  it("renders imported tokens as a structured DESIGN.md", async () => {
    const { file, pack } = await figmaToDesignMd(root);
    expect(pack.colors.length).toBe(1);
    const md = await fs.readFile(file, "utf8");
    expect(md).toContain("## Colors");
    expect(md).toContain("#FCC204");
    expect(md).toContain("## Do Not Change");
  });

  it("round-trips tokens into design memory", async () => {
    const memory = await loadDesignMemory(root);
    expect(memory?.tokens.some((t) => t.value === "#FCC204")).toBe(true);
  });

  it("fails clearly when nothing was imported", async () => {
    const empty = await fs.mkdtemp(path.join(os.tmpdir(), "ria-orch-empty-"));
    await expect(figmaToDesignMd(empty)).rejects.toThrow(/figma import/);
  });

  it("renders every token section it has data for", () => {
    const md = figmaPackToDesignMd({
      source: "t", importedAt: "now",
      colors: [{ name: "primary", value: "#fff", source: "figma" }],
      typography: [{ name: "body", fontFamily: "Inter", fontSize: 16 }],
      spacing: [], radius: [{ name: "card", value: "12px", source: "figma" }], shadows: [],
      components: [{ name: "Button", type: "COMPONENT" }],
    });
    expect(md).toContain("- body: Inter 16px");
    expect(md).toContain("## Radius");
    expect(md).not.toContain("## Spacing");
  });
});

describe("visual + security provider packs (v0.4)", () => {
  it("builds VISUAL_CONTEXT.md with design knowledge first", async () => {
    const result = await buildProviderPack(root, "visual");
    expect(result.file.endsWith("VISUAL_CONTEXT.md")).toBe(true);
    const md = await fs.readFile(result.file, "utf8");
    const designIdx = md.indexOf("# Design Pack");
    expect(designIdx).toBeGreaterThan(-1);
    expect(md).toContain("# Figma Summary");
    expect(result.tokens).toBeLessThanOrEqual(result.budget + 200);
  });

  it("builds SECURITY_CONTEXT.md with severity-ordered findings first", async () => {
    const { scanSecurity } = await import("../src/security/scanner.js");
    const report = await scanSecurity(root);
    await fs.mkdir(ria(), { recursive: true });
    await fs.writeFile(ria("security-report.json"), JSON.stringify(report), "utf8");
    const result = await buildProviderPack(root, "security");
    expect(result.file.endsWith("SECURITY_CONTEXT.md")).toBe(true);
    const md = await fs.readFile(result.file, "utf8");
    expect(md).toContain("# Security Findings");
    expect(md.indexOf("# Security Findings")).toBeLessThan(md.indexOf("# Design Pack") === -1 ? Infinity : md.indexOf("# Design Pack"));
  });
});

describe("orchestrate with agent routing (v0.4)", () => {
  it("routes a security-sensitive goal to the security pack", async () => {
    const plan = await buildUiPlan(root, "Build e-commerce checkout with payments");
    const providers = routeProviders(plan);
    expect(providers).toContain("visual");
    expect(providers).toContain("security");
    expect(providers).toContain("claude");
  });

  it("builds routed packs and writes ORCHESTRATION.md", async () => {
    const result = await orchestrate(root, "Build e-commerce checkout with payments");
    expect(result.packs.length).toBe(result.routedProviders.length);
    expect(result.securityFindings).toBeGreaterThan(0);
    const md = await fs.readFile(ria("orchestration", "ORCHESTRATION.md"), "utf8");
    expect(md).toContain("## Agent Routing");
    expect(md).toContain("security-agent");
    expect(md).toContain("VISUAL_CONTEXT.md");
    const graph = await fs.readFile(ria("memory", "memory-graph.md"), "utf8");
    expect(graph).toContain("# Memory Graph");
  }, 30_000);
});
