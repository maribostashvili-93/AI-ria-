export interface ParsedFigmaLink {
  url: string;
  fileKey: string;
  linkType: "design" | "file" | "proto" | "board" | "slides" | "unknown";
}

export interface FigmaWorkflowGuide {
  parsed: ParsedFigmaLink;
  tokenCommand: string;
  mcpImportCommand: string;
  notes: string[];
}

const FIGMA_LINK_RE = /^https?:\/\/(?:www\.)?figma\.com\/(design|file|proto|board|slides)\/([A-Za-z0-9]+)(?:\/|[?#]|$)/i;

export function parseFigmaLink(url: string): ParsedFigmaLink {
  const trimmed = url.trim();
  const match = trimmed.match(FIGMA_LINK_RE);
  if (!match) {
    throw new Error("Unsupported Figma link. Expected https://www.figma.com/design/<FILE_KEY>/... or similar.");
  }
  const linkType = match[1].toLowerCase() as ParsedFigmaLink["linkType"];
  const fileKey = match[2];
  return { url: trimmed, fileKey, linkType };
}

export function buildFigmaWorkflowGuide(projectPath: string, figmaLink: string): FigmaWorkflowGuide {
  const parsed = parseFigmaLink(figmaLink);
  return {
    parsed,
    tokenCommand: `ria figma extract "${projectPath}" --file ${parsed.fileKey}`,
    mcpImportCommand: `ria figma import "${projectPath}" "<mcp-export.json>" --mcp-export`,
    notes: [
      "Use the token command if you have a FIGMA_TOKEN and want to read directly from the Figma API.",
      "Use the MCP import command if you are exporting JSON from cursor-talk-to-figma-mcp or another Figma plugin bridge without a token.",
      "The link alone is not enough to read node details; AI RIA needs either API access or exported design JSON.",
    ],
  };
}

export function figmaWorkflowGuideToMarkdown(guide: FigmaWorkflowGuide): string {
  return [
    "# Figma Link Guide",
    "",
    `Link: ${guide.parsed.url}`,
    `Link type: ${guide.parsed.linkType}`,
    `File key: ${guide.parsed.fileKey}`,
    "",
    "## Recommended Paths",
    "",
    "### 1. Direct Figma API",
    "",
    "Requires a FIGMA_TOKEN.",
    "",
    "```bash",
    guide.tokenCommand,
    "```",
    "",
    "### 2. Tokenless MCP / Plugin Export",
    "",
    "Use this if you export JSON from cursor-talk-to-figma-mcp or another plugin flow.",
    "",
    "```bash",
    guide.mcpImportCommand,
    "```",
    "",
    "## Notes",
    "",
    ...guide.notes.map((note) => `- ${note}`),
    "",
  ].join("\n");
}
