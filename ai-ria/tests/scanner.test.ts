import { describe, expect, it } from "vitest";
import path from "node:path";
import { scanRepo, detectRoutes } from "../src/repo/scanner.js";
import type { FileInfo } from "../src/core/types.js";

const file = (p: string): FileInfo => ({ path: p, ext: path.extname(p), bytes: 100, lines: 10 });

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

describe("detectRoutes", () => {
  it("treats the pages of a multi-page HTML site as routes", () => {
    const routes = detectRoutes([
      file("index.html"), file("admin.html"), file("login.html"),
      file("styles.css"), file("src/main.jsx"),
    ]);
    expect(routes).toEqual(["/", "/admin", "/login"]);
  });

  it("ignores asset folders, partials, fixtures and deep HTML", () => {
    const routes = detectRoutes([
      file("index.html"),
      file("public/favicon.html"),
      file("_partials/header.html"),
      file("test/fixtures/demo/page.html"),
      file("vendor/lib/docs/example.html"),
      file("a/b/c/deep.html"),
    ]);
    expect(routes).toEqual(["/"]);
  });

  it("still reads framework routes and does not duplicate the index", () => {
    const routes = detectRoutes([file("pages/index.tsx"), file("pages/about.tsx"), file("index.html")]);
    expect(routes).toEqual(["/", "/about"]);
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
