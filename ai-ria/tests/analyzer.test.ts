import { describe, expect, it } from "vitest";
import path from "node:path";
import { scanRepo } from "../src/repo/scanner.js";
import {
  generateArchitectureMd, generateFeaturesMd, generateAgentsMd, generateAgentContextMd, buildSummary,
} from "../src/repo/analyzer.js";
import { analyzeDesign } from "../src/design/analyzer.js";
import { scanSecurity } from "../src/security/scanner.js";
import { buildContextPack } from "../src/compression/compressor.js";

const DEMO = path.join(__dirname, "..", "examples", "demo-app");

describe("repo analyzer (v0.1)", () => {
  it("generates the four knowledge docs", async () => {
    const map = await scanRepo(DEMO);
    const arch = generateArchitectureMd(map);
    const features = generateFeaturesMd(map);
    const agents = generateAgentsMd(map);
    const ctx = generateAgentContextMd(map);

    expect(arch).toContain("Next.js");
    expect(arch).toContain("## Dependencies");
    expect(features).toContain("/about");
    expect(features).toContain("Button.tsx");
    expect(agents).toContain("Agent Instructions");
    expect(agents).toContain("ria security");
    expect(ctx).toContain("Agent Context");
    expect(ctx).toContain(".ria/ARCHITECTURE.md");
  });

  it("builds summary.json rollup", async () => {
    const map = await scanRepo(DEMO);
    const design = await analyzeDesign(DEMO);
    const security = await scanSecurity(DEMO);
    const pack = await buildContextPack(DEMO, map);
    const summary = buildSummary(map, design, security, pack, ["repo-map.json", "summary.json"]);

    expect(summary.tool).toBe("ai-ria");
    expect(summary.framework).toBe("Next.js");
    expect(summary.counts.components).toBeGreaterThanOrEqual(1);
    expect(summary.counts.styles).toBeGreaterThanOrEqual(1);
    expect(summary.counts.designTokens).toBeGreaterThanOrEqual(8);
    expect(summary.counts.securityFindings).toBeGreaterThan(0);
    expect(summary.counts.criticalOrHigh).toBeGreaterThan(0);
    expect(summary.compression.ratio).toBeLessThan(1);
    expect(summary.generatedFiles).toContain("summary.json");
  });
});
