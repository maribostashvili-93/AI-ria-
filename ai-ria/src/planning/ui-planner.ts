import { promises as fs } from "node:fs";
import path from "node:path";
import { writeRiaFile } from "../core/paths.js";
import { estimateTokens } from "../compression/tokenizer.js";
import { AGENT_PROFILES, getProfile } from "../tokens/token-limits.js";
import { recordPackGeneration } from "../tokens/token-ledger.js";
import { COMPONENT_LIBRARY, detectTemplate, type ComponentSpec } from "./templates.js";

export interface UiPlan {
  goal: string;
  generatedAt: string;
  projectType: string;
  style: string;
  description: string;
  pages: string[];
  components: ComponentSpec[];
  agents: {
    name: string;
    role: string;
    pack: string;
    packBudget: number;
    tokenLimit: number;
    order: number;
  }[];
  securityFlows: string[];
}

async function readProjectDescription(root: string): Promise<string> {
  const parts: string[] = [];
  try {
    const pkg = JSON.parse(await fs.readFile(path.join(path.resolve(root), "package.json"), "utf8"));
    if (pkg.description) parts.push(String(pkg.description));
    if (pkg.name) parts.push(String(pkg.name));
  } catch {
    // no package.json
  }
  try {
    const readme = await fs.readFile(path.join(path.resolve(root), "README.md"), "utf8");
    parts.push(readme.split("\n").slice(0, 30).join("\n"));
  } catch {
    // no README
  }
  return parts.join("\n");
}

function pickAgents(template: ReturnType<typeof detectTemplate>): UiPlan["agents"] {
  const names = [
    { name: "visual-agent", role: "Build UI from the visual pack and design rules", pack: "VISUAL_AGENT_PACK.md" },
    { name: "claude", role: "Implement components, wiring, and logic (code agent)", pack: "CLAUDE_CONTEXT.md" },
  ];
  if (template.securityFlows.length) {
    names.push({ name: "security-agent", role: `Review: ${template.securityFlows.join("; ")}`, pack: "CODEX_CONTEXT.md" });
  }
  names.push({ name: "compact", role: "Documentation and final summary pass", pack: "COMPACT_CONTEXT.md" });
  return names.map((a, i) => {
    const p = getProfile(a.name);
    return { ...a, packBudget: p.packBudget, tokenLimit: p.tokenLimit, order: i + 1 };
  });
}

/** Analyze goal + project description and produce the full UI/UX plan. */
export async function buildUiPlan(root: string, goal: string): Promise<UiPlan> {
  const description = await readProjectDescription(root);
  const template = detectTemplate(`${goal}\n${description}`);
  const components = template.components.map((key) => COMPONENT_LIBRARY[key]).filter(Boolean);
  return {
    goal,
    generatedAt: new Date().toISOString(),
    projectType: template.type,
    style: template.style,
    description: description.slice(0, 400),
    pages: template.pages,
    components,
    agents: pickAgents(template),
    securityFlows: template.securityFlows,
  };
}

function templateOf(plan: UiPlan) {
  return detectTemplate(`${plan.goal}\n${plan.description}`);
}

/** .ria/design/UI_PLAN.md - pages, components, agents, security flows. */
export function uiPlanToMarkdown(plan: UiPlan): string {
  const lines = [
    "# UI Plan",
    "",
    `Goal: **${plan.goal}**`,
    `Project type: **${plan.projectType}** | Style: ${plan.style}`,
    `Generated: ${plan.generatedAt}`,
    "",
    "## Pages",
    "",
    ...plan.pages.map((p) => `- ${p}`),
    "",
    "## Components",
    "",
  ];
  for (const c of plan.components) {
    lines.push(`### ${c.name}`, "", `Purpose: ${c.purpose}`, "");
    lines.push(...c.rules.map((r) => `- rule: ${r}`));
    lines.push(...c.hints.map((h) => `- hint: ${h}`));
    lines.push(`- classes: \`${c.tailwind}\``);
    if (c.security) lines.push(`- security: ${c.security}`);
    lines.push("");
  }
  lines.push("## Agents", "", "| # | Agent | Role | Pack | Pack budget | Token limit |", "|---|---|---|---|---|---|");
  for (const a of plan.agents) lines.push(`| ${a.order} | ${a.name} | ${a.role} | ${a.pack} | ${a.packBudget} | ${a.tokenLimit} |`);
  lines.push("", "## Security-Sensitive Flows", "", ...plan.securityFlows.map((s) => `- ${s}`), "");
  return lines.join("\n");
}

/** .ria/design/DESIGN.md - design.md-style structured design system for the plan. */
export function designMdFromPlan(plan: UiPlan): string {
  const t = templateOf(plan);
  return [
    `# DESIGN.md - ${plan.goal}`,
    "",
    `Style direction: ${plan.style}`,
    "",
    "## Colors",
    "",
    ...t.palette.map((c) => `- ${c.name}: ${c.value}`),
    "",
    "## Typography",
    "",
    "- font-family: Inter, system-ui, sans-serif",
    "- headings: 600 weight, tight tracking",
    "- body: 16px / 1.5",
    "- small: 14px for tables and meta",
    "",
    "## Spacing",
    "",
    "- scale: 4px base (4, 8, 12, 16, 24, 32, 48, 64)",
    "- card padding: 16-24px",
    "- section gap: 32-48px",
    "- radius: 12px cards, 8px inputs, 9999px pills",
    "",
    "## Components",
    "",
    ...plan.components.map((c) => `- ${c.name}: ${c.purpose}`),
    "",
    "## Layouts",
    "",
    ...plan.pages.map((p) => `- ${p}`),
    "",
    "## Accessibility",
    "",
    "- Contrast AA minimum (4.5:1 body text)",
    "- Every interactive element keyboard-reachable, visible focus ring",
    "- Form fields always have labels; progress bars have aria-valuenow",
    "- Respect prefers-reduced-motion",
    "",
    "## Do Not Change",
    "",
    "- The primary color and spacing scale without a design review",
    "- Auth and payment flows without a security review",
    "- Component names - they map 1:1 to code files",
    "",
  ].join("\n");
}

/** .ria/agent-pack/VISUAL_AGENT_PACK.md - compact, agent-ready visual brief. */
export function visualPackFromPlan(plan: UiPlan): string {
  const t = templateOf(plan);
  const lines = [
    "# VISUAL AGENT PACK",
    "",
    `Goal: ${plan.goal}`,
    `Style: ${plan.style}`,
    "",
    "Build the UI below. Use the tokens and rules exactly; do not invent new colors or spacing.",
    "",
    "## Tokens",
    "",
    ...t.palette.map((c) => `- --${c.name}: ${c.value}`),
    "- font: Inter, system-ui | base 16px | radius 12/8px | spacing scale 4px",
    "",
    "## Build Order",
    "",
    ...plan.pages.map((p, i) => `${i + 1}. ${p}`),
    "",
    "## Components",
    "",
  ];
  for (const c of plan.components) {
    lines.push(`### ${c.name}`, `- ${c.purpose}`, `- ${c.rules.join("; ")}`, `- classes: \`${c.tailwind}\``);
    if (c.security) lines.push(`- security: ${c.security}`);
    lines.push("");
  }
  lines.push("## Do Not Change", "", "- Primary color, spacing scale, component names", "");
  return lines.join("\n");
}

/** .ria/orchestration/agent-routing.json */
export function routingFromPlan(plan: UiPlan): string {
  return JSON.stringify({
    goal: plan.goal,
    generatedAt: plan.generatedAt,
    projectType: plan.projectType,
    style: plan.style,
    agents: plan.agents,
    securityFlows: plan.securityFlows,
    pages: plan.pages,
    components: plan.components.map((c) => c.name),
  }, null, 2);
}

export interface PlanUiResult {
  plan: UiPlan;
  files: string[];
}

/** `ria plan-ui` - write the full planning output set and record token usage. */
export async function writeUiPlan(root: string, goal: string): Promise<PlanUiResult> {
  const plan = await buildUiPlan(root, goal);
  const uiPlanMd = uiPlanToMarkdown(plan);
  const designMd = designMdFromPlan(plan);
  const visualPack = visualPackFromPlan(plan);
  const files = [
    await writeRiaFile(root, "design/UI_PLAN.md", uiPlanMd),
    await writeRiaFile(root, "design/DESIGN.md", designMd),
    await writeRiaFile(root, "agent-pack/VISUAL_AGENT_PACK.md", visualPack),
    await writeRiaFile(root, "orchestration/agent-routing.json", routingFromPlan(plan)),
  ];
  const { buildDesignPack } = await import("../design/designmd.js");
  await buildDesignPack(root);
  files.push(path.join(path.resolve(root), ".ria", "design", "DESIGN_PACK.md"));

  const rawTokens = estimateTokens([uiPlanMd, designMd, plan.description].join("\n"));
  await recordPackGeneration(root, {
    agent: "visual-agent",
    task: plan.goal,
    pack: "VISUAL_AGENT_PACK.md",
    rawTokens: Math.max(rawTokens, estimateTokens(visualPack)),
    compressedTokens: estimateTokens(visualPack),
  });
  return { plan, files };
}

/** `ria design suggest` - style direction + DESIGN.md + visual pack only. */
export async function suggestDesign(root: string, goal: string): Promise<{ plan: UiPlan; files: string[]; suggestion: string }> {
  const plan = await buildUiPlan(root, goal);
  const files = [
    await writeRiaFile(root, "design/DESIGN.md", designMdFromPlan(plan)),
    await writeRiaFile(root, "agent-pack/VISUAL_AGENT_PACK.md", visualPackFromPlan(plan)),
  ];
  const { buildDesignPack } = await import("../design/designmd.js");
  await buildDesignPack(root);
  files.push(path.join(path.resolve(root), ".ria", "design", "DESIGN_PACK.md"));
  const suggestion = [
    `Project type: ${plan.projectType}`,
    `Style: ${plan.style}`,
    `Pages: ${plan.pages.join(", ")}`,
    `Components: ${plan.components.map((c) => c.name).join(", ")}`,
  ].join("\n");
  return { plan, files, suggestion };
}

/** Per-agent token budget table for `ria orchestrate` output. */
export function agentBudgetSummary(plan: UiPlan): string {
  return plan.agents
    .map((a) => `  ${a.order}. ${a.name.padEnd(16)} pack ${String(a.packBudget).padStart(6)} tokens | limit ${String(a.tokenLimit).padStart(7)} | ${a.pack}`)
    .join("\n");
}

export { AGENT_PROFILES };
