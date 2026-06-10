import { describe, expect, it } from "vitest";
import path from "node:path";
import { promises as fs } from "node:fs";
import { scanRepo } from "../src/repo/scanner.js";
import { analyzeDesign } from "../src/design/analyzer.js";
import { extractFromFigmaFile } from "../src/figma/client.js";
import { buildUiFixSuggestions, suggestionsToPatch, suggestionsToReport } from "../src/design/uifix.js";

const FIXTURE = path.join(__dirname, "..", "examples", "figma-export.json");
const DEMO = path.join(__dirname, "..", "examples", "demo-app");

describe("ui-fix preview (v0.4)", () => {
  it("suggests token usage for hardcoded colors and radius alignment with Figma", async () => {
    const map = await scanRepo(DEMO);
    const design = await analyzeDesign(DEMO);
    const figmaFile = JSON.parse(await fs.readFile(FIXTURE, "utf8"));
    const { tokens } = extractFromFigmaFile(figmaFile);

    const suggestions = await buildUiFixSuggestions(map, design, tokens);
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions.some((s) => s.after.includes("var(--color-primary)"))).toBe(true);
    // Figma radius 12px → rounded-xl, Button uses rounded-md
    expect(suggestions.some((s) => s.before.includes("rounded-md") && s.after.includes("rounded-xl"))).toBe(true);
  });

  it("renders patch and report without modifying source files", async () => {
    const map = await scanRepo(DEMO);
    const design = await analyzeDesign(DEMO);
    const before = await fs.readFile(path.join(DEMO, "components", "Button.tsx"), "utf8");

    const suggestions = await buildUiFixSuggestions(map, design, null);
    const patch = suggestionsToPatch(suggestions);
    const report = suggestionsToReport(suggestions);
    expect(patch).toContain("--- a/");
    expect(report).toContain("UI Fix Report");
    expect(report).toContain("No files were modified");

    const after = await fs.readFile(path.join(DEMO, "components", "Button.tsx"), "utf8");
    expect(after).toBe(before);
  });
});
