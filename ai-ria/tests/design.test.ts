import { describe, expect, it } from "vitest";
import path from "node:path";
import { analyzeDesign, extractTokens } from "../src/design/analyzer.js";
import { generateDesignMd, categorizeTokens } from "../src/design/generator.js";
import { scanRepo } from "../src/repo/scanner.js";

const SAMPLE = path.join(__dirname, "..", "examples", "sample-app");
const DEMO = path.join(__dirname, "..", "examples", "demo-app");

describe("extractTokens", () => {
  it("extracts CSS custom properties", () => {
    const tokens = extractTokens("a.css", `:root { --color-x: red; --gap-sm: 4px; }`);
    expect(tokens).toHaveLength(2);
    expect(tokens[0]).toMatchObject({ name: "--color-x", value: "red" });
  });
});

describe("analyzeDesign", () => {
  it("finds the design doc and tokens in the sample app", async () => {
    const report = await analyzeDesign(SAMPLE);
    expect(report.hasDesignDoc).toBe(true);
    expect(report.tokens.map((t) => t.name)).toContain("--color-primary");
  });

  it("detects tailwind in demo-app", async () => {
    const report = await analyzeDesign(DEMO);
    expect(report.hasTailwindConfig).toBe(true);
  });
});

describe("generateDesignMd (v0.2)", () => {
  it("categorizes tokens and renders DESIGN.md sections", async () => {
    const map = await scanRepo(DEMO);
    const report = await analyzeDesign(DEMO);
    const cats = categorizeTokens(report.tokens);
    expect(cats.colors.length).toBeGreaterThanOrEqual(4);
    expect(cats.radius.length).toBeGreaterThanOrEqual(1);

    const md = generateDesignMd(report, map);
    expect(md).toContain("## Colors");
    expect(md).toContain("--color-primary");
    expect(md).toContain("## Border Radius");
    expect(md).toContain("## Components");
    expect(md).toContain("Rules for Agents");
  });
});
