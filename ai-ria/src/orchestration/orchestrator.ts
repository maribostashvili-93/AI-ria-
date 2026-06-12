import { writeRiaFile } from "../core/paths.js";
import { scanRepo } from "../repo/scanner.js";
import { scanSecurity } from "../security/scanner.js";
import { buildContextPackV2, contextPackV2ToMarkdown } from "../compression/context-pack-builder.js";
import { buildAgentPack } from "../agentpack/agent-pack.js";
import { buildProviderPack, Provider, ProviderPackResult } from "../exports/provider-packs.js";
import { writeUiPlan, UiPlan } from "../planning/ui-planner.js";
import { writeMemoryGraph } from "../memory/memory-graph.js";
import { recordPackGeneration } from "../tokens/token-ledger.js";
import { writeTokenReport } from "../tokens/token-report.js";
import { securityToMarkdown } from "../output/markdown.js";
import { toJson } from "../output/json.js";

/** Plan agents map onto provider packs; unknown agents fall back to compact. */
const AGENT_TO_PROVIDER: Record<string, Provider> = {
  claude: "claude",
  cursor: "cursor",
  codex: "codex",
  compact: "compact",
  "visual-agent": "visual",
  "security-agent": "security",
};

export interface OrchestrationResult {
  plan: UiPlan;
  routedProviders: Provider[];
  packs: ProviderPackResult[];
  securityFindings: number;
  contextTokens: { raw: number; compressed: number } | null;
  files: string[];
}

/** Which provider packs the routed agents need, in plan order, deduplicated. */
export function routeProviders(plan: UiPlan): Provider[] {
  const providers = plan.agents.map((a) => AGENT_TO_PROVIDER[a.name] ?? "compact");
  return [...new Set(providers)];
}

function orchestrationToMarkdown(result: OrchestrationResult): string {
  const { plan } = result;
  const lines = [
    "# Orchestration Plan",
    "",
    `Goal: **${plan.goal}**`,
    `Project type: **${plan.projectType}** | Generated: ${plan.generatedAt}`,
    "",
    "## Agent Routing",
    "",
    "| # | Agent | Role | Pack file | Pack tokens | Budget |",
    "|---|---|---|---|---|---|",
  ];
  for (const a of plan.agents) {
    const provider = AGENT_TO_PROVIDER[a.name] ?? "compact";
    const built = result.packs.find((p) => p.provider === provider);
    lines.push(`| ${a.order} | ${a.name} | ${a.role} | \`${built?.file.split(/[\\/]/).pop() ?? a.pack}\` | ~${built?.tokens ?? "-"} | ${built?.budget ?? a.packBudget} |`);
  }
  lines.push(
    "",
    "## Run Order",
    "",
    ...plan.agents.map((a) => `${a.order}. **${a.name}** — ${a.role}`),
    "",
    "## Security-Sensitive Flows",
    "",
    ...(plan.securityFlows.length ? plan.securityFlows.map((s) => `- ${s}`) : ["- None detected for this goal."]),
    "",
    `Security findings at orchestration time: ${result.securityFindings}`,
    "",
  );
  return lines.join("\n");
}

/**
 * `ria orchestrate --goal` — plan, route agents to packs, build exactly the
 * packs the routed agents need (security pack gets a fresh scan first), and
 * leave a written orchestration plan the agents can follow.
 */
export async function orchestrate(root: string, goal: string): Promise<OrchestrationResult> {
  const { plan, files } = await writeUiPlan(root, goal);
  const routedProviders = routeProviders(plan);

  // compressed repo context (skip silently for empty projects)
  let contextTokens: OrchestrationResult["contextTokens"] = null;
  try {
    const map = await scanRepo(root);
    if (map.fileCount > 0) {
      const pack = await buildContextPackV2(root, map, 12000);
      files.push(
        await writeRiaFile(root, "context/context-pack.md", contextPackV2ToMarkdown(pack)),
        await writeRiaFile(root, "context/context-pack.json", toJson({ summary: pack.summary, files: pack.files })),
        await writeRiaFile(root, "context/token-report.json", toJson(pack.report)),
      );
      await recordPackGeneration(root, { agent: "any", task: goal, pack: "context/context-pack.md", rawTokens: pack.report.rawTokens, compressedTokens: pack.report.compressedTokens });
      contextTokens = { raw: pack.report.rawTokens, compressed: pack.report.compressedTokens };
    }
  } catch { /* empty project is fine */ }

  // the security pack reads security-report.json — refresh it when a security agent is routed
  let securityFindings = 0;
  if (routedProviders.includes("security")) {
    const report = await scanSecurity(root);
    securityFindings = report.findings.length;
    files.push(
      await writeRiaFile(root, "security-report.json", toJson(report)),
      await writeRiaFile(root, "SECURITY_REPORT.md", securityToMarkdown(report)),
    );
  }

  const { files: agentPackFiles } = await buildAgentPack(root);
  files.push(...agentPackFiles);

  const packs: ProviderPackResult[] = [];
  for (const provider of routedProviders) {
    const result = await buildProviderPack(root, provider);
    packs.push(result);
    files.push(result.file);
  }

  const { files: graphFiles } = await writeMemoryGraph(root);
  files.push(...graphFiles);

  const result: OrchestrationResult = { plan, routedProviders, packs, securityFindings, contextTokens, files };
  files.push(await writeRiaFile(root, "orchestration/ORCHESTRATION.md", orchestrationToMarkdown(result)));
  await writeTokenReport(root);
  return result;
}
