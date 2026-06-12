import { readRiaFile } from "../core/paths.js";
import { loadIndex, rebuildIndex } from "../memory/memory-index.js";
import { loadMemories, loadDesignMemory } from "../memory/memory-store.js";
import { loadHandoff } from "../memory/memory-handoff.js";
import { buildMemoryGraph } from "../memory/memory-graph.js";
import { buildVisualMemory, buildDesignGraph } from "../visual/visual-memory.js";
import { loadFigmaTokenPack } from "../figma/figma-token-importer.js";
import { buildTokenSummary } from "../tokens/token-report.js";

/**
 * Studio data layer. Every endpoint returns plain JSON built live from the
 * project's `.ria/` knowledge, so the dashboard never shows stale graphs.
 * The same API shape will back the future Next.js/React Flow studio.
 */
export type StudioEndpoint =
  | "overview"
  | "memory-graph"
  | "design-graph"
  | "visual-memory"
  | "routing"
  | "figma"
  | "tokens"
  | "security"
  | "handoff";

async function readJson(root: string, name: string): Promise<unknown | null> {
  const raw = await readRiaFile(root, name);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function overview(root: string) {
  const index = (await loadIndex(root)) ?? (await rebuildIndex(root, await loadMemories(root)));
  const handoff = await loadHandoff(root);
  const security = (await readJson(root, "security-report.json")) as { findings?: { severity: string }[] } | null;
  const tokens = await buildTokenSummary(root);
  const visual = await buildVisualMemory(root);
  const figma = await loadFigmaTokenPack(root);
  const routing = await readJson(root, "orchestration/agent-routing.json");
  const severe = (security?.findings ?? []).filter((f) => f.severity === "critical" || f.severity === "high").length;
  return {
    generatedAt: new Date().toISOString(),
    memories: index.count,
    memoriesByType: index.byType,
    activeTask: handoff?.task ?? null,
    securityFindings: security?.findings?.length ?? null,
    securityCriticalOrHigh: security ? severe : null,
    tokensSaved: tokens.totalSavedTokens,
    savingsPercent: tokens.savingsPercent,
    components: visual.stats.components,
    figmaImported: Boolean(figma),
    routed: Boolean(routing),
  };
}

/** Resolve one studio endpoint to its JSON payload. */
export async function studioData(root: string, endpoint: StudioEndpoint): Promise<unknown> {
  switch (endpoint) {
    case "overview":
      return overview(root);
    case "memory-graph":
      return buildMemoryGraph(root);
    case "design-graph":
      return buildDesignGraph(await buildVisualMemory(root));
    case "visual-memory":
      return buildVisualMemory(root);
    case "routing":
      return (await readJson(root, "orchestration/agent-routing.json")) ?? { missing: "Run `ria orchestrate --goal ...` first." };
    case "figma":
      return (await loadFigmaTokenPack(root)) ?? { missing: "Run `ria figma import` first." };
    case "tokens":
      return buildTokenSummary(root);
    case "security":
      return (await readJson(root, "security-report.json")) ?? { missing: "Run `ria security` or orchestrate a security goal first." };
    case "handoff": {
      const handoff = await loadHandoff(root);
      return handoff ?? { missing: "Run `ria handoff create` first." };
    }
  }
}

/** Design memory is shown on the Figma page alongside the raw token pack. */
export async function studioDesignMemory(root: string): Promise<unknown> {
  return (await loadDesignMemory(root)) ?? { missing: "No design memory yet." };
}

export const STUDIO_ENDPOINTS: readonly StudioEndpoint[] = [
  "overview",
  "memory-graph",
  "design-graph",
  "visual-memory",
  "routing",
  "figma",
  "tokens",
  "security",
  "handoff",
];
