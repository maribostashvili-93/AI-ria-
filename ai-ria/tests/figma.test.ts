import { describe, expect, it } from "vitest";
import path from "node:path";
import { promises as fs } from "node:fs";
import { extractFromFigmaFile, rgbToHex } from "../src/figma/client.js";
import { compareFigmaToCode, diffToMarkdown } from "../src/figma/compare.js";
import { analyzeDesign } from "../src/design/analyzer.js";

const FIXTURE = path.join(__dirname, "..", "examples", "figma-export.json");
const DEMO = path.join(__dirname, "..", "examples", "demo-app");

describe("figma adapter (v0.2)", () => {
  it("converts Figma rgb to hex", () => {
    expect(rgbToHex({ r: 1, g: 1, b: 1 })).toBe("#ffffff");
    expect(rgbToHex({ r: 0, g: 0, b: 0 })).toBe("#000000");
  });

  it("extracts tokens and components from a Figma export", async () => {
    const file = JSON.parse(await fs.readFile(FIXTURE, "utf8"));
    const { tokens, components } = extractFromFigmaFile(file);
    expect(tokens.colors.map((c) => c.value)).toContain("#4f46e5");
    expect(tokens.colors.map((c) => c.value)).toContain("#0ea5e9");
    expect(tokens.typography.some((t) => t.fontFamily === "Inter" && t.fontSize === 16)).toBe(true);
    expect(tokens.radii.map((r) => r.value)).toContain("12px");
    expect(components.map((c) => c.name)).toContain("Button/Primary");
  });

  it("compares Figma tokens with code tokens", async () => {
    const file = JSON.parse(await fs.readFile(FIXTURE, "utf8"));
    const { tokens } = extractFromFigmaFile(file);
    const code = await analyzeDesign(DEMO);
    const diff = compareFigmaToCode(tokens, code);

    expect(diff.matchedColors).toContain("#4f46e5");
    expect(diff.matchedColors).toContain("#0ea5e9");
    // Figma radii 12px/16px don't exist in code (code has 6px)
    expect(diff.missingRadiiInCode).toContain("12px");

    const md = diffToMarkdown(diff, tokens.source);
    expect(md).toContain("Figma ↔ Code Diff");
    expect(md).toContain("Border Radius");
  });
});
