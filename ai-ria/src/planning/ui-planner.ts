import { promises as fs } from "node:fs";
import path from "node:path";
import { writeRiaFile } from "../core/paths.js";
import { estimateTokens } from "../compression/tokenizer.js";
import { AGENT_PROFILES, getProfile } from "../tokens/token-limits.js";
import { recordPackGeneration } from "../tokens/token-ledger.js";
import { matchTemplate, type ComponentSpec, type ProjectTemplate } from "./templates.js";
import { inferProject, specsFor, type ExistingComponent, type ProjectInference } from "./inference.js";
import { scanRepo } from "../repo/scanner.js";
import { analyzeDesign } from "../design/analyzer.js";
import type { DesignReport, RepoMap } from "../core/types.js";

export interface UiPlan {
  goal: string;
  generatedAt: string;
  projectType: string;
  style: string;
  description: string;
  pages: string[];
  components: ComponentSpec[];
  /** Components the repository already has — reuse these instead of rebuilding. */
  existingComponents: ExistingComponent[];
  palette: { name: string; value: string }[];
  agents: {
    name: string;
    role: string;
    pack: string;
    packBudget: number;
    tokenLimit: number;
    order: number;
  }[];
  securityFlows: string[];
  /** Where each part of the plan came from, so it can be audited. */
  sources: {
    projectType: string;
    pages: "repository routes" | "template";
    components: "repository" | "template" | "repository + template";
    palette: "project design tokens" | "template";
    securityFlows: "repository evidence" | "template" | "repository evidence + template";
  };
  /** Human-readable detection notes. */
  signals: string[];
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

function pickAgents(securityFlows: string[]): UiPlan["agents"] {
  const names = [
    { name: "visual-agent", role: "Build UI from the visual pack and design rules", pack: "VISUAL_CONTEXT.md" },
    { name: "claude", role: "Implement components, wiring, and logic (code agent)", pack: "CLAUDE_CONTEXT.md" },
  ];
  if (securityFlows.length) {
    names.push({ name: "security-agent", role: `Review: ${securityFlows.join("; ")}`, pack: "SECURITY_CONTEXT.md" });
  }
  names.push({ name: "compact", role: "Documentation and final summary pass", pack: "COMPACT_CONTEXT.md" });
  return names.map((a, i) => {
    const p = getProfile(a.name);
    return { ...a, packBudget: p.packBudget, tokenLimit: p.tokenLimit, order: i + 1 };
  });
}

export interface BuildPlanOptions {
  /** Reuse an already-built map/report instead of rescanning the project. */
  map?: RepoMap;
  design?: DesignReport;
}

/**
 * Topics used to fold "Authentication" (template) into "Authentication and
 * session handling" (evidence) instead of listing both.
 */
const FLOW_TOPICS: [RegExp, string][] = [
  // Prefix matching on purpose: "Authentication" and "Auth" are one topic.
  [/\b(auth|login|session|2fa|sign[- ]?in)/i, "auth"],
  [/\b(payment|checkout|pci|billing|transaction|invoic)/i, "payments"],
  [/\b(upload|attachment|media)/i, "uploads"],
  [/\b(api[- ]?key|token|secret|credential)/i, "secrets"],
  [/\b(audit|trail)/i, "audit"],
  [/\b(role|rbac|access control|permission|admin)/i, "access"],
  [/\b(privacy|personal data|pii|grade|encryption)/i, "data"],
  [/\b(spam|bot|captcha|rate limit)/i, "abuse"],
];

function topicOf(flow: string): string {
  return FLOW_TOPICS.find(([pattern]) => pattern.test(flow))?.[1] ?? flow.toLowerCase();
}

/** Evidence-backed flows win their topic; template flows only fill new topics. */
function mergeFlows(evidence: string[], template: string[]): string[] {
  const taken = new Set(evidence.map(topicOf));
  const out = [...evidence];
  for (const flow of template) {
    const topic = topicOf(flow);
    if (taken.has(topic)) continue;
    taken.add(topic);
    out.push(flow);
  }
  return out;
}

/** Merge repository evidence with the template, evidence first. */
function mergePlan(template: ProjectTemplate, inference: ProjectInference) {
  const pages = inference.pages.length ? inference.pages.map((p) => p.value) : template.pages;

  // Specify the component kinds the repo already uses, then top up from the
  // template with kinds the project plausibly still needs.
  const fromRepo = specsFor(inference.componentKinds);
  const fromTemplate = specsFor(template.components).filter((s) => !fromRepo.some((r) => r.name === s.name));
  const components = inference.greenfield ? specsFor(template.components) : [...fromRepo, ...fromTemplate];

  const palette = inference.palette.length ? inference.palette.map((p) => p.value) : template.palette;

  const inferredFlows = inference.securityFlows.map((f) => f.value);
  const securityFlows = inferredFlows.length
    ? mergeFlows(inferredFlows, template.securityFlows)
    : template.securityFlows;

  return { pages, components, palette, securityFlows, fromRepoCount: fromRepo.length, inferredFlowCount: inferredFlows.length };
}

/**
 * Produce the full UI/UX plan.
 *
 * For an existing repository the plan is built from what is actually there —
 * routes become pages, component files become components to reuse, CSS custom
 * properties become the palette, and dependencies decide which flows need a
 * security review. The keyword template only fills the gaps, and carries the
 * whole plan for a greenfield project.
 */
export async function buildUiPlan(root: string, goal: string, options: BuildPlanOptions = {}): Promise<UiPlan> {
  const description = await readProjectDescription(root);
  const match = matchTemplate(goal, description);
  const template = match.template;

  const map = options.map ?? (await scanRepo(root).catch(() => null));
  const design = options.design ?? (map ? await analyzeDesign(root, map).catch(() => undefined) : undefined);
  const inference = map
    ? inferProject(map, design)
    : { greenfield: true, pages: [], existingComponents: [], componentKinds: [], palette: [], securityFlows: [], signals: ["Project could not be scanned — planning from the template"] };

  const merged = mergePlan(template, inference);
  const typeSource = match.confidence === "fallback"
    ? "no keyword matched — generic template"
    : `matched ${match.matched.slice(0, 5).join(", ")} (${match.confidence})`;

  return {
    goal,
    generatedAt: new Date().toISOString(),
    projectType: template.type,
    style: template.style,
    description: description.slice(0, 400),
    pages: merged.pages,
    components: merged.components,
    existingComponents: inference.existingComponents,
    palette: merged.palette,
    agents: pickAgents(merged.securityFlows),
    securityFlows: merged.securityFlows,
    sources: {
      projectType: typeSource,
      pages: inference.pages.length ? "repository routes" : "template",
      components: inference.greenfield || !merged.fromRepoCount
        ? "template"
        : merged.fromRepoCount === merged.components.length ? "repository" : "repository + template",
      palette: inference.palette.length ? "project design tokens" : "template",
      securityFlows: !merged.inferredFlowCount
        ? "template"
        : merged.inferredFlowCount === merged.securityFlows.length ? "repository evidence" : "repository evidence + template",
    },
    signals: inference.signals,
  };
}

/** .ria/design/UI_PLAN.md - pages, components, agents, security flows. */
export function uiPlanToMarkdown(plan: UiPlan): string {
  const lines = [
    "# UI Plan",
    "",
    `Goal: **${plan.goal}**`,
    `Project type: **${plan.projectType}** (${plan.sources.projectType}) | Style: ${plan.style}`,
    `Generated: ${plan.generatedAt}`,
    "",
    "## How This Plan Was Derived",
    "",
    `- pages: ${plan.sources.pages}`,
    `- components: ${plan.sources.components}`,
    `- palette: ${plan.sources.palette}`,
    `- security flows: ${plan.sources.securityFlows}`,
    ...plan.signals.map((s) => `- ${s}`),
    "",
    `## Pages (${plan.sources.pages})`,
    "",
    ...plan.pages.map((p) => `- ${p}`),
    "",
  ];
  if (plan.existingComponents.length) {
    lines.push(
      "## Existing Components — Reuse, Do Not Rebuild",
      "",
      ...plan.existingComponents.slice(0, 40).map((c) => `- \`${c.name}\` — ${c.file}${c.kind ? ` (${c.kind})` : ""}`),
      plan.existingComponents.length > 40 ? `- …and ${plan.existingComponents.length - 40} more` : "",
      "",
    );
  }
  lines.push("## Component Rules", "");
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
  return [
    `# DESIGN.md - ${plan.goal}`,
    "",
    `Style direction: ${plan.style}`,
    "",
    `## Colors (${plan.sources.palette})`,
    "",
    ...plan.palette.map((c) => `- ${c.name}: ${c.value}`),
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
  const lines = [
    "# VISUAL AGENT PACK",
    "",
    `Goal: ${plan.goal}`,
    `Style: ${plan.style}`,
    "",
    "Build the UI below. Use the tokens and rules exactly; do not invent new colors or spacing.",
    "",
    `## Tokens (${plan.sources.palette})`,
    "",
    ...plan.palette.map((c) => `- --${c.name}: ${c.value}`),
    "- font: Inter, system-ui | base 16px | radius 12/8px | spacing scale 4px",
    "",
    `## Build Order (${plan.sources.pages})`,
    "",
    ...plan.pages.map((p, i) => `${i + 1}. ${p}`),
    "",
  ];
  if (plan.existingComponents.length) {
    const shown = plan.existingComponents.slice(0, 25);
    lines.push(
      "## Reuse These — They Already Exist",
      "",
      ...shown.map((c) => `- \`${c.name}\` (${c.file})`),
      plan.existingComponents.length > shown.length ? `- …and ${plan.existingComponents.length - shown.length} more` : "",
      "",
    );
  }
  lines.push("## Components", "");
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
    existingComponents: plan.existingComponents,
    palette: plan.palette,
    sources: plan.sources,
    signals: plan.signals,
  }, null, 2);
}

export interface PlanUiResult {
  plan: UiPlan;
  files: string[];
}

/** `ria plan-ui` - write the full planning output set and record token usage. */
export async function writeUiPlan(root: string, goal: string, options: BuildPlanOptions = {}): Promise<PlanUiResult> {
  const plan = await buildUiPlan(root, goal, options);
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
