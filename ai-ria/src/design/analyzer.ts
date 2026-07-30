import { promises as fs } from "node:fs";
import path from "node:path";
import { DesignReport, DesignReportSchema, DesignToken, RepoMap } from "../core/types.js";
import { scanRepo, findDesignDoc } from "../repo/scanner.js";

/**
 * A custom property runs to the next `;` or to the end of its block.
 *
 * Minified and compact CSS omits the semicolon on the last declaration
 * (`:root{--max:1240px}`), so stopping only at `;` swallows everything up to
 * the next one — the token value ends up containing whole rules, and that
 * garbage lands in DESIGN.md and the visual agent pack as a design token.
 */
const TOKEN_PATTERN = /(--[a-z0-9-]+)\s*:\s*([^;{}]+)\s*[;}]/gi;
const CSS_EXTS = new Set([".css", ".scss", ".less"]);
const TAILWIND_CONFIGS = ["tailwind.config.js", "tailwind.config.ts", "tailwind.config.cjs", "tailwind.config.mjs"];

/**
 * Extract CSS custom properties (design tokens) from stylesheet content.
 * A property redefined later in the same file (a theme override) keeps its
 * first definition — the root value is the one agents should build against.
 */
export function extractTokens(source: string, content: string): DesignToken[] {
  const tokens: DesignToken[] = [];
  const seen = new Set<string>();
  for (const match of content.matchAll(TOKEN_PATTERN)) {
    const value = match[2].trim();
    if (!value || seen.has(match[1])) continue;
    seen.add(match[1]);
    tokens.push({ name: match[1], value, source });
  }
  return tokens;
}

/**
 * Analyze a repository's design system surface.
 * Pass an already-built `RepoMap` to avoid a second full disk scan.
 */
export async function analyzeDesign(root: string, repoMap?: RepoMap): Promise<DesignReport> {
  const absRoot = path.resolve(root);
  const map = repoMap ?? (await scanRepo(absRoot));

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
