import { promises as fs } from "node:fs";
import path from "node:path";
import { ensureRiaDir, readRiaFile } from "../core/paths.js";
import { FigmaTokenPack, FigmaTokenPackSchema } from "./figma-token-schema.js";

const cssVar = (name: string) => `--${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;

function cssDraft(pack: FigmaTokenPack): string {
  const lines = ["/* AI RIA — starter draft generated from Figma tokens. NOT production code. */", ":root {"];
  for (const t of pack.colors) lines.push(`  ${cssVar(t.name)}: ${t.value};`);
  for (const t of pack.spacing) lines.push(`  ${cssVar(t.name)}: ${t.value};`);
  for (const t of pack.radius) lines.push(`  ${cssVar(t.name)}: ${t.value};`);
  for (const t of pack.shadows) lines.push(`  ${cssVar(t.name)}: ${t.value};`);
  lines.push("}");
  for (const c of pack.components.slice(0, 20)) {
    const cls = c.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    lines.push("", `.${cls} {`, `  /* TODO: implement ${c.name} using the variables above */`, "}");
  }
  return lines.join("\n");
}

function htmlDraft(pack: FigmaTokenPack): string {
  const sections = pack.components.slice(0, 12).map((c) => {
    const cls = c.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    return `  <section class="${cls}">\n    <!-- ${c.name} draft -->\n    <h2>${c.name}</h2>\n  </section>`;
  });
  return [
    "<!-- AI RIA — starter draft generated from Figma tokens. NOT pixel-perfect production code. -->",
    "<!doctype html>",
    "<html lang=\"en\">",
    "<head>",
    "  <meta charset=\"utf-8\" />",
    "  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />",
    "  <title>Draft from Figma</title>",
    "  <link rel=\"stylesheet\" href=\"./draft.css\" />",
    "</head>",
    "<body>",
    sections.join("\n") || "  <!-- no components found in token pack -->",
    "</body>",
    "</html>",
  ].join("\n");
}

function tailwindSuggestions(pack: FigmaTokenPack): string {
  const entry = (t: { name: string; value: string }) => `      "${t.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}": "${t.value}",`;
  return [
    "# Tailwind Suggestions",
    "",
    "Starter `tailwind.config` extension generated from Figma tokens — adjust before use.",
    "",
    "```js",
    "export default {",
    "  theme: {",
    "    extend: {",
    "      colors: {",
    ...pack.colors.slice(0, 30).map(entry),
    "      },",
    "      spacing: {",
    ...pack.spacing.slice(0, 20).map(entry),
    "      },",
    "      borderRadius: {",
    ...pack.radius.slice(0, 10).map(entry),
    "      },",
    "    },",
    "  },",
    "};",
    "```",
  ].join("\n");
}

/**
 * `ria figma generate-code` — starter drafts (HTML, CSS, Tailwind notes)
 * from imported Figma tokens. Drafts, not promises of pixel-perfect output.
 */
export async function generateFigmaCode(root: string): Promise<string[]> {
  const raw = await readRiaFile(root, "figma/figma-tokens.json");
  if (!raw) throw new Error("No .ria/figma/figma-tokens.json found. Run `ria figma import <project> <tokens.json>` first.");
  const pack = FigmaTokenPackSchema.parse(JSON.parse(raw));

  const dir = path.join(await ensureRiaDir(root), "figma", "generated");
  await fs.mkdir(dir, { recursive: true });
  const out: [string, string][] = [
    ["draft.css", cssDraft(pack)],
    ["draft.html", htmlDraft(pack)],
    ["tailwind-suggestions.md", tailwindSuggestions(pack)],
    ["README.md", "# Generated drafts\n\nStarter code generated from Figma tokens by AI RIA.\nUse as a starting point — review every line before shipping.\n"],
  ];
  const files: string[] = [];
  for (const [name, content] of out) {
    const file = path.join(dir, name);
    await fs.writeFile(file, content + "\n", "utf8");
    files.push(file);
  }
  return files;
}
