import { promises as fs } from "node:fs";
import { readRiaFile, writeRiaFile } from "../core/paths.js";
import { DesignToken } from "../core/types.js";
import { buildDesignMemory, loadDesignMemory, designMemoryToMarkdown, addMemory, loadMemories } from "../memory/memory-store.js";

const TOKEN_LINE_RE = /^[-*]?\s*`?([A-Za-z][\w./ -]{1,40})`?\s*[:=]\s*`?(#[0-9a-fA-F]{3,8}|\d+(?:\.\d+)?(?:px|rem|em|%)|[\w-]+(?:\s*,\s*[\w-]+)*)`?\s*$/;
const RULE_SECTION_RE = /^(do.?not.?change|rules|layout|constraints|principles)/i;
const TOKEN_SECTION_RE = /^(colors?|typography|spacing|radius|radii|shadows?|tokens)/i;

export interface DesignMdImportResult {
  tokens: DesignToken[];
  rules: string[];
  doNotChange: string[];
}

/**
 * Import a DESIGN.md (google-labs design.md-style structured design doc)
 * into Design Memory: tokens from token sections, rules from rule sections.
 */
export async function importDesignMd(root: string, file: string): Promise<DesignMdImportResult> {
  const raw = await fs.readFile(file, "utf8");
  const tokens: DesignToken[] = [];
  const rules: string[] = [];
  const doNotChange: string[] = [];

  let section = "";
  for (const line of raw.split("\n")) {
    const heading = line.match(/^#{1,4}\s+(.*)/);
    if (heading) {
      section = heading[1].trim();
      continue;
    }
    const trimmed = line.replace(/^[-*]\s*/, "").trim();
    if (!trimmed) continue;

    if (TOKEN_SECTION_RE.test(section)) {
      const m = line.trim().match(TOKEN_LINE_RE);
      if (m) tokens.push({ name: m[1].trim(), value: m[2].trim(), source: "DESIGN.md" });
      else if (trimmed.length > 5 && trimmed.length < 200) rules.push(`${section}: ${trimmed}`);
    } else if (RULE_SECTION_RE.test(section)) {
      if (trimmed.length > 5 && trimmed.length < 200) {
        rules.push(trimmed);
        if (/^do.?not.?change/i.test(section)) doNotChange.push(trimmed);
      }
    }
  }

  await buildDesignMemory(root, tokens, []);
  for (const rule of rules.slice(0, 30)) {
    await addMemory(root, { type: "design-rule", title: rule, tags: ["design.md"], agent: "ria" });
  }
  // re-merge so the rules land in design memory too
  const designEntries = (await loadMemories(root)).filter((e) => e.type === "design-rule");
  await buildDesignMemory(root, [], designEntries);

  return { tokens, rules, doNotChange };
}

/**
 * Build .ria/design/DESIGN_PACK.md — the design knowledge a UI-generating
 * agent reads: rules, do-not-change list, tokens, component map, Figma summary.
 */
export async function buildDesignPack(root: string): Promise<string> {
  const memory = await loadDesignMemory(root);
  const figmaSummary = await readRiaFile(root, "figma/FIGMA_SUMMARY.md");
  const designMd = await readRiaFile(root, "DESIGN.md");

  const lines: string[] = ["# Design Pack", "", `Generated: ${new Date().toISOString()}`, ""];
  if (memory) {
    lines.push(designMemoryToMarkdown(memory));
  } else {
    lines.push("_No design memory yet. Run `ria design`, `ria figma import`, or `ria design-md import` first._", "");
  }
  if (designMd) {
    const excerpt = designMd.split("\n").slice(0, 50).join("\n");
    lines.push("## DESIGN.md (excerpt)", "", excerpt, "");
  }
  if (figmaSummary) {
    const excerpt = figmaSummary.split("\n").slice(0, 40).join("\n");
    lines.push("## Figma Summary (excerpt)", "", excerpt, "");
  }

  const markdown = lines.join("\n");
  await writeRiaFile(root, "design/DESIGN_PACK.md", markdown);

  // Token accounting: the design pack serves visual agents.
  const { estimateTokens } = await import("../compression/tokenizer.js");
  const { recordPackGeneration } = await import("../tokens/token-ledger.js");
  const rawTokens = estimateTokens([designMd ?? "", figmaSummary ?? "", memory ? JSON.stringify(memory) : ""].join("\n"));
  await recordPackGeneration(root, { agent: "visual-agent", task: "design pack build", pack: "DESIGN_PACK.md", rawTokens, compressedTokens: estimateTokens(markdown) });

  return markdown;
}
