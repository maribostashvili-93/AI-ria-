import { describe, expect, it } from "vitest";
import path from "node:path";
import { scanRepo } from "../src/repo/scanner.js";

const SAMPLE = path.join(__dirname, "..", "examples", "sample-app");
const DEMO = path.join(__dirname, "..", "examples", "demo-app");

describe("scanRepo (sample-app)", () => {
  it("builds a repo map", async () => {
    const map = await scanRepo(SAMPLE);
    expect(map.fileCount).toBeGreaterThan(0);
    expect(map.languages["TypeScript"]).toBeGreaterThanOrEqual(2);
    expect(map.dependencies).toContain("express");
    expect(map.entryPoints).toContain("src/index.ts");
  });

  it("detects conventions", async () => {
    const map = await scanRepo(SAMPLE);
    expect(map.conventions.usesTypeScript).toBe(true);
    expect(map.conventions.hasSrcLayout).toBe(true);
    expect(map.conventions.hasDesignDoc).toBe(true);
  });
});

describe("scanRepo (demo-app, v0.1)", () => {
  it("detects Next.js framework", async () => {
    const map = await scanRepo(DEMO);
    expect(map.framework).toBe("Next.js");
  });

  it("detects routes and components", async () => {
    const map = await scanRepo(DEMO);
    expect(map.routes).toContain("/about");
    expect(map.routes).toContain("/");
    expect(map.components.some((c) => c.endsWith("Button.tsx"))).toBe(true);
  });

  it("detects styles, configs, and important files", async () => {
    const map = await scanRepo(DEMO);
    expect(map.styles.some((s) => s.endsWith("globals.css"))).toBe(true);
    expect(map.configFiles).toContain("tailwind.config.js");
    expect(map.importantFiles).toContain(".env");
    expect(Object.keys(map.scripts)).toContain("deploy");
  });
});
