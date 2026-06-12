import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { Server } from "node:http";
import { addMemory } from "../src/memory/memory-store.js";
import { createHandoff } from "../src/memory/memory-handoff.js";
import { importFigmaTokens } from "../src/figma/figma-token-importer.js";
import { startStudio } from "../src/studio/server.js";
import { STUDIO_ENDPOINTS } from "../src/studio/api.js";

let root: string;
let server: Server;
let base: string;

const get = async (p: string) => fetch(base + p);

beforeAll(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "ria-studio-"));
  await fs.writeFile(path.join(root, "package.json"), JSON.stringify({ name: "studio-demo", version: "1.0.0" }), "utf8");
  const tokens = path.join(root, "tokens.json");
  await fs.writeFile(tokens, JSON.stringify({ colors: { primary: "#FCC204" }, components: ["Button"] }), "utf8");
  await importFigmaTokens(root, tokens);
  await addMemory(root, { type: "decision", title: "Button stays yellow", agent: "claude" });
  await createHandoff(root, { task: "Polish Button", remaining: ["hover"] });
  const started = await startStudio(root, { port: 0 }); // ephemeral port
  server = started.server;
  base = started.url;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

describe("ria studio (v0.4)", () => {
  it("serves the dashboard shell", async () => {
    const res = await get("/");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("AI RIA Studio");
    expect(html).toContain("Memory Graph");
    expect(html).toContain("Visual Memory");
  });

  it("answers every studio endpoint with JSON", async () => {
    for (const endpoint of STUDIO_ENDPOINTS) {
      const res = await get(`/api/${endpoint}`);
      expect(res.status, endpoint).toBe(200);
      expect(res.headers.get("content-type")).toContain("application/json");
      await res.json(); // must parse
    }
  });

  it("builds the overview from live project state", async () => {
    const o = await (await get("/api/overview")).json();
    expect(o.memories).toBeGreaterThanOrEqual(1);
    expect(o.activeTask).toBe("Polish Button");
    expect(o.figmaImported).toBe(true);
  });

  it("serves graphs the UI can render", async () => {
    const memory = await (await get("/api/memory-graph")).json();
    expect(memory.nodes.length).toBeGreaterThan(0);
    const design = await (await get("/api/design-graph")).json();
    expect(design.nodes.some((n: { kind: string }) => n.kind === "component")).toBe(true);
  });

  it("reports project identity and 404s for unknown paths", async () => {
    const p = await (await get("/api/project")).json();
    expect(p.name).toContain("ria-studio-");
    expect((await get("/api/nope")).status).toBe(404);
    expect((await get("/etc/passwd")).status).toBe(404);
  });
});
