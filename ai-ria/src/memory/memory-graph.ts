import { writeRiaFile } from "../core/paths.js";
import { loadMemories, loadDesignMemory } from "./memory-store.js";
import { loadHandoff } from "./memory-handoff.js";

/**
 * Memory Graph (Agent OS layer). Memories, agents, the active handoff and
 * design memory become nodes; shared files/tags and references become edges.
 * The graph is the project's "thought web" — compressed nodes, not chat logs.
 */
export interface GraphNode {
  id: string;
  label: string;
  kind: "memory" | "agent" | "handoff" | "design";
  type?: string;
  agent?: string;
  importance: number;
  hash: string;
}

export interface GraphEdge {
  from: string;
  to: string;
  relation: "authored-by" | "same-file" | "same-tag" | "references" | "design-rule-of";
}

export interface MemoryGraph {
  generatedAt: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  stats: { nodes: number; edges: number; agents: number };
}

const short = (s: string, n = 42) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

/** Build the project's memory graph from everything AI RIA has stored. */
export async function buildMemoryGraph(root: string): Promise<MemoryGraph> {
  const memories = await loadMemories(root);
  const handoff = await loadHandoff(root);
  const design = await loadDesignMemory(root);

  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const agents = new Set<string>();

  for (const m of memories) {
    nodes.push({ id: m.id, label: short(m.title), kind: "memory", type: m.type, agent: m.agent, importance: m.importance ?? 5, hash: m.id.replace(/^mem_/, "") });
    if (m.agent && m.agent !== "unknown") {
      agents.add(m.agent);
      edges.push({ from: m.id, to: `agent:${m.agent}`, relation: "authored-by" });
    }
  }
  for (const a of agents) {
    nodes.push({ id: `agent:${a}`, label: a, kind: "agent", importance: 7, hash: a });
  }

  // memory <-> memory: shared files / shared tags
  for (let i = 0; i < memories.length; i++) {
    for (let j = i + 1; j < memories.length; j++) {
      const a = memories[i];
      const b = memories[j];
      if (a.files.some((f) => b.files.includes(f))) edges.push({ from: a.id, to: b.id, relation: "same-file" });
      else if (a.tags.some((t) => t !== "conversation" && b.tags.includes(t))) edges.push({ from: a.id, to: b.id, relation: "same-tag" });
    }
  }

  if (handoff) {
    nodes.push({ id: handoff.id, label: short(`Handoff: ${handoff.task}`), kind: "handoff", agent: handoff.agent, importance: 9, hash: handoff.id });
    for (const ref of handoff.memoryRefs) {
      if (memories.some((m) => m.id === ref)) edges.push({ from: handoff.id, to: ref, relation: "references" });
    }
  }

  if (design) {
    nodes.push({ id: "design-memory", label: `Design Memory (${design.rules.length} rules, ${design.tokens.length} tokens)`, kind: "design", importance: 8, hash: "design" });
    for (const m of memories.filter((m) => m.type === "design-rule" || m.type === "figma-note")) {
      edges.push({ from: "design-memory", to: m.id, relation: "design-rule-of" });
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    nodes,
    edges,
    stats: { nodes: nodes.length, edges: edges.length, agents: agents.size },
  };
}

/** Render the graph as a Mermaid diagram (top 40 nodes by importance). */
export function graphToMermaid(graph: MemoryGraph): string {
  const top = [...graph.nodes].sort((a, b) => b.importance - a.importance).slice(0, 40);
  const ids = new Set(top.map((n) => n.id));
  const safe = (id: string) => id.replace(/[^A-Za-z0-9_]/g, "_");
  const lines = ["```mermaid", "graph LR"];
  for (const n of top) {
    const label = `${n.label.replace(/["[\]{}]/g, "")} (${n.importance})`;
    if (n.kind === "agent") lines.push(`  ${safe(n.id)}(("${label}"))`);
    else if (n.kind === "handoff") lines.push(`  ${safe(n.id)}{{"${label}"}}`);
    else if (n.kind === "design") lines.push(`  ${safe(n.id)}[/"${label}"/]`);
    else lines.push(`  ${safe(n.id)}["${label}"]`);
  }
  for (const e of graph.edges) {
    if (ids.has(e.from) && ids.has(e.to)) lines.push(`  ${safe(e.from)} -->|${e.relation}| ${safe(e.to)}`);
  }
  lines.push("```");
  return lines.join("\n");
}

/** `ria memory graph` — write memory-graph.json + memory-graph.md. */
export async function writeMemoryGraph(root: string): Promise<{ graph: MemoryGraph; files: string[] }> {
  const graph = await buildMemoryGraph(root);
  const markdown = [
    "# Memory Graph",
    "",
    `Generated: ${graph.generatedAt} · ${graph.stats.nodes} nodes, ${graph.stats.edges} edges, ${graph.stats.agents} agents`,
    "",
    graphToMermaid(graph),
    "",
  ].join("\n");
  const files = [
    await writeRiaFile(root, "memory/memory-graph.json", JSON.stringify(graph, null, 2)),
    await writeRiaFile(root, "memory/memory-graph.md", markdown),
  ];
  return { graph, files };
}
