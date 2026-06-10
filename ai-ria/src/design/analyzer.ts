import { promises as fs } from "node:fs";
import path from "node:path";
import { DesignReport, DesignReportSchema, DesignToken } from "../core/types.js";
import { scanRepo, findDesignDoc } from "../repo/scanner.js";

const TOKEN_PATTERN = /(--[a-z0-9-]+)\s*:\s*([^;]+);/gi;
const CSS_EXTS = new Set([".css", ".scss", ".less"]);
const TAILWIND_CONFIGS = ["tailwind.config.js", "tailwind.config.ts", "tailwind.config.cjs", "tailwind.config.mjs"];

/** Extract CSS custom properties (design tokens) from stylesheet content. */
export function extractTokens(source: string, content: string): DesignToken[] {
  const tokens: DesignToken[] = [];
  for (const match of content.matchAll(TOKEN_PATTERN)) {
    tokens.push({ name: match[1], value: match[2].trim(), source });
  }
  return tokens;
}

/** Analyze a repository's design system surface. */
export async function analyzeDesign(root: string): Promise<DesignReport> {
  const absRoot = path.resolve(root);
  const map = await scanRepo(absRoot);

  const designDocPath = await findDesignDoc(absRoot);

  let hasTailwindConfig = false;
  for (const candidate of TAILWIND_CONFIGS) {
    if (map.files.some((f) => f.path === candidate)) {
      hasTailwindConfig = true;
      break;
    }
  }

  const tokens: DesignToken[] = [];
  for (const f of map.files) {
    if (!CSS_EXTS.has(f.ext)) continue;
    const content = await fs.readFile(path.join(absRoot, f.path), "utf8");
    tokens.push(...extractTokens(f.path, content));
  }

  return DesignReportSchema.parse({
    root: absRoot,
    hasDesignDoc: designDocPath !== null,
    designDocPath,
    hasTailwindConfig,
    tokens,
    tokenCount: tokens.length,
  });
}
