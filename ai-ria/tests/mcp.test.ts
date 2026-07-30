import { describe, expect, it } from "vitest";
import { normalizeArgv } from "../src/core/argv.js";
import { createServer, MCP_TOOLS, MCP_TOOL_REGISTRY } from "../src/mcp/server.js";

describe("MCP server (v0.1)", () => {
  it("exports every registered MCP tool dynamically", () => {
    const registeredNames = MCP_TOOL_REGISTRY.map((tool) => tool.name);
    expect(MCP_TOOLS).toEqual(registeredNames);
    expect(new Set(MCP_TOOLS).size).toBe(MCP_TOOLS.length);
  });

  it("includes the current AI RIA tool surface", () => {
    expect(MCP_TOOLS).toEqual(expect.arrayContaining([
      "repo_scan",
      "repo_analyze",
      "context_compress",
      "design_generate",
      "figma_extract",
      "figma_compare",
      "security_scan",
      "skill_run",
      "memory_save",
      "memory_search",
      "memory_compress",
      "memory_graph",
      "handoff_create",
      "handoff_load",
      "design_recall",
    ]));
  });

  it("constructs without connecting", () => {
    const server = createServer();
    expect(server).toBeDefined();
  });
});

describe("CLI argument normalization", () => {
  it("drops the separator pnpm forwards but npm strips", () => {
    const args = ["node", "cli.js", "--", "memory", "add", ".", "--title", "x"];
    expect(normalizeArgv(args)).toEqual(["node", "cli.js", "memory", "add", ".", "--title", "x"]);
  });

  it("leaves normal argv untouched", () => {
    const args = ["node", "cli.js", "analyze", "."];
    expect(normalizeArgv(args)).toEqual(args);
    expect(normalizeArgv(["node", "cli.js"])).toEqual(["node", "cli.js"]);
  });

  it("only strips a leading separator, not one inside the arguments", () => {
    const args = ["node", "cli.js", "memory", "add", "--", "."];
    expect(normalizeArgv(args)).toEqual(args);
  });
});
