import { describe, expect, it } from "vitest";
import { createServer, MCP_TOOLS } from "../src/mcp/server.js";

describe("MCP server (v0.1)", () => {
  it("exposes the eight AI RIA tools", () => {
    expect(MCP_TOOLS).toEqual([
      "repo_scan", "repo_analyze", "context_compress", "design_generate",
      "figma_extract", "figma_compare", "security_scan", "skill_run",
    ]);
  });

  it("constructs without connecting", () => {
    const server = createServer();
    expect(server).toBeDefined();
  });
});
