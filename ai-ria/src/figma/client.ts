import { promises as fs } from "node:fs";
import { DesignToken, FigmaComponent, FigmaTokens, FigmaTokensSchema } from "../core/types.js";

/* eslint-disable @typescript-eslint/no-explicit-any */
type FigmaNode = Record<string, any>;

export function rgbToHex(c: { r: number; g: number; b: number }): string {
  const h = (v: number) => Math.round(v * 255).toString(16).padStart(2, "0");
  return `#${h(c.r)}${h(c.g)}${h(c.b)}`;
}

/**
 * v0.2: AI RIA Figma Adapter.
 * Figma MCP / Figma API → adapter → design-tokens.json → DESIGN.md → consistency check.
 */
export class FigmaClient {
  constructor(private readonly token: string | undefined = process.env.FIGMA_TOKEN) {}

  isConfigured(): boolean {
    return typeof this.token === "string" && this.token.length > 0;
  }

  /** Verify the token against the Figma API. */
  async connect(): Promise<{ connected: boolean; message: string }> {
    if (!this.isConfigured()) {
      return { connected: false, message: "No FIGMA_TOKEN set. Create a personal access token in Figma → Settings → Security, then: export FIGMA_TOKEN=..." };
    }
    try {
      const res = await fetch("https://api.figma.com/v1/me", { headers: { "X-Figma-Token": this.token! } });
      if (!res.ok) return { connected: false, message: `Figma API responded ${res.status} — check the token.` };
      const me = (await res.json()) as { email?: string };
      return { connected: true, message: `Connected to Figma as ${me.email ?? "unknown user"}.` };
    } catch (err) {
      return { connected: false, message: `Could not reach Figma API: ${err instanceof Error ? err.message : String(err)}` };
    }
  }

  /** Fetch a Figma file's node tree via the REST API. */
  async fetchFile(fileKey: string): Promise<FigmaNode> {
    if (!this.isConfigured()) {
      throw new Error("FIGMA_TOKEN not set. Use `ria figma extract --from <file.json>` for offline extraction, or set the token.");
    }
    const res = await fetch(`https://api.figma.com/v1/files/${fileKey}`, { headers: { "X-Figma-Token": this.token! } });
    if (!res.ok) throw new Error(`Figma API error ${res.status} for file ${fileKey}`);
    return (await res.json()) as FigmaNode;
  }

  /** Load a Figma file export from a local JSON file (offline / MCP handoff mode). */
  async loadLocalFile(filePath: string): Promise<FigmaNode> {
    return JSON.parse(await fs.readFile(filePath, "utf8")) as FigmaNode;
  }
}

/** Walk a Figma document tree and extract design tokens + components. */
export function extractFromFigmaFile(file: FigmaNode): { tokens: FigmaTokens; components: FigmaComponent[] } {
  const colors = new Map<string, DesignToken>();
  const typography = new Map<string, { name: string; fontFamily: string; fontSize: number }>();
  const radii = new Map<string, DesignToken>();
  const spacing = new Map<string, DesignToken>();
  const components: FigmaComponent[] = [];
  const source = (file.name as string) ?? "figma";

  const visit = (node: FigmaNode): void => {
    if (!node || typeof node !== "object") return;
    if (node.type === "COMPONENT" || node.type === "COMPONENT_SET") {
      components.push({ name: String(node.name ?? "unnamed"), type: String(node.type) });
    }
    for (const fill of (node.fills as FigmaNode[]) ?? []) {
      if (fill?.type === "SOLID" && fill.color) {
        const hex = rgbToHex(fill.color);
        if (!colors.has(hex)) colors.set(hex, { name: `figma/${String(node.name ?? "fill")}`, value: hex, source });
      }
    }
    if (node.type === "TEXT" && node.style) {
      const key = `${node.style.fontFamily}-${node.style.fontSize}`;
      if (!typography.has(key)) {
        typography.set(key, { name: String(node.name ?? "text"), fontFamily: String(node.style.fontFamily ?? "unknown"), fontSize: Number(node.style.fontSize ?? 0) });
      }
    }
    if (typeof node.cornerRadius === "number" && node.cornerRadius > 0) {
      const val = `${node.cornerRadius}px`;
      if (!radii.has(val)) radii.set(val, { name: `figma/${String(node.name ?? "radius")}`, value: val, source });
    }
    if (typeof node.itemSpacing === "number" && node.itemSpacing > 0) {
      const val = `${node.itemSpacing}px`;
      if (!spacing.has(val)) spacing.set(val, { name: `figma/${String(node.name ?? "spacing")}`, value: val, source });
    }
    for (const child of (node.children as FigmaNode[]) ?? []) visit(child);
  };

  visit((file.document as FigmaNode) ?? file);

  const tokens = FigmaTokensSchema.parse({
    source,
    colors: [...colors.values()],
    typography: [...typography.values()],
    radii: [...radii.values()],
    spacing: [...spacing.values()],
  });
  return { tokens, components };
}

/** Human/agent-readable summary of an extraction. */
export function figmaSummaryMarkdown(tokens: FigmaTokens, components: FigmaComponent[]): string {
  const out: string[] = [];
  out.push(`# Figma Design Summary — ${tokens.source}`, ``);
  out.push(`- Colors: ${tokens.colors.length}`);
  out.push(`- Text styles: ${tokens.typography.length}`);
  out.push(`- Radii: ${tokens.radii.length}`);
  out.push(`- Spacing values: ${tokens.spacing.length}`);
  out.push(`- Components: ${components.length}`, ``);
  if (tokens.colors.length) {
    out.push(`## Colors`, ``, `| Name | Value |`, `|---|---|`);
    for (const c of tokens.colors) out.push(`| ${c.name} | \`${c.value}\` |`);
    out.push(``);
  }
  if (tokens.typography.length) {
    out.push(`## Typography`, ``, `| Name | Font | Size |`, `|---|---|---|`);
    for (const t of tokens.typography) out.push(`| ${t.name} | ${t.fontFamily} | ${t.fontSize}px |`);
    out.push(``);
  }
  if (tokens.radii.length) {
    out.push(`## Border Radius`, ``);
    for (const r of tokens.radii) out.push(`- ${r.name}: \`${r.value}\``);
    out.push(``);
  }
  if (components.length) {
    out.push(`## Components`, ``);
    for (const c of components) out.push(`- ${c.name} (${c.type})`);
  }
  return out.join("\n");
}
