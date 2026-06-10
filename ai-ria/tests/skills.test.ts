import { describe, expect, it } from "vitest";
import path from "node:path";
import { promises as fs } from "node:fs";
import { listSkills, runSkill } from "../src/skills/registry.js";

const DEMO = path.join(__dirname, "..", "examples", "demo-app");

describe("skills registry (v0.3)", () => {
  it("exposes four skills with input/steps/checks/output", () => {
    const skills = listSkills();
    expect(skills.map((s) => s.name).sort()).toEqual(["code-review", "compress", "security-review", "ui-review"]);
    for (const s of skills) {
      expect(s.input.length).toBeGreaterThan(0);
      expect(s.steps.length).toBeGreaterThan(0);
      expect(s.checks.length).toBeGreaterThan(0);
      expect(s.output.length).toBeGreaterThan(0);
    }
  });

  it("rejects unknown skills", async () => {
    await expect(runSkill("nope", DEMO)).rejects.toThrow(/Unknown skill/);
  });

  it("security-review fails on the insecure demo-app with evidence", async () => {
    const result = await runSkill("security-review", DEMO);
    expect(result.passed).toBe(false);
    expect(result.evidence.length).toBeGreaterThan(0);
    const report = await fs.readFile(path.join(DEMO, ".ria", "SKILL_security-review.md"), "utf8");
    expect(report).toContain("Skill Report: security-review");
  });

  it("code-review finds the TODO marker in demo-app", async () => {
    const result = await runSkill("code-review", DEMO);
    const todoCheck = result.checks.find((c) => c.name === "no-stale-todos");
    expect(todoCheck?.passed).toBe(false);
  });

  it("compress skill writes the context pack", async () => {
    const result = await runSkill("compress", DEMO);
    expect(result.passed).toBe(true);
    const pack = await fs.readFile(path.join(DEMO, ".ria", "context-pack.md"), "utf8");
    expect(pack).toContain("Context Pack");
  });
});
