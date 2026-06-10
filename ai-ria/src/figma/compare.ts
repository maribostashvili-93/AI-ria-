import { DesignReport, FigmaTokens } from "../core/types.js";
import { categorizeTokens } from "../design/generator.js";

export interface FigmaCodeDiff {
  matchedColors: string[];
  missingColorsInCode: string[];
  extraColorsInCode: string[];
  missingRadiiInCode: string[];
  typographyNotes: string[];
  spacingNotes: string[];
}

const normalize = (v: string) => v.trim().toLowerCase();

/** Compare Figma tokens against code tokens (v0.2, `ria figma compare`). */
export function compareFigmaToCode(figma: FigmaTokens, code: DesignReport): FigmaCodeDiff {
  const cats = categorizeTokens(code.tokens);
  const codeColors = new Set(cats.colors.map((t) => normalize(t.value)));
  const codeRadii = new Set(cats.radius.map((t) => normalize(t.value)));
  const codeAll = new Set(code.tokens.map((t) => normalize(t.value)));

  const matchedColors: string[] = [];
  const missingColorsInCode: string[] = [];
  for (const c of figma.colors) {
    (codeColors.has(normalize(c.value)) ? matchedColors : missingColorsInCode).push(c.value);
  }
  const figmaColorSet = new Set(figma.colors.map((c) => normalize(c.value)));
  const extraColorsInCode = cats.colors.filter((t) => !figmaColorSet.has(normalize(t.value))).map((t) => `${t.name} = ${t.value}`);

  const missingRadiiInCode = figma.radii.filter((r) => !codeRadii.has(normalize(r.value)) && !codeAll.has(normalize(r.value))).map((r) => r.value);

  const codeFonts = cats.typography.map((t) => normalize(t.value)).join(" ");
  const typographyNotes = figma.typography
    .filter((t) => !codeFonts.includes(normalize(t.fontFamily).split(",")[0]))
    .map((t) => `Figma uses "${t.fontFamily}" ${t.fontSize}px — font not found in code tokens`);

  const spacingNotes = figma.spacing
    .filter((s) => !codeAll.has(normalize(s.value)))
    .map((s) => `Figma spacing ${s.value} has no matching code token`);

  return { matchedColors, missingColorsInCode, extraColorsInCode, missingRadiiInCode, typographyNotes, spacingNotes };
}

/** Render .ria/FIGMA_CODE_DIFF.md */
export function diffToMarkdown(diff: FigmaCodeDiff, figmaSource: string): string {
  const out: string[] = [];
  const issues =
    diff.missingColorsInCode.length + diff.missingRadiiInCode.length +
    diff.typographyNotes.length + diff.spacingNotes.length;
  out.push(`# Figma ↔ Code Diff`, ``);
  out.push(`Source: ${figmaSource}`, ``);
  out.push(issues === 0 ? `✅ Code tokens match Figma.` : `❌ ${issues} mismatch(es) found.`, ``);
  out.push(`## Colors`, ``);
  out.push(`- Matched: ${diff.matchedColors.length ? diff.matchedColors.join(", ") : "none"}`);
  out.push(`- In Figma but missing in code: ${diff.missingColorsInCode.length ? diff.missingColorsInCode.join(", ") : "none"}`);
  out.push(`- In code but not in Figma: ${diff.extraColorsInCode.length ? diff.extraColorsInCode.join("; ") : "none"}`, ``);
  out.push(`## Border Radius`, ``);
  out.push(diff.missingRadiiInCode.length ? `- Missing in code: ${diff.missingRadiiInCode.join(", ")}` : `- ✅ consistent`, ``);
  out.push(`## Typography`, ``);
  if (diff.typographyNotes.length) for (const n of diff.typographyNotes) out.push(`- ${n}`);
  else out.push(`- ✅ consistent`);
  out.push(``, `## Spacing`, ``);
  if (diff.spacingNotes.length) for (const n of diff.spacingNotes) out.push(`- ${n}`);
  else out.push(`- ✅ consistent`);
  out.push(``, `Run \`ria ui-fix --preview\` to generate patch suggestions.`);
  return out.join("\n");
}
