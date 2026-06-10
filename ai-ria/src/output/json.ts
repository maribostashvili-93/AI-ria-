/** Render any AI RIA result as machine-readable JSON for agents. */
export function toJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}
