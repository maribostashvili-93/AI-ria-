import { CompressedContext, ContextPack, DesignReport, RepoMap, SecurityReport, Skill, SkillResult } from "../core/types.js";

function sortDesc(record: Record<string, number>): [string, number][] {
  return Object.entries(record).sort((a, b) => b[1] - a[1]);
}

/**
 * Push every heading in a document down by `by` levels, capped at h6.
 *
 * Packs embed whole generated documents inside their own sections. Without
 * this, a pack is a flat run of `#` headings and an agent cannot tell the
 * section title from the content it contains. Fenced code blocks are left
 * alone — the packs quote markdown and shell snippets that start with `#`.
 */
export function demoteHeadings(markdown: string, by = 1): string {
  let inFence = false;
  return markdown
    .split("\n")
    .map((line) => {
      if (/^\s*(```|~~~)/.test(line)) {
        inFence = !inFence;
        return line;
      }
      if (inFence) return line;
      const heading = /^(#{1,6})(\s+\S)/.exec(line);
      if (!heading) return line;
      const level = Math.min(heading[1].length + by, 6);
      return "#".repeat(level) + line.slice(heading[1].length);
    })
    .join("\n");
}

/** .ria/repo-summary.md */
export function repoMapToMarkdown(map: RepoMap): string {
  const out: string[] = [];
  out.push(`# Repository Map`, ``);
  out.push(`**Root:** ${map.root}`);
  out.push(`**Scanned:** ${map.scannedAt}`);
  out.push(`**Framework:** ${map.framework}`);
  out.push(`**Files:** ${map.fileCount} · **Lines:** ${map.totalLines} · **Size:** ${(map.totalBytes / 1024).toFixed(1)} KB`, ``);
  out.push(`## Languages`, ``);
  for (const [lang, count] of sortDesc(map.languages)) out.push(`- ${lang}: ${count} files`);
  out.push(``, `## Layout`, ``);
  for (const [dir, count] of sortDesc(map.topLevelDirs)) out.push(`- \`${dir}\`: ${count} files`);
  if (map.entryPoints.length) {
    out.push(``, `## Entry Points`, ``);
    for (const e of map.entryPoints) out.push(`- \`${e}\``);
  }
  if (map.routes.length) {
    out.push(``, `## Routes`, ``);
    for (const r of map.routes) out.push(`- \`${r || "/"}\``);
  }
  if (map.components.length) {
    out.push(``, `## Components (${map.components.length})`, ``);
    for (const c of map.components.slice(0, 30)) out.push(`- \`${c}\``);
    if (map.components.length > 30) out.push(`- … +${map.components.length - 30} more`);
  }
  if (map.styles.length) {
    out.push(``, `## Styles`, ``);
    for (const s of map.styles.slice(0, 20)) out.push(`- \`${s}\``);
  }
  if (map.configFiles.length) {
    out.push(``, `## Config Files`, ``);
    for (const c of map.configFiles) out.push(`- \`${c}\``);
  }
  if (map.importantFiles.length) {
    out.push(``, `## Important Files`, ``);
    for (const f of map.importantFiles) out.push(`- \`${f}\``);
  }
  out.push(``, `## Dependencies`, ``);
  out.push(`- Runtime: ${map.dependencies.join(", ") || "none"}`);
  out.push(`- Dev: ${map.devDependencies.join(", ") || "none"}`);
  out.push(``, `## Conventions`, ``);
  const c = map.conventions;
  out.push(`- Language: ${c.usesTypeScript ? "TypeScript" : "JavaScript"}`);
  out.push(`- Tests: ${c.hasTests ? "yes" : "no"}`);
  out.push(`- src/ layout: ${c.hasSrcLayout ? "yes" : "no"}`);
  out.push(`- Package manager: ${c.packageManager}`);
  out.push(`- Design doc: ${c.hasDesignDoc ? "yes" : "no"}`);
  return out.join("\n");
}

export function compressionToMarkdown(ctx: CompressedContext): string {
  const out: string[] = [];
  out.push(`# Compressed Context`, ``);
  out.push(`~${ctx.tokenEstimate} tokens (raw repo ≈ ${ctx.originalTokenEstimate} tokens, ratio ${ctx.compressionRatio})`, ``);
  out.push("```", ctx.summary, "```");
  return out.join("\n");
}

/** .ria/context-pack.md */
export function contextPackToMarkdown(pack: ContextPack): string {
  const out: string[] = [];
  out.push(`# Context Pack`, ``);
  out.push(`Generated ${pack.generatedAt}. ~${pack.totalTokens} tokens (raw repo ≈ ${pack.originalTokenEstimate}, ratio ${pack.compressionRatio}).`, ``);
  out.push(`## Repo Summary`, ``, "```", pack.summary, "```", ``);
  out.push(`## Key Files (${pack.files.length})`, ``);
  for (const f of pack.files) {
    out.push(`### \`${f.path}\` — ${f.role}${f.truncated ? " (truncated)" : ""}`, ``);
    out.push("```");
    out.push(f.excerpt);
    out.push("```", ``);
  }
  return out.join("\n");
}

/** .ria/SECURITY_REPORT.md */
export function securityToMarkdown(report: SecurityReport): string {
  const out: string[] = [];
  out.push(`# Security Report`, ``);
  out.push(`Scanned ${report.scannedFiles} files in ${report.root}`, ``);
  if (report.findings.length === 0) {
    out.push(`✅ No findings.`);
    return out.join("\n");
  }
  const bySeverity: Record<string, number> = {};
  for (const f of report.findings) bySeverity[f.severity] = (bySeverity[f.severity] ?? 0) + 1;
  out.push(`**${report.findings.length} finding(s):** ` + Object.entries(bySeverity).map(([s, n]) => `${s}: ${n}`).join(", "), ``);
  out.push(`| Severity | Rule | File | Line | Message |`);
  out.push(`|---|---|---|---|---|`);
  for (const f of report.findings) {
    out.push(`| ${f.severity} | ${f.rule} | ${f.file} | ${f.line} | ${f.message} |`);
  }
  out.push(``, `## Evidence`, ``);
  for (const f of report.findings) {
    out.push(`- \`${f.file}:${f.line}\` (${f.rule}): \`${f.snippet.replace(/`/g, "'")}\``);
  }
  return out.join("\n");
}

export function designToMarkdown(report: DesignReport): string {
  const out: string[] = [];
  out.push(`# Design System Report`, ``);
  out.push(`**Root:** ${report.root}`);
  out.push(`- Design doc: ${report.hasDesignDoc ? `yes (\`${report.designDocPath}\`)` : "no"}`);
  out.push(`- Tailwind config: ${report.hasTailwindConfig ? "yes" : "no"}`);
  out.push(`- Design tokens: ${report.tokenCount}`);
  if (report.tokens.length) {
    out.push(``, `| Token | Value | Source |`, `|---|---|---|`);
    for (const t of report.tokens.slice(0, 50)) out.push(`| \`${t.name}\` | \`${t.value}\` | ${t.source} |`);
    if (report.tokens.length > 50) out.push(`| … | +${report.tokens.length - 50} more | |`);
  }
  return out.join("\n");
}

export function skillsToMarkdown(skills: Skill[]): string {
  const out: string[] = [];
  out.push(`# Agent Skills`, ``);
  for (const s of skills) {
    out.push(`## ${s.name}`, ``);
    out.push(s.description, ``);
    out.push(`- **Input:** ${s.input}`);
    out.push(`- **Steps:** ${s.steps.join(" → ")}`);
    out.push(`- **Checks:** ${s.checks.join("; ")}`);
    out.push(`- **Output:** ${s.output}`, ``);
    out.push(`Run: \`ria skill ${s.name} <path>\``, ``);
  }
  return out.join("\n");
}

/** .ria/SKILL_<name>.md */
export function skillResultToMarkdown(result: SkillResult): string {
  const out: string[] = [];
  out.push(`# Skill Report: ${result.skill}`, ``);
  out.push(`**Target:** ${result.root}`);
  out.push(`**Result:** ${result.passed ? "✅ PASSED" : "❌ ISSUES FOUND"}`, ``);
  out.push(`## Checks`, ``);
  out.push(`| Check | Result | Details |`, `|---|---|---|`);
  for (const c of result.checks) out.push(`| ${c.name} | ${c.passed ? "✅" : "❌"} | ${c.details} |`);
  if (result.evidence.length) {
    out.push(``, `## Evidence`, ``);
    for (const e of result.evidence) {
      out.push(`- ${e.file ? `\`${e.file}${e.line ? `:${e.line}` : ""}\` — ` : ""}${e.note}`);
    }
  }
  return out.join("\n");
}
