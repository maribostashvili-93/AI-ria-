import { describe, expect, it } from "vitest";
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
