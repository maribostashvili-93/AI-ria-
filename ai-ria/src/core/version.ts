import { createRequire } from "node:module";

/**
 * Single source of truth for the version number.
 *
 * Read from the package manifest so `ria --version`, `summary.json` and the
 * Studio "About" page can never drift apart. Resolves the same from `src/`
 * (tsx) and from `dist/` (built CLI).
 */
export const VERSION: string = (createRequire(import.meta.url)("../../package.json") as { version?: string }).version ?? "0.0.0";
