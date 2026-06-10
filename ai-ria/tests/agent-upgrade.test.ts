import { afterEach, describe, expect, it } from "vitest";
import path from "node:path";
import os from "node:os";
import { promises as fs } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const ROOT = path.join(__dirname, "..");
const DEMO = path.join(ROOT, "examples", "demo-app");
const FIGMA_EXPORT = path.join(ROOT, "examples", "figma-export.json");
const TMP_PREFIX = path.join(os.tmpdir(), "ai-ria-agent-upgrade-");
const createdDirs: string[] = [];

async function makeProjectCopy(): Promise<string> {
  const dir = await fs.mkdtemp(TMP_PREFIX);
  createdDirs.push(dir);
  await fs.cp(DEMO, dir, { recursive: true });
  return dir;
}

async function runCli(args: string[], cwd = ROOT): Promise<string> {
  const tsxCli = path.join(ROOT, "node_modules", "tsx", "dist", "cli.mjs");
  const entry = path.join(ROOT, "src", "cli", "index.ts");
  const { stdout, stderr } = await execFileAsync(process.execPath, [tsxCli, entry, ...args], { cwd });
  return `${stdout}\n${stderr}`;
}

afterEach(async () => {
  await Promise.all(createdDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe("agent intelligence upgrade commands", () => {
  it("imports Figma data and writes compact visual-agent artifacts", async () => {
    const project = await makeProjectCopy();

    await runCli(["figma", "import", project, FIGMA_EXPORT]);

    await expect(fs.readFile(path.join(project, ".ria", "figma", "figma-tokens.json"), "utf8")).resolves.toContain("\"colors\"");
    await expect(fs.readFile(path.join(project, ".ria", "figma", "FIGMA_SUMMARY.md"), "utf8")).resolves.toContain("Figma Design Summary");
    await expect(fs.readFile(path.join(project, ".ria", "design-memory.json"), "utf8")).resolves.toContain("\"tokens\"");
  });

  it("imports MCP-wrapped Figma export explicitly in mcp-export mode", async () => {
    const project = await makeProjectCopy();
    const mcpExport = path.join(project, "figma-mcp-export.json");
    await fs.writeFile(
      mcpExport,
      JSON.stringify({
        content: [
          {
            type: "text",
            text: JSON.stringify({
              id: "0:1",
              name: "MCP Frame",
              type: "FRAME",
              cornerRadius: 10,
              itemSpacing: 12,
              fills: [{ type: "SOLID", color: { r: 0.49, g: 0.27, b: 0.92 } }],
              children: [
                {
                  id: "0:2",
                  name: "MCP Text",
                  type: "TEXT",
                  style: { fontFamily: "Inter", fontSize: 18 },
                },
              ],
            }),
          },
        ],
      }, null, 2),
      "utf8",
    );

    await runCli(["figma", "import", project, mcpExport, "--mcp-export"]);

    await expect(fs.readFile(path.join(project, ".ria", "figma", "MCP_EXPORT_NORMALIZED.json"), "utf8")).resolves.toContain("\"type\": \"DOCUMENT\"");
    await expect(fs.readFile(path.join(project, ".ria", "figma", "figma-tokens.json"), "utf8")).resolves.toContain("\"spacing\"");
  });

  it("builds conversation compression and layered memory outputs", async () => {
    const project = await makeProjectCopy();
    const conversation = path.join(project, "conversation.txt");
    await fs.writeFile(
      conversation,
      [
        "Decision: keep the shared layout for all room pages.",
        "Completed: implemented auth guard in src/components/ProtectedRoute.jsx",
        "Remaining: add stronger warning copy to the help room",
        "Warning: do not bypass src/context/AuthContext.jsx",
        "Design rule: preserve the existing room card visual style",
        "Security note: never commit demo credentials",
        "Next action: create the final agent pack",
      ].join("\n"),
      "utf8",
    );

    await runCli(["memory", "add", project, "--task", "Auth cleanup", "--decision", "Keep auth in context", "--reason", "Single source of truth", "--type", "architecture", "--files", "src/context/AuthContext.jsx", "--agent", "codex"]);
    await runCli(["handoff", "create", project, "--task", "Auth cleanup", "--completed", "Protected routes", "--remaining", "Session persistence", "--agent", "codex"]);
    await runCli(["memory", "short", project]);
    await runCli(["memory", "working", project]);
    await runCli(["memory", "deep", project]);
    await runCli(["memory", "compress-conversation", project, conversation]);

    await expect(fs.readFile(path.join(project, ".ria", "memory", "short-memory.md"), "utf8")).resolves.toContain("Latest Decisions");
    await expect(fs.readFile(path.join(project, ".ria", "memory", "working-memory.md"), "utf8")).resolves.toContain("Active Task State");
    await expect(fs.readFile(path.join(project, ".ria", "memory", "deep-memory.md"), "utf8")).resolves.toContain("Full Memory History");
    await expect(fs.readFile(path.join(project, ".ria", "memory", "conversation-summary.json"), "utf8")).resolves.toContain("\"decisions\"");
  });

  it("builds design-pack and agent-pack for next-agent workflows", async () => {
    const project = await makeProjectCopy();

    await runCli(["analyze", project]);
    await runCli(["memory", "add", project, "--task", "Room navigation", "--decision", "Preserve role-based routing", "--reason", "Avoid privilege leaks", "--type", "decision", "--files", "src/data/routes.js", "--agent", "codex"]);
    await runCli(["handoff", "create", project, "--task", "Room navigation", "--completed", "Route inventory", "--remaining", "UI cleanup", "--agent", "codex", "--next-action", "Read the agent pack before editing routes"]);
    await runCli(["figma", "import", project, FIGMA_EXPORT]);
    await runCli(["design-pack", project]);
    await runCli(["agent-pack", project]);

    await expect(fs.readFile(path.join(project, ".ria", "design", "DESIGN_PACK.md"), "utf8")).resolves.toContain("Design Pack");
    await expect(fs.readFile(path.join(project, ".ria", "agent-pack", "AGENT_PACK.md"), "utf8")).resolves.toContain("AGENT PACK");
    await expect(fs.readFile(path.join(project, ".ria", "agent-pack", "AGENT_PACK.md"), "utf8")).resolves.toContain("Preserve role-based routing");
    await expect(fs.readFile(path.join(project, ".ria", "context", "token-report.json"), "utf8")).resolves.toContain("\"rawTokenCount\"");
  });
});
