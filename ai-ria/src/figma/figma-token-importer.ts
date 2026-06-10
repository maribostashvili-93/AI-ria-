import { promises as fs } from "node:fs";
import { writeRiaFile } from "../core/paths.js";
import { DesignToken } from "../core/types.js";
import { buildDesignMemory } from "../memory/memory-store.js";
import { extractFromFigmaFile } from "./client.js";
import { FigmaTokenPack, FigmaTokenPackSchema } from "./figma-token-schema.js";

function tokensFromRecord(record: unknown, prefix: string): DesignToken[] {
  if (!record || typeof record !== "object" || Array.isArray(record)) return [];
  return Object.entries(record as Record<string, unknown>)
    .filter(([, v]) => typeof v === "string" || typeof v === "number")
    .map(([name, value]) => ({ name: `${prefix}/${name}`, value: String(value), source: "figma-import" }));
}

function asTokenArray(value: unknown, prefix: string): DesignToken[] {
  if (Array.isArray(value)) {
    return value
      .filter((t) => t && typeof t === "object" && "name" in t && "value" in t)
      .map((t) => ({ name: String((t as DesignToken).name), value: String((t as DesignToken).value), source: "figma-import" }));
  }
  return tokensFromRecord(value, prefix);
}

/**
 * Normalize any of three input shapes into a FigmaTokenPack:
 * 1. a raw Figma file export (has `document`) — reuses the existing extractor
 * 2. our extract format (colors/typography/radii/spacing arrays)
 * 3. a flat designer-written file: { "colors": { "primary": "#FCC204" }, ... }
 */
export function normalizeFigmaExport(data: unknown, source: string): FigmaTokenPack {
  const importedAt = new Date().toISOString();
  const obj = (data ?? {}) as Record<string, unknown>;

  if (obj.document) {
    const { tokens, components } = extractFromFigmaFile(obj as never);
    return FigmaTokenPackSchema.parse({
      source,
      importedAt,
      colors: tokens.colors,
      typography: tokens.typography,
      spacing: tokens.spacing,
      radius: tokens.radii,
      shadows: [],
      components,
    });
  }

  const typography = Array.isArray(obj.typography)
    ? obj.typography
    : Object.entries((obj.typography as Record<string, unknown>) ?? {}).map(([name, v]) => {
        const t = (v ?? {}) as Record<string, unknown>;
        return { name, fontFamily: String(t.fontFamily ?? t.font ?? ""), fontSize: Number(t.fontSize ?? t.size ?? 0) };
      });

  const components = Array.isArray(obj.components)
    ? obj.components.map((c) => (typeof c === "string" ? { name: c, type: "COMPONENT" } : (c as { name: string; type?: string })))
    : [];

  return FigmaTokenPackSchema.parse({
    source,
    importedAt,
    colors: asTokenArray(obj.colors, "color"),
    typography,
    spacing: asTokenArray(obj.spacing, "spacing"),
    radius: asTokenArray(obj.radius ?? obj.radii, "radius"),
    shadows: asTokenArray(obj.shadows ?? obj.shadow, "shadow"),
    components,
  });
}

/** Render the token pack as FIGMA_SUMMARY.md. */
export function figmaPackToMarkdown(pack: FigmaTokenPack): string {
  const section = (title: string, tokens: DesignToken[]) =>
    tokens.length ? [`## ${title}`, "", ...tokens.slice(0, 40).map((t) => `- \`${t.name}\` = \`${t.value}\``), ""] : [];
  return [
    "# Figma Summary",
    "",
    `Source: ${pack.source} · imported ${pack.importedAt}`,
    "",
    ...section("Colors", pack.colors),
    ...(pack.typography.length ? ["## Typography", "", ...pack.typography.slice(0, 20).map((t) => `- ${t.name}: ${t.fontFamily} ${t.fontSize || ""}`.trim()), ""] : []),
    ...section("Spacing", pack.spacing),
    ...section("Radius", pack.radius),
    ...section("Shadows", pack.shadows),
    ...(pack.components.length ? ["## Components", "", ...pack.components.slice(0, 40).map((c) => `- ${c.name} (${c.type})`), ""] : []),
  ].join("\n");
}

/**
 * `ria figma import` — import a local Figma export / token file into
 * .ria/figma/ and merge everything into Design Memory.
 */
export async function importFigmaTokens(root: string, file: string): Promise<{ pack: FigmaTokenPack; files: string[] }> {
  const data = JSON.parse(await fs.readFile(file, "utf8"));
  const pack = normalizeFigmaExport(data, file);
  const files = [
    await writeRiaFile(root, "figma/figma-tokens.json", JSON.stringify(pack, null, 2)),
    await writeRiaFile(root, "figma/FIGMA_SUMMARY.md", figmaPackToMarkdown(pack)),
  ];
  const allTokens = [...pack.colors, ...pack.spacing, ...pack.radius, ...pack.shadows].map((t) => ({ ...t, source: "figma" }));
  await buildDesignMemory(root, allTokens, []);
  return { pack, files };
}
