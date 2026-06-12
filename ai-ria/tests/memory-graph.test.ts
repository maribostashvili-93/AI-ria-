import { describe, it, expect, beforeAll } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { addMemory, loadMemories } from "../src/memory/memory-store.js";
import { createHandoff } from "../src/memory/memory-handoff.js";
import { buildMemoryGraph, graphToMermaid, writeMemoryGraph } from "../src/memory/memory-graph.js";

let root: string;

beforeAll(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "ria-graph-"));
  await fs.writeFile(path.join(root, "package.json"), JSON.stringify({ name: "demo", version: "1.0.0" }), "utf8");
  await addMemory(root, { type: "decision", title: "Use static HTML", files: ["index.html"], agent: "claude" });
  await addMemory(root, { type: "warning", title: "Do not edit payment.js", files: ["index.html", "payment.js"], agent: "cursor" });
  await addMemory(root, { type: "task", title: "Refactor header", tags: ["ui"], agent: "claude" });
  await addMemory(root, { type: "design-rule", title: "Primary color #FCC204", tags: ["ui"] });
  await createHandoff(root, { task: "Improve checkout", remaining: ["cart"] });
});

describe("memory graph (v0.1)", () => {
  it("applies per-type importance defaults and explicit overrides", async () => {
    const entries = await loadMemories(root);
    expect(entries.find((e) => e.type === "warning")?.importance).toBe(8);
    expect(entries.find((e) => e.type === "decision")?.importance).toBe(7);
    expect(entries.find((e) => e.type === "task")?.importance).toBe(5);
    const custom = await addMemory(root, { type: "task", title: "Critical migration", importance: 10 });
    expect(custom.importance).toBe(10);
  });

  it("builds nodes for memories, agents and the handoff", async () => {
    const graph = await buildMemoryGraph(root);
    expect(graph.nodes.filter((n) => n.kind === "memory").length).toBeGreaterThanOrEqual(4);
    expect(graph.nodes.filter((n) => n.kind === "agent").map((n) => n.label).sort()).toEqual(["claude", "cursor"]);
    expect(graph.nodes.some((n) => n.kind === "handoff")).toBe(true);
    expect(graph.stats.nodes).toBe(graph.nodes.length);
  });

  it("links memories by shared files, shared tags, authorship and handoff refs", async () => {
    const graph = await buildMemoryGraph(root);
    expect(graph.edges.some((e) => e.relation === "same-file")).toBe(true);
    expect(graph.edges.some((e) => e.relation === "same-tag")).toBe(true);
    expect(graph.edges.some((e) => e.relation === "authored-by" && e.to === "agent:claude")).toBe(true);
    expect(graph.edges.some((e) => e.relation === "references")).toBe(true);
  });

  it("renders a Mermaid diagram of the top nodes", async () => {
    const graph = await buildMemoryGraph(root);
    const mermaid = graphToMermaid(graph);
    expect(mermaid).toContain("graph LR");
    expect(mermaid).toContain("authored-by");
  });

  it("writes memory-graph.json and memory-graph.md under .ria/memory", async () => {
    const { files } = await writeMemoryGraph(root);
    expect(files.length).toBe(2);
    const md = await fs.readFile(path.join(root, ".ria", "memory", "memory-graph.md"), "utf8");
    expect(md).toContain("# Memory Graph");
    const json = JSON.parse(await fs.readFile(path.join(root, ".ria", "memory", "memory-graph.json"), "utf8"));
    expect(json.stats.edges).toBeGreaterThan(0);
  });
});
