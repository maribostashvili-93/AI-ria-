import { describe, expect, it } from "vitest";
import path from "node:path";
import { analyzeDesign, extractTokens } from "../src/design/analyzer.js";
import { generateDesignMd, categorizeTokens, dedupeTokens } from "../src/design/generator.js";
import { scanRepo } from "../src/repo/scanner.js";

const SAMPLE = path.join(__dirname, "..", "examples", "sample-app");
const DEMO = path.join(__dirname, "..", "examples", "demo-app");

describe("extractTokens", () => {
  it("extracts CSS custom properties", () => {
    const tokens = extractTokens("a.css", `:root { --color-x: red; --gap-sm: 4px; }`);
    expect(tokens).toHaveLength(2);
    expect(tokens[0]).toMatchObject({ name: "--color-x", value: "red" });
  });

  it("stops at the end of the block when the last declaration has no semicolon", () => {
    // Minified CSS: `--max:1240px}` used to swallow every following rule.
    const css = ":root{--ink:#171713;--max:1240px}\n*{box-sizing:border-box}\nbody{margin:0;color:red}";
    const tokens = extractTokens("styles.css", css);
    expect(tokens.map((t) => t.name)).toEqual(["--ink", "--max"]);
    expect(tokens[1].value).toBe("1240px");
    expect(tokens.every((t) => !t.value.includes("{"))).toBe(true);
  });

  it("keeps the first definition when a property is overridden later in the file", () => {
    const tokens = extractTokens("a.css", ":root{--ink:#111}\n.dark{--ink:#eee}");
    expect(tokens).toHaveLength(1);
    expect(tokens[0].value).toBe("#111");
  });

  it("skips empty values", () => {
    expect(extractTokens("a.css", ":root{--broken:;--ok:red}").map((t) => t.name)).toEqual(["--ok"]);
  });
});

describe("dedupeTokens", () => {
  it("reports one row per token and flags cross-file conflicts", () => {
    const { unique, conflicts } = dedupeTokens([
      { name: "--ink", value: "#111", source: "a.css" },
      { name: "--ink", value: "#111", source: "b.css" },
      { name: "--acid", value: "#d7ff43", source: "a.css" },
      { name: "--acid", value: "#00ff00", source: "c.css" },
    ]);
    expect(unique.map((t) => t.name)).toEqual(["--ink", "--acid"]);
    // same value in two files is not a conflict; different values are
    expect(conflicts.map((c) => c.name)).toEqual(["--acid"]);
    expect(conflicts[0].definitions.map((d) => d.source)).toEqual(["a.css", "c.css"]);
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
