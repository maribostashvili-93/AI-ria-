import { writeRiaFile } from "../core/paths.js";
import { loadMemories, loadDesignMemory } from "../memory/memory-store.js";
import { loadHandoff } from "../memory/memory-handoff.js";
import { loadFigmaTokenPack } from "../figma/figma-token-importer.js";
import { scanRepo } from "../repo/scanner.js";

/**
 * Visual Memory (plugin-system layer). Design knowledge stored as chains:
 *
 *   Design decision → Component → Figma node → Code file → Agent task
 *
 * Each chain answers "why does this component look the way it does, where is
 * it designed, where is it implemented, and who is working on it". The JSON
 * outputs are the data layer `ria studio` renders.
 */
export interface VisualChain {
  component: string;
  decisions: string[];
  figmaNode: string | null;
  codeFiles: string[];
  agentTask: string | null;
}

export interface VisualMemory {
  generatedAt: string;
  chains: VisualChain[];
  /** design rules not tied to a specific component */
  globalRules: string[];
  stats: { components: number; withDecisions: number; withFigma: number; withCode: number; withTask: number };
}

export interface DesignGraphNode {
  id: string;
  label: string;
  kind: "decision" | "component" | "figma-node" | "code-file" | "agent-task";
}

export interface DesignGraphEdge {
  from: string;
  to: string;
  relation: "decides" | "designed-in" | "implemented-by" | "worked-on-in";
}

export interface DesignGraph {
  generatedAt: string;
  nodes: DesignGraphNode[];
  edges: DesignGraphEdge[];
  stats: { nodes: number; edges: number; chains: number };
}

const mentions = (text: string, component: string) => text.toLowerCase().includes(component.toLowerCase());

/** Build chains from everything AI RIA knows about design. */
export async function buildVisualMemory(root: string): Promise<VisualMemory> {
  const designMemory = await loadDesignMemory(root);
  const figma = await loadFigmaTokenPack(root);
  const handoff = await loadHandoff(root);
  const designEntries = (await loadMemories(root)).filter((m) => ["design-rule", "figma-note", "decision"].includes(m.type));

  // component set: design memory map ∪ figma components
  const components = new Map<string, { figmaNode: string | null; files: string[] }>();
  for (const c of figma?.components ?? []) {
    components.set(c.name, { figmaNode: `${c.name} (${c.type})`, files: [] });
  }
  for (const [name, info] of Object.entries(designMemory?.components ?? {})) {
    const existing = components.get(name);
    components.set(name, { figmaNode: existing?.figmaNode ?? null, files: [...new Set([...(existing?.files ?? []), ...info.files])] });
  }

  // enrich code files from the repo scan (basename match, e.g. Button ↔ components/Button.tsx)
  try {
    const map = await scanRepo(root);
    for (const [name, info] of components) {
      if (info.files.length) continue;
      const matches = map.components.filter((f) => {
        const base = f.split("/").pop()?.replace(/\.[a-z]+$/i, "") ?? "";
        return base.toLowerCase() === name.toLowerCase();
      });
      if (matches.length) components.set(name, { ...info, files: matches.slice(0, 5) });
    }
  } catch { /* unscannable project — chains still work from design data */ }

  const globalRules: string[] = [];
  const decisionsByComponent = new Map<string, string[]>();
  for (const entry of designEntries) {
    const text = `${entry.title} ${entry.content}`;
    const owners = [...components.keys()].filter((name) => mentions(text, name));
    if (!owners.length) {
      if (entry.type !== "decision") globalRules.push(entry.title);
      continue;
    }
    for (const owner of owners) {
      decisionsByComponent.set(owner, [...(decisionsByComponent.get(owner) ?? []), entry.title]);
    }
  }

  const taskText = handoff ? [handoff.task, ...handoff.remaining, handoff.nextAction ?? ""].join(" ") : "";
  const chains: VisualChain[] = [...components.entries()].map(([component, info]) => ({
    component,
    decisions: [...new Set(decisionsByComponent.get(component) ?? [])],
    figmaNode: info.figmaNode,
    codeFiles: info.files,
    agentTask: handoff && mentions(taskText, component) ? handoff.task : null,
  })).sort((a, b) => a.component.localeCompare(b.component));

  return {
    generatedAt: new Date().toISOString(),
    chains,
    globalRules: [...new Set(globalRules)].slice(0, 30),
    stats: {
      components: chains.length,
      withDecisions: chains.filter((c) => c.decisions.length).length,
      withFigma: chains.filter((c) => c.figmaNode).length,
      withCode: chains.filter((c) => c.codeFiles.length).length,
      withTask: chains.filter((c) => c.agentTask).length,
    },
  };
}

/** Chains as a graph in the canonical order: decision → component → figma → code → task. */
export function buildDesignGraph(memory: VisualMemory): DesignGraph {
  const nodes = new Map<string, DesignGraphNode>();
  const edges: DesignGraphEdge[] = [];
  const add = (node: DesignGraphNode) => {
    if (!nodes.has(node.id)) nodes.set(node.id, node);
    return node.id;
  };

  for (const chain of memory.chains) {
    const componentId = add({ id: `component:${chain.component}`, label: chain.component, kind: "component" });
    for (const d of chain.decisions) {
      edges.push({ from: add({ id: `decision:${d}`, label: d, kind: "decision" }), to: componentId, relation: "decides" });
    }
    // next hop after the component: figma node when known, otherwise straight to code
    let tail = componentId;
    if (chain.figmaNode) {
      const figmaId = add({ id: `figma:${chain.component}`, label: chain.figmaNode, kind: "figma-node" });
      edges.push({ from: componentId, to: figmaId, relation: "designed-in" });
      tail = figmaId;
    }
    for (const file of chain.codeFiles) {
      const fileId = add({ id: `file:${file}`, label: file, kind: "code-file" });
      edges.push({ from: tail, to: fileId, relation: "implemented-by" });
      if (chain.agentTask) {
        edges.push({ from: fileId, to: add({ id: `task:${chain.agentTask}`, label: chain.agentTask, kind: "agent-task" }), relation: "worked-on-in" });
      }
    }
    if (chain.agentTask && !chain.codeFiles.length) {
      edges.push({ from: tail, to: add({ id: `task:${chain.agentTask}`, label: chain.agentTask, kind: "agent-task" }), relation: "worked-on-in" });
    }
  }

  return {
    generatedAt: memory.generatedAt,
    nodes: [...nodes.values()],
    edges,
    stats: { nodes: nodes.size, edges: edges.length, chains: memory.chains.length },
  };
}

const short = (s: string, n = 40) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

/** Render the design graph as Mermaid (Studio uses the JSON; this is for humans). */
export function designGraphToMermaid(graph: DesignGraph): string {
  const safe = (id: string) => id.replace(/[^A-Za-z0-9_]/g, "_");
  const lines = ["```mermaid", "graph TD"];
  for (const n of graph.nodes.slice(0, 60)) {
    const label = short(n.label).replace(/["[\]{}()]/g, "");
    if (n.kind === "decision") lines.push(`  ${safe(n.id)}{{"${label}"}}`);
    else if (n.kind === "figma-node") lines.push(`  ${safe(n.id)}[/"${label}"/]`);
    else if (n.kind === "agent-task") lines.push(`  ${safe(n.id)}(("${label}"))`);
    else lines.push(`  ${safe(n.id)}["${label}"]`);
  }
  const ids = new Set(graph.nodes.slice(0, 60).map((n) => n.id));
  for (const e of graph.edges) {
    if (ids.has(e.from) && ids.has(e.to)) lines.push(`  ${safe(e.from)} -->|${e.relation}| ${safe(e.to)}`);
  }
  lines.push("```");
  return lines.join("\n");
}

/** Render VISUAL_MEMORY.md — every chain in the decision→…→task shape. */
export function visualMemoryToMarkdown(memory: VisualMemory, graph: DesignGraph): string {
  const lines = [
    "# Visual Memory",
    "",
    `Generated: ${memory.generatedAt} · ${memory.stats.components} components, ${memory.stats.withFigma} with Figma nodes, ${memory.stats.withCode} mapped to code`,
    "",
  ];
  for (const chain of memory.chains) {
    lines.push(`## ${chain.component}`, "");
    lines.push(...(chain.decisions.length ? chain.decisions.map((d) => `- decision: ${d}`) : ["- decision: (none recorded)"]));
    lines.push(`- figma: ${chain.figmaNode ?? "(not in Figma import)"}`);
    lines.push(...(chain.codeFiles.length ? chain.codeFiles.map((f) => `- code: \`${f}\``) : ["- code: (not mapped — use `ria design map`)"]));
    if (chain.agentTask) lines.push(`- task: ${chain.agentTask}`);
    lines.push("");
  }
  if (memory.globalRules.length) {
    lines.push("## Global Design Rules", "", ...memory.globalRules.map((r) => `- ${r}`), "");
  }
  lines.push("## Design Graph", "", designGraphToMermaid(graph), "");
  return lines.join("\n");
}

/** `ria visual memory` — write the full .ria/visual/ output set. */
export async function writeVisualMemory(root: string): Promise<{ memory: VisualMemory; graph: DesignGraph; files: string[] }> {
  const memory = await buildVisualMemory(root);
  const graph = buildDesignGraph(memory);
  const componentMap = Object.fromEntries(memory.chains.map((c) => [c.component, { figmaNode: c.figmaNode, files: c.codeFiles }]));
  const files = [
    await writeRiaFile(root, "visual/visual-memory.json", JSON.stringify(memory, null, 2)),
    await writeRiaFile(root, "visual/component-map.json", JSON.stringify(componentMap, null, 2)),
    await writeRiaFile(root, "visual/VISUAL_MEMORY.md", visualMemoryToMarkdown(memory, graph)),
    await writeRiaFile(root, "visual/design-graph.json", JSON.stringify(graph, null, 2)),
  ];
  return { memory, graph, files };
}

/** `ria visual graph` — refresh just the graph outputs. */
export async function writeDesignGraph(root: string): Promise<{ graph: DesignGraph; files: string[] }> {
  const memory = await buildVisualMemory(root);
  const graph = buildDesignGraph(memory);
  const files = [
    await writeRiaFile(root, "visual/design-graph.json", JSON.stringify(graph, null, 2)),
    await writeRiaFile(root, "visual/DESIGN_GRAPH.md", ["# Design Graph", "", `Generated: ${graph.generatedAt} · ${graph.stats.nodes} nodes, ${graph.stats.edges} edges, ${graph.stats.chains} chains`, "", designGraphToMermaid(graph), ""].join("\n")),
  ];
  return { graph, files };
}
