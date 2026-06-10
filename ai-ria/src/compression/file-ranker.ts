import { RepoMap } from "../core/types.js";

export interface RankedFile {
  path: string;
  score: number;
  reasons: string[];
  keep: boolean;
  bytes: number;
}

const IGNORE_PATTERNS: [RegExp, string][] = [
  [/(^|\/)(node_modules|dist|build|out|coverage|\.next|\.ria)\//, "generated or vendored directory"],
  [/(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb)$/, "lockfile"],
  [/\.(png|jpe?g|gif|webp|ico|svg|woff2?|ttf|eot|mp4|mp3|pdf|zip)$/i, "binary asset"],
  [/\.min\.(js|css)$/, "minified bundle"],
  [/\.map$/, "source map"],
];
const MAX_BYTES = 120_000;

/**
 * Rank every file by how much an agent needs it, with a reason per decision.
 * Kept files are sorted by score; excluded files carry the reason they were dropped.
 */
export function rankFiles(map: RepoMap): { kept: RankedFile[]; ignored: RankedFile[] } {
  const kept: RankedFile[] = [];
  const ignored: RankedFile[] = [];

  for (const f of map.files) {
    const p = f.path;
    const reasons: string[] = [];
    let score = 0;

    const ignoreHit = IGNORE_PATTERNS.find(([re]) => re.test(p));
    if (ignoreHit) {
      ignored.push({ path: p, score: 0, reasons: [ignoreHit[1]], keep: false, bytes: f.bytes });
      continue;
    }
    if (f.bytes > MAX_BYTES) {
      ignored.push({ path: p, score: 0, reasons: [`too large (${Math.round(f.bytes / 1024)}KB)`], keep: false, bytes: f.bytes });
      continue;
    }
    if (f.lines === 0) {
      ignored.push({ path: p, score: 0, reasons: ["empty or non-text"], keep: false, bytes: f.bytes });
      continue;
    }

    if (map.entryPoints.includes(p)) { score += 10; reasons.push("entry point"); }
    if (p === "package.json" || map.configFiles.includes(p)) { score += 7; reasons.push("configuration"); }
    if (p === "README.md" || map.importantFiles.includes(p)) { score += 6; reasons.push("key documentation"); }
    if (/(^|\/)(pages|app|routes)\//.test(p)) { score += 5; reasons.push("route"); }
    if (map.components.includes(p)) { score += 4; reasons.push("component"); }
    if (map.styles.includes(p)) { score += 3; reasons.push("stylesheet"); }
    if (/\.(ts|tsx|js|jsx|mjs|vue|svelte|astro)$/.test(p)) { score += 2; reasons.push("source code"); }
    if (/\.(test|spec)\./.test(p)) { score -= 1; reasons.push("test (lower priority)"); }
    if (/\.html?$/.test(p)) { score += 2; reasons.push("page markup"); }

    if (score <= 0) {
      ignored.push({ path: p, score, reasons: reasons.length ? reasons : ["low relevance"], keep: false, bytes: f.bytes });
    } else {
      kept.push({ path: p, score, reasons, keep: true, bytes: f.bytes });
    }
  }

  kept.sort((a, b) => b.score - a.score || a.bytes - b.bytes);
  return { kept, ignored };
}
