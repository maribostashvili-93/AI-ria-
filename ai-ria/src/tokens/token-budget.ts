import { readRiaFile, writeRiaFile } from "../core/paths.js";
import { AgentProfile, getProfile } from "./token-limits.js";

const BUDGETS_FILE = "tokens/budgets.json";

export type BudgetOverrides = Record<string, { limit: number }>;

/** Load per-project budget overrides (.ria/tokens/budgets.json). */
export async function loadBudgets(root: string): Promise<BudgetOverrides> {
  const raw = await readRiaFile(root, BUDGETS_FILE);
  if (!raw) return {};
  try {
    return JSON.parse(raw) as BudgetOverrides;
  } catch {
    return {};
  }
}

/** Set a custom token limit for an agent in this project. */
export async function setBudget(root: string, agent: string, limit: number): Promise<BudgetOverrides> {
  const budgets = await loadBudgets(root);
  budgets[agent.toLowerCase()] = { limit };
  await writeRiaFile(root, BUDGETS_FILE, JSON.stringify(budgets, null, 2));
  return budgets;
}

/** Resolve the effective profile for an agent in this project (defaults + overrides). */
export async function resolveProfile(root: string, agent?: string): Promise<AgentProfile> {
  const budgets = await loadBudgets(root);
  const override = budgets[(agent ?? "").toLowerCase()]?.limit;
  return getProfile(agent, override);
}
