import { promises as fs } from "node:fs";
import { FigmaComponent, FigmaTokens, FigmaTokensSchema } from "../core/types.js";
import { writeRiaFile } from "../core/paths.js";
import { figmaSummaryMarkdown, extractFromFigmaFile } from "./client.js";

export interface ImportedFigmaData {
  tokens: FigmaTokens;
  components: FigmaComponent[];
  sourceKind: "tokens" | "figma-export" | "mcp-export";
  normalizedSource?: unknown;
}

function isFigmaTokenPayload(value: unknown): value is FigmaTokens {
  return Boolean(value && typeof value === "object" && "colors" in (value as Record<string, unknown>) && "typography" in (value as Record<string, unknown>) && "radii" in (value as Record<string, unknown>) && "spacing" in (value as Record<string, unknown>));
}

function unwrapJsonString(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!(trimmed.startsWith("{") || trimmed.startsWith("["))) return value;
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

function normalizeMcpPayload(value: unknown): unknown {
  const unwrapped = unwrapJsonString(value);
  if (!unwrapped || typeof unwrapped !== "object") return unwrapped;

  if (Array.isArray(unwrapped)) {
    return {
      name: "figma-mcp-selection",
      document: {
        id: "mcp-document",
        name: "Figma MCP Selection",
        type: "DOCUMENT",
        children: unwrapped,
      },
    };
  }

  const record = unwrapped as Record<string, unknown>;

  if (Array.isArray(record.content)) {
    const textBlock = record.content.find((item) => item && typeof item === "object" && (item as Record<string, unknown>).type === "text") as Record<string, unknown> | undefined;
    if (textBlock?.text) return normalizeMcpPayload(textBlock.text);
  }

  if (record.result) return normalizeMcpPayload(record.result);
  if (record.data) return normalizeMcpPayload(record.data);
  if (record.node) return normalizeMcpPayload(record.node);

  if ("id" in record && "type" in record) {
    return {
      name: String(record.name ?? "figma-mcp"),
      document: {
        id: "mcp-document",
        name: String(record.name ?? "Figma MCP Selection"),
        type: "DOCUMENT",
        children: [record],
      },
    };
  }

  return record;
}

export async function importFigmaData(inputFile: string, mode: "auto" | "mcp-export" = "auto"): Promise<ImportedFigmaData> {
  const raw = JSON.parse(await fs.readFile(inputFile, "utf8")) as unknown;
  const normalized = mode === "mcp-export" ? normalizeMcpPayload(raw) : normalizeMcpPayload(raw);
  if (isFigmaTokenPayload(normalized)) {
    return {
      tokens: FigmaTokensSchema.parse(normalized),
      components: Array.isArray((normalized as Record<string, unknown>).components) ? ((normalized as Record<string, unknown>).components as FigmaComponent[]) : [],
      sourceKind: mode === "mcp-export" ? "mcp-export" : "tokens",
      normalizedSource: normalized,
    };
  }
  const extracted = extractFromFigmaFile(normalized as Record<string, unknown>);
  return {
    ...extracted,
    sourceKind: mode === "mcp-export" ? "mcp-export" : "figma-export",
    normalizedSource: normalized,
  };
}

export async function writeImportedFigmaData(root: string, data: ImportedFigmaData): Promise<string[]> {
  const files = [
    await writeRiaFile(root, "figma/figma-tokens.json", JSON.stringify(data.tokens, null, 2)),
    await writeRiaFile(root, "figma/FIGMA_SUMMARY.md", figmaSummaryMarkdown(data.tokens, data.components)),
    await writeRiaFile(root, "figma/MCP_EXPORT_NORMALIZED.json", JSON.stringify(data.normalizedSource ?? {}, null, 2)),
    await writeRiaFile(root, "figma-tokens.json", JSON.stringify(data.tokens, null, 2)),
    await writeRiaFile(root, "figma-components.json", JSON.stringify(data.components, null, 2)),
    await writeRiaFile(root, "figma-design-summary.md", figmaSummaryMarkdown(data.tokens, data.components)),
  ];
  return files;
}
