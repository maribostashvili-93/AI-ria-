import { describe, expect, it } from "vitest";
import path from "node:path";
import { promises as fs } from "node:fs";
import { analyzeDesign } from "../src/design/analyzer.js";
import { extractFromFigmaFile, rgbToHex } from "../src/figma/client.js";
import { compareFigmaToCode, diffToMarkdown } from "../src/figma/compare.js";
import { importFigmaData } from "../src/figma/importer.js";

const FIXTURE = path.join(__dirname, "..", "examples", "figma-export.json");
const DEMO = path.join(__dirname, "..", "examples", "demo-app");

describe("figma adapter", () => {
  it("converts Figma rgb to hex", () => {
    expect(rgbToHex({ r: 1, g: 1, b: 1 })).toBe("#ffffff");
    expect(rgbToHex({ r: 0, g: 0, b: 0 })).toBe("#000000");
  });

  it("extracts tokens and components from a Figma export", async () => {
    const file = JSON.parse(await fs.readFile(FIXTURE, "utf8"));
    const { tokens, components } = extractFromFigmaFile(file);
    expect(tokens.colors.map((color) => color.value)).toContain("#4f46e5");
    expect(tokens.colors.map((color) => color.value)).toContain("#0ea5e9");
    expect(tokens.typography.some((item) => item.fontFamily === "Inter" && item.fontSize === 16)).toBe(true);
    expect(tokens.radii.map((radius) => radius.value)).toContain("12px");
    expect(components.map((component) => component.name)).toContain("Button/Primary");
  });

  it("compares Figma tokens with code tokens", async () => {
    const file = JSON.parse(await fs.readFile(FIXTURE, "utf8"));
    const { tokens } = extractFromFigmaFile(file);
    const code = await analyzeDesign(DEMO);
    const diff = compareFigmaToCode(tokens, code);

    expect(diff.matchedColors).toContain("#4f46e5");
    expect(diff.matchedColors).toContain("#0ea5e9");
    expect(diff.missingRadiiInCode).toContain("12px");

    const markdown = diffToMarkdown(diff, tokens.source);
    expect(markdown).toContain("Figma");
    expect(markdown).toContain("Border Radius");
  });

  it("imports cursor-talk-to-figma-mcp wrapped node output without a token", async () => {
    const tmp = path.join(__dirname, "..", "examples", "figma-mcp-export.json");
    const payload = {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            id: "0:1",
            name: "Landing Frame",
            type: "FRAME",
            fills: [{ type: "SOLID", color: { r: 0.486, g: 0.227, b: 0.929 } }],
            cornerRadius: 12,
            itemSpacing: 16,
            children: [
              {
                id: "1:2",
                name: "Hero Title",
                type: "TEXT",
                characters: "Hello",
                style: { fontFamily: "Inter", fontSize: 32 },
              },
              {
                id: "1:3",
                name: "Button/Primary",
                type: "COMPONENT",
                fills: [{ type: "SOLID", color: { r: 0.231, g: 0.51, b: 0.965 } }],
                children: [],
              },
            ],
          }),
        },
      ],
    };

    await fs.writeFile(tmp, JSON.stringify(payload, null, 2), "utf8");
    try {
      const { tokens, components } = await importFigmaData(tmp);
      expect(tokens.colors.length).toBeGreaterThan(0);
      expect(tokens.typography.some((item) => item.fontFamily === "Inter" && item.fontSize === 32)).toBe(true);
      expect(tokens.radii.map((item) => item.value)).toContain("12px");
      expect(tokens.spacing.map((item) => item.value)).toContain("16px");
      expect(components.map((item) => item.name)).toContain("Button/Primary");
    } finally {
      await fs.rm(tmp, { force: true });
    }
  });
});
