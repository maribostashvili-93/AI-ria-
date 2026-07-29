import { describe, it, expect, beforeAll } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { savingsPercent, fmt } from "../src/tokens/token-estimator.js";
import { getProfile, AGENT_PROFILES } from "../src/tokens/token-limits.js";
import { setBudget, resolveProfile } from "../src/tokens/token-budget.js";
import { recordPackGeneration, loadLedger } from "../src/tokens/token-ledger.js";
import { buildTokenSummary, tokenSummaryToMarkdown, writeTokenReport } from "../src/tokens/token-report.js";

let root: string;

beforeAll(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "ria-tokens-"));
});

describe("token estimator", () => {
  it("computes savings percentage like the spec example", () => {
    expect(savingsPercent(180_000, 12_000)).toBe(93.3);
    expect(savingsPercent(0, 100)).toBe(0);
  });

  it("formats numbers with separators", () => {
    expect(fmt(168_000)).toBe("168,000");
  });
});

describe("agent token profiles", () => {
  it("ships defaults for the six agents", () => {
    for (const name of ["claude", "cursor", "codex", "visual-agent", "security-agent", "compact"]) {
      expect(AGENT_PROFILES[name]).toBeDefined();
      expect(AGENT_PROFILES[name].tokenLimit).toBeGreaterThan(0);
      expect(AGENT_PROFILES[name].packBudget).toBeGreaterThan(0);
      expect(AGENT_PROFILES[name].include.length).toBeGreaterThan(0);
    }
    expect(getProfile("claude").tokenLimit).toBe(200_000);
    expect(getProfile("unknown-agent").name).toBe("unknown-agent");
  });

  it("applies project budget overrides", async () => {
    await setBudget(root, "claude", 50_000);
    const profile = await resolveProfile(root, "claude");
    expect(profile.tokenLimit).toBe(50_000);
  });
});

describe("token ledger", () => {
  it("records pack generations with savings and remaining budget", async () => {
    const entry = await recordPackGeneration(root, {
      agent: "claude",
      task: "Build dashboard UI from Figma",
      pack: "AGENT_PACK.md",
      rawTokens: 180_000,
      compressedTokens: 12_000,
    });
    expect(entry.savedTokens).toBe(168_000);
    expect(entry.compressionRatio).toBeCloseTo(0.0667, 3);
    expect(entry.limit).toBe(50_000); // override from previous test
    expect(entry.remainingBudget).toBe(50_000 - 12_000);
    const ledger = await loadLedger(root);
    expect(ledger.length).toBe(1);
  });

  it("tracks cumulative remaining budget per agent", async () => {
    const entry = await recordPackGeneration(root, { agent: "claude", pack: "CLAUDE_CONTEXT.md", rawTokens: 100_000, compressedTokens: 10_000 });
    expect(entry.remainingBudget).toBe(50_000 - 12_000 - 10_000);
  });
});

describe("token report", () => {
  it("aggregates totals, by-agent, by-pack, and warnings", async () => {
    await recordPackGeneration(root, { agent: "compact", pack: "COMPACT_CONTEXT.md", rawTokens: 100_000, compressedTokens: 5_000 });
    const summary = await buildTokenSummary(root);
    expect(summary.entryCount).toBe(3);
    expect(summary.totalSavedTokens).toBeGreaterThan(200_000);
    expect(summary.savingsPercent).toBeGreaterThan(90);
    expect(summary.byAgent["claude"].entries).toBe(2);
    expect(summary.byPack["AGENT_PACK.md"]).toBe(12_000);
    // 5,000-token pack exceeds compact's 2,500 preferred size
    expect(summary.warnings.some((w) => w.includes("COMPACT_CONTEXT.md"))).toBe(true);
    const md = tokenSummaryToMarkdown(summary);
    expect(md).toContain("Tokens by Agent");
    expect(md).toContain("Savings");
  });

  it("does not multiply savings when the same pack is rebuilt", async () => {
    const before = await buildTokenSummary(root);
    await recordPackGeneration(root, { agent: "compact", pack: "COMPACT_CONTEXT.md", rawTokens: 100_000, compressedTokens: 5_000 });
    const after = await buildTokenSummary(root);
    expect(after.totalSavedTokens).toBe(before.totalSavedTokens);
    expect(after.totalRawTokens).toBe(before.totalRawTokens);
    // the ledger still keeps the full history
    expect(after.entryCount).toBe(before.entryCount + 1);
  });

  it("filters by agent and writes report files", async () => {
    const claudeOnly = await buildTokenSummary(root, "claude");
    expect(claudeOnly.entryCount).toBe(2);
    const { files } = await writeTokenReport(root);
    expect(files.some((f) => f.endsWith("TOKEN_REPORT.md"))).toBe(true);
    const md = await fs.readFile(path.join(root, ".ria", "tokens", "TOKEN_REPORT.md"), "utf8");
    expect(md).toContain("Raw context");
  });
});
