/**
 * Agent Token Profiles (v0.1 Token Accounting Engine).
 * Default limits and pack preferences per agent; overridable via
 * `ria tokens budget <project> --agent <name> --limit <n>` (.ria/tokens/budgets.json).
 */
export type CompressionLevel = "light" | "standard" | "aggressive";

export interface AgentProfile {
  name: string;
  /** total context-window budget the agent works against */
  tokenLimit: number;
  /** preferred size of a single pack handed to this agent */
  packBudget: number;
  compressionLevel: CompressionLevel;
  include: string[];
  exclude: string[];
}

export const AGENT_PROFILES: Record<string, AgentProfile> = {
  claude: {
    name: "claude",
    tokenLimit: 200_000,
    packBudget: 12_000,
    compressionLevel: "standard",
    include: ["context", "memory", "handoff", "design rules", "security warnings"],
    exclude: ["raw file dumps", "lockfiles", "binary assets"],
  },
  cursor: {
    name: "cursor",
    tokenLimit: 120_000,
    packBudget: 8_000,
    compressionLevel: "standard",
    include: ["context", "memory", "handoff", "rules (.cursorrules style)"],
    exclude: ["long excerpts", "token tables"],
  },
  codex: {
    name: "codex",
    tokenLimit: 100_000,
    packBudget: 6_000,
    compressionLevel: "aggressive",
    include: ["context summary", "handoff", "constraints"],
    exclude: ["design token tables", "long memory history"],
  },
  "visual-agent": {
    name: "visual-agent",
    tokenLimit: 120_000,
    packBudget: 10_000,
    compressionLevel: "standard",
    include: ["design pack", "design memory", "figma tokens", "component map"],
    exclude: ["security report", "dependency lists"],
  },
  "security-agent": {
    name: "security-agent",
    tokenLimit: 100_000,
    packBudget: 6_000,
    compressionLevel: "aggressive",
    include: ["security report", "policy rules", "changed files"],
    exclude: ["design tokens", "figma data"],
  },
  compact: {
    name: "compact",
    tokenLimit: 50_000,
    packBudget: 2_500,
    compressionLevel: "aggressive",
    include: ["summary", "handoff", "warnings"],
    exclude: ["everything else"],
  },
};

export const DEFAULT_PROFILE: AgentProfile = {
  name: "any",
  tokenLimit: 150_000,
  packBudget: 12_000,
  compressionLevel: "standard",
  include: ["context", "memory", "handoff"],
  exclude: ["raw file dumps"],
};

/** Resolve a profile by agent name (case-insensitive), with an optional limit override. */
export function getProfile(agent?: string, limitOverride?: number): AgentProfile {
  const base = AGENT_PROFILES[(agent ?? "").toLowerCase()] ?? { ...DEFAULT_PROFILE, name: agent || "any" };
  return limitOverride && limitOverride > 0 ? { ...base, tokenLimit: limitOverride } : base;
}
