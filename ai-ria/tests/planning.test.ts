import { describe, it, expect, beforeAll } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { detectTemplate, COMPONENT_LIBRARY } from "../src/planning/templates.js";
import { buildUiPlan, writeUiPlan, suggestDesign, designMdFromPlan, visualPackFromPlan } from "../src/planning/ui-planner.js";

let root: string;

beforeAll(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "ria-plan-"));
  await fs.writeFile(
    path.join(root, "package.json"),
    JSON.stringify({ name: "lms-platform", description: "LMS platform for students, mentors and admin users" }),
    "utf8",
  );
});

describe("project type detection", () => {
  it("detects LMS from goal + description", () => {
    expect(detectTemplate("Build dashboard UI for LMS platform").type).toBe("lms");
    expect(detectTemplate("online shop with cart and checkout").type).toBe("ecommerce");
    expect(detectTemplate("fintech wallet with invoices").type).toBe("finance");
    expect(detectTemplate("something unusual").type).toBe("generic-app");
  });
});

describe("ui plan", () => {
  it("plans LMS pages, components, agents, and security flows", async () => {
    const plan = await buildUiPlan(root, "Build dashboard UI for LMS platform");
    expect(plan.projectType).toBe("lms");
    expect(plan.pages).toContain("Dashboard");
    const names = plan.components.map((c) => c.name);
    expect(names).toContain("Sidebar");
    expect(names).toContain("Course card");
    expect(names).toContain("Progress bar");
    expect(plan.agents.map((a) => a.name)).toContain("visual-agent");
    expect(plan.agents.map((a) => a.name)).toContain("security-agent");
    expect(plan.agents.every((a) => a.packBudget > 0 && a.tokenLimit > 0)).toBe(true);
    expect(plan.securityFlows.some((s) => s.includes("Role-based"))).toBe(true);
  });

  it("every planned component has purpose, rules, hints, and classes", async () => {
    const plan = await buildUiPlan(root, "LMS dashboard");
    for (const c of plan.components) {
      expect(c.purpose.length).toBeGreaterThan(5);
      expect(c.rules.length).toBeGreaterThan(0);
      expect(c.hints.length).toBeGreaterThan(0);
      expect(c.tailwind.length).toBeGreaterThan(5);
    }
    expect(COMPONENT_LIBRARY["auth-form"].security).toContain("credentials");
  });

  it("renders DESIGN.md with design.md-style sections", async () => {
    const plan = await buildUiPlan(root, "LMS dashboard");
    const md = designMdFromPlan(plan);
    for (const section of ["## Colors", "## Typography", "## Spacing", "## Components", "## Layouts", "## Accessibility", "## Do Not Change"]) {
      expect(md).toContain(section);
    }
  });

  it("keeps the visual pack compact (no huge UI dumps)", async () => {
    const plan = await buildUiPlan(root, "LMS dashboard");
    const pack = visualPackFromPlan(plan);
    expect(pack.length / 4).toBeLessThan(3000); // well under visual-agent's 10k budget
    expect(pack).toContain("Do Not Change");
  });
});

describe("plan-ui + design suggest outputs", () => {
  it("writes the full planning output set", async () => {
    const { files } = await writeUiPlan(root, "Build dashboard UI for LMS platform");
    for (const expected of ["UI_PLAN.md", "DESIGN.md", "VISUAL_AGENT_PACK.md", "agent-routing.json", "DESIGN_PACK.md"]) {
      expect(files.some((f) => f.endsWith(expected))).toBe(true);
    }
    const routing = JSON.parse(await fs.readFile(path.join(root, ".ria", "orchestration", "agent-routing.json"), "utf8"));
    expect(routing.projectType).toBe("lms");
    expect(routing.agents.length).toBeGreaterThanOrEqual(3);
    const ledger = await fs.readFile(path.join(root, ".ria", "tokens", "token-ledger.jsonl"), "utf8");
    expect(ledger).toContain("VISUAL_AGENT_PACK.md");
  });

  it("design suggest returns a style direction", async () => {
    const { suggestion } = await suggestDesign(root, "LMS dashboard");
    expect(suggestion).toContain("lms");
    expect(suggestion).toContain("Education platform");
  });
});
