import { describe, it, expect, beforeAll } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { addMemory, mapDesignComponent } from "../src/memory/memory-store.js";
import { createHandoff } from "../src/memory/memory-handoff.js";
import { importFigmaTokens } from "../src/figma/figma-token-importer.js";
import { buildVisualMemory, buildDesignGraph, writeVisualMemory, writeDesignGraph } from "../src/visual/visual-memory.js";

let root: string;

beforeAll(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "ria-visual-"));
  await fs.writeFile(path.join(root, "package.json"), JSON.stringify({ name: "demo", version: "1.0.0" }), "utf8");
  await fs.mkdir(path.join(root, "components"), { recursive: true });
  await fs.writeFile(path.join(root, "components", "ProductCard.tsx"), "export const ProductCard = () => null;\n", "utf8");
  const tokens = path.join(root, "tokens.json");
  await fs.writeFile(tokens, JSON.stringify({ colors: { primary: "#FCC204" }, components: ["Button", "ProductCard"] }), "utf8");
  await importFigmaTokens(root, tokens);
  await mapDesignComponent(root, "Button", ["src/ui/button.tsx"]);
  await addMemory(root, { type: "design-rule", title: "Button uses primary color #FCC204" });
  await addMemory(root, { type: "decision", title: "ProductCard shows price before title" });
  await addMemory(root, { type: "design-rule", title: "Spacing scale is 4px everywhere" });
  await createHandoff(root, { task: "Polish Button hover states", remaining: ["Button focus ring"] });
});

describe("visual memory chains (v0.4)", () => {
  it("builds decision -> component -> figma -> code -> task chains", async () => {
    const memory = await buildVisualMemory(root);
    const button = memory.chains.find((c) => c.component === "Button");
    expect(button?.decisions).toContain("Button uses primary color #FCC204");
    expect(button?.figmaNode).toContain("Button");
    expect(button?.codeFiles).toContain("src/ui/button.tsx");
    expect(button?.agentTask).toBe("Polish Button hover states");
  });

  it("matches repo component files when nothing is mapped manually", async () => {
    const memory = await buildVisualMemory(root);
    const card = memory.chains.find((c) => c.component === "ProductCard");
    expect(card?.codeFiles.some((f) => f.endsWith("ProductCard.tsx"))).toBe(true);
    expect(card?.decisions).toContain("ProductCard shows price before title");
    expect(card?.agentTask).toBeNull();
  });

  it("keeps component-free rules as global rules", async () => {
    const memory = await buildVisualMemory(root);
    expect(memory.globalRules).toContain("Spacing scale is 4px everywhere");
  });
});

describe("design graph (v0.4)", () => {
  it("wires edges in the canonical chain order", async () => {
    const graph = buildDesignGraph(await buildVisualMemory(root));
    expect(graph.edges.some((e) => e.relation === "decides" && e.to === "component:Button")).toBe(true);
    expect(graph.edges.some((e) => e.from === "component:Button" && e.relation === "designed-in")).toBe(true);
    expect(graph.edges.some((e) => e.from === "figma:Button" && e.relation === "implemented-by")).toBe(true);
    expect(graph.edges.some((e) => e.from === "file:src/ui/button.tsx" && e.relation === "worked-on-in")).toBe(true);
  });

  it("writes the full .ria/visual/ output set", async () => {
    const { files } = await writeVisualMemory(root);
    expect(files.length).toBe(4);
    const md = await fs.readFile(path.join(root, ".ria", "visual", "VISUAL_MEMORY.md"), "utf8");
    expect(md).toContain("## Button");
    expect(md).toContain("```mermaid");
    const json = JSON.parse(await fs.readFile(path.join(root, ".ria", "visual", "component-map.json"), "utf8"));
    expect(json.Button.files).toContain("src/ui/button.tsx");
  });

  it("writes graph-only outputs via visual graph", async () => {
    const { graph, files } = await writeDesignGraph(root);
    expect(graph.stats.chains).toBeGreaterThanOrEqual(2);
    expect(files.some((f) => f.endsWith("DESIGN_GRAPH.md"))).toBe(true);
  });
});
