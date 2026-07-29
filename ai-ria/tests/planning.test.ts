import { describe, it, expect, beforeAll } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { detectTemplate, matchTemplate, COMPONENT_LIBRARY } from "../src/planning/templates.js";
import { inferProject, inferStack, collectDependencies, routeToPageName } from "../src/planning/inference.js";
import { buildUiPlan, writeUiPlan, suggestDesign, designMdFromPlan, visualPackFromPlan } from "../src/planning/ui-planner.js";
import { scanRepo } from "../src/repo/scanner.js";
import { analyzeDesign } from "../src/design/analyzer.js";

let root: string;
/** A repository with real routes, components, tokens and dependencies. */
let realProject: string;

beforeAll(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "ria-plan-"));
  await fs.writeFile(
    path.join(root, "package.json"),
    JSON.stringify({ name: "lms-platform", description: "LMS platform for students, mentors and admin users" }),
    "utf8",
  );

  realProject = await fs.mkdtemp(path.join(os.tmpdir(), "ria-plan-real-"));
  await fs.writeFile(
    path.join(realProject, "package.json"),
    JSON.stringify({
      name: "booking-app",
      dependencies: { next: "14.0.0", react: "18.0.0", stripe: "14.0.0", "next-auth": "4.0.0", "@prisma/client": "5.0.0" },
    }),
    "utf8",
  );
  for (const dir of ["app/rooms", "app/checkout", "src/components"]) {
    await fs.mkdir(path.join(realProject, dir), { recursive: true });
  }
  await fs.writeFile(path.join(realProject, "app/page.tsx"), "export default function Home() { return null; }", "utf8");
  await fs.writeFile(path.join(realProject, "app/rooms/page.tsx"), "export default function Rooms() { return null; }", "utf8");
  await fs.writeFile(path.join(realProject, "app/checkout/page.tsx"), "export default function Checkout() { return null; }", "utf8");
  await fs.writeFile(path.join(realProject, "src/components/RoomCard.tsx"), "export const RoomCard = () => null;", "utf8");
  await fs.writeFile(path.join(realProject, "src/components/SiteNavbar.tsx"), "export const SiteNavbar = () => null;", "utf8");
  await fs.writeFile(path.join(realProject, "src/components/BookingModal.tsx"), "export const BookingModal = () => null;", "utf8");
  await fs.writeFile(
    path.join(realProject, "src/styles.css"),
    ":root { --color-primary: #FF5A5F; --color-ink: #222222; --spacing-md: 12px; }",
    "utf8",
  );

  // A nested workspace manifest — the stack often lives below the root.
  await fs.mkdir(path.join(realProject, "frontend"), { recursive: true });
  await fs.writeFile(
    path.join(realProject, "frontend/package.json"),
    JSON.stringify({
      name: "booking-web",
      dependencies: { zustand: "4.0.0", tailwindcss: "3.4.0", "next-intl": "3.0.0", "react-hook-form": "7.0.0" },
      devDependencies: { vitest: "2.0.0" },
    }),
    "utf8",
  );

  // A fixture app that must never be mistaken for the project itself.
  await fs.mkdir(path.join(realProject, "test/fixtures/legacy-app/src/components"), { recursive: true });
  await fs.writeFile(
    path.join(realProject, "test/fixtures/legacy-app/package.json"),
    JSON.stringify({ name: "legacy", dependencies: { redux: "4.0.0", bootstrap: "5.0.0" } }),
    "utf8",
  );
  await fs.writeFile(
    path.join(realProject, "test/fixtures/legacy-app/src/components/LegacyCard.tsx"),
    "export const LegacyCard = () => null;",
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

  it("weighs the goal above the project description", () => {
    // A long README mentioning "dashboard"/"platform" must not outvote the goal.
    const description = "An internal analytics platform. The dashboard shows metrics. Our SaaS dashboard is a CRM.";
    expect(detectTemplate("build the online shop cart and checkout", description).type).toBe("ecommerce");
    // With no goal signal the description still decides.
    expect(detectTemplate("make it nicer", description).type).toBe("saas-dashboard");
  });

  it("matches whole words, not substrings", () => {
    // "crm" must not match inside "crumbs"; "shop" must not match "workshop".
    expect(matchTemplate("bake crumbs in a workshop").confidence).toBe("fallback");
    expect(matchTemplate("build a crm").template.type).toBe("saas-dashboard");
  });

  it("reports what matched and how confident it is", () => {
    const strong = matchTemplate("build an ecommerce checkout");
    expect(strong.confidence).toBe("strong");
    expect(strong.matched).toContain("checkout");
    expect(matchTemplate("something unusual").confidence).toBe("fallback");
  });
});

describe("project inference (evidence over templates)", () => {
  it("turns routes into page names", () => {
    expect(routeToPageName("/")).toBe("Home");
    expect(routeToPageName("/rooms")).toBe("Rooms");
    expect(routeToPageName("/rooms/[id]")).toBe("Rooms detail");
    expect(routeToPageName("/user-settings")).toBe("User settings");
  });

  it("reads pages, components, palette and security flows out of the repository", async () => {
    const map = await scanRepo(realProject);
    const design = await analyzeDesign(realProject, map);
    const inference = inferProject(map, design);

    expect(inference.greenfield).toBe(false);
    expect(inference.pages.map((p) => p.value)).toContain("Rooms");
    expect(inference.pages.every((p) => p.source.startsWith("route"))).toBe(true);

    const names = inference.existingComponents.map((c) => c.name);
    expect(names).toContain("RoomCard");
    expect(names).toContain("SiteNavbar");
    expect(inference.componentKinds).toContain("navbar");
    expect(inference.componentKinds).toContain("modal");

    expect(inference.palette.map((p) => p.value.value)).toContain("#FF5A5F");
    // --spacing-md is not a color and must not enter the palette
    expect(inference.palette.some((p) => p.value.name === "spacing-md")).toBe(false);

    const flows = inference.securityFlows;
    expect(flows.some((f) => /Payments/i.test(f.value) && f.source.includes("stripe"))).toBe(true);
    expect(flows.some((f) => /Authentication/i.test(f.value))).toBe(true);
  });

  it("reads dependencies from nested manifests but never from fixtures", async () => {
    const map = await scanRepo(realProject);
    const { deps, manifests } = await collectDependencies(realProject, map);
    expect(deps).toContain("next-auth");   // root manifest
    expect(deps).toContain("zustand");     // frontend/package.json
    expect(deps).toContain("tailwindcss");
    expect(deps).not.toContain("redux");   // test/fixtures/legacy-app
    expect(deps).not.toContain("bootstrap");
    expect(manifests.some((m) => m.includes("fixtures"))).toBe(false);
  });

  it("turns the detected stack into rules an agent must follow", async () => {
    const map = await scanRepo(realProject);
    const { deps } = await collectDependencies(realProject, map);
    const stack = inferStack(map, deps);
    const byName = Object.fromEntries(stack.map((s) => [s.name, s]));

    expect(byName["Zustand"].category).toBe("state");
    expect(byName["Tailwind CSS"].rule).toMatch(/utility classes/i);
    expect(byName["next-intl"].rule).toMatch(/never hardcode copy/i);
    expect(byName["Vitest"].category).toBe("testing");
    expect(byName["React Hook Form"].category).toBe("forms");
    // every signal carries the evidence that produced it
    expect(stack.every((s) => /dependency|file/.test(s.evidence))).toBe(true);
    // the fixture app's Redux/Bootstrap must not appear
    expect(stack.some((s) => /Redux|Bootstrap/.test(s.name))).toBe(false);
  });

  it("ignores components that live in fixtures", async () => {
    const map = await scanRepo(realProject);
    const inference = inferProject(map);
    expect(inference.existingComponents.map((c) => c.name)).toContain("RoomCard");
    expect(inference.existingComponents.map((c) => c.name)).not.toContain("LegacyCard");
  });

  it("falls back to the template for a project with no code", async () => {
    const empty = await fs.mkdtemp(path.join(os.tmpdir(), "ria-plan-empty-"));
    const inference = inferProject(await scanRepo(empty));
    expect(inference.greenfield).toBe(true);
    expect(inference.pages).toHaveLength(0);
  });
});

describe("plan built from repository evidence", () => {
  it("prefers real routes, components and tokens over the template", async () => {
    const plan = await buildUiPlan(realProject, "Build the room booking UI");

    expect(plan.sources.pages).toBe("repository routes");
    expect(plan.pages).toContain("Rooms");
    expect(plan.pages).toContain("Checkout");

    expect(plan.sources.palette).toBe("project design tokens");
    expect(plan.palette.some((c) => c.value === "#FF5A5F")).toBe(true);
    expect(designMdFromPlan(plan)).toContain("#FF5A5F");

    expect(plan.existingComponents.map((c) => c.name)).toContain("RoomCard");
    expect(visualPackFromPlan(plan)).toContain("Reuse These");

    expect(plan.sources.securityFlows).toContain("repository evidence");
    expect(plan.securityFlows.some((f) => /Payments/i.test(f))).toBe(true);
  });

  it("puts UI stack rules in the visual pack and leaves backend rules out", async () => {
    const plan = await buildUiPlan(realProject, "Build the room booking UI");
    const pack = visualPackFromPlan(plan);

    expect(plan.stack.map((s) => s.name)).toContain("Prisma");
    expect(pack).toContain("Stack Rules");
    expect(pack).toMatch(/Tailwind CSS:/);
    expect(pack).toMatch(/next-intl:/);
    // Prisma is a data-layer concern — it must not spend the visual agent's budget
    expect(pack).not.toContain("Prisma");
    // and the pack stays well inside the visual-agent budget
    expect(pack.length / 4).toBeLessThan(3000);
  });

  it("lists stack choices as things not to change in DESIGN.md", async () => {
    const plan = await buildUiPlan(realProject, "Build the room booking UI");
    const md = designMdFromPlan(plan);
    expect(md).toContain("## Do Not Change");
    expect(md).toMatch(/The styling choice: Tailwind CSS/);
  });

  it("does not list the same security topic twice", async () => {
    const plan = await buildUiPlan(realProject, "Build the room booking checkout");
    const authFlows = plan.securityFlows.filter((f) => /^auth/i.test(f));
    expect(authFlows.length).toBeLessThanOrEqual(1);
  });

  it("still plans a greenfield project from the template", async () => {
    const plan = await buildUiPlan(root, "Build dashboard UI for LMS platform");
    expect(plan.sources.pages).toBe("template");
    expect(plan.sources.palette).toBe("template");
    expect(plan.pages).toContain("Dashboard");
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
