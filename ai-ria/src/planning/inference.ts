import { DesignReport, RepoMap } from "../core/types.js";
import { COMPONENT_LIBRARY, type ComponentSpec } from "./templates.js";

/**
 * Project inference: read the plan out of the repository instead of guessing it
 * from a keyword template.
 *
 * Templates describe what a *kind* of app usually looks like. A repository that
 * already exists says what THIS app actually looks like — its routes are its
 * pages, its component files are its components, its CSS custom properties are
 * its palette, and its dependencies say which flows carry security weight.
 * Evidence wins; the template only fills gaps (and carries a greenfield project
 * on its own, which is what `plan-ui` is for).
 */

export interface Evidence<T> {
  value: T;
  /** Where this came from, shown in UI_PLAN.md so the plan can be audited. */
  source: string;
}

export interface ExistingComponent {
  name: string;
  file: string;
  /** The COMPONENT_LIBRARY key this file looks like, when recognized. */
  kind?: string;
}

export interface ProjectInference {
  /** No source files worth planning around — the template carries the plan. */
  greenfield: boolean;
  pages: Evidence<string>[];
  /** Components that already exist and should be reused, not rebuilt. */
  existingComponents: ExistingComponent[];
  /** Library keys worth specifying, derived from what the repo already has. */
  componentKinds: string[];
  palette: Evidence<{ name: string; value: string }>[];
  securityFlows: Evidence<string>[];
  /** Human-readable notes about what was detected and how. */
  signals: string[];
}

/** File/component names mapped to the component library. Order matters. */
const KIND_PATTERNS: [RegExp, string][] = [
  [/\b(auth|login|signin|sign-in|register|signup)\b/i, "auth-form"],
  [/\bcheckout\b/i, "checkout-form"],
  [/\b(cart|basket)\b/i, "cart"],
  [/\bpricing\b/i, "pricing-table"],
  [/\b(sidebar|drawer|sidenav)\b/i, "sidebar"],
  [/\b(navbar|navigation|topbar|header)\b/i, "navbar"],
  [/\bfooter\b/i, "footer"],
  [/\b(modal|dialog|popup)\b/i, "modal"],
  [/\b(chart|graph|plot)\b/i, "chart"],
  [/\b(table|datagrid|grid)\b/i, "data-table"],
  [/\bprogress\b/i, "progress-bar"],
  [/\b(notification|toast|alert)s?\b/i, "notification-dropdown"],
  [/\b(settings|preferences)\b/i, "settings-form"],
  [/\b(profile|account)\b/i, "profile-page"],
  [/\badmin\b/i, "admin-panel"],
  [/\bproduct.*card|card.*product\b/i, "product-card"],
  [/\bcourse\b/i, "course-card"],
  [/\b(hero|banner)\b/i, "hero"],
  [/\b(stat|metric|kpi|dashboard).*card|card.*\b(stat|metric)\b/i, "dashboard-cards"],
];

/** Split PascalCase / kebab / snake into words so patterns can match. */
function words(name: string): string {
  return name
    .replace(/\.[a-z]+$/i, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[-_]/g, " ");
}

function kindOf(componentPath: string): string | undefined {
  const base = words(componentPath.split("/").pop() ?? componentPath);
  for (const [pattern, kind] of KIND_PATTERNS) {
    if (pattern.test(base)) return kind;
  }
  return undefined;
}

/** "/students/[id]" -> "Students detail"; "/" -> "Home". */
export function routeToPageName(route: string): string {
  const clean = route.replace(/^\/+|\/+$/g, "");
  if (!clean) return "Home";
  const segments = clean.split("/").map((s) => {
    const dynamic = /^[[:(].*[\]):]$/.test(s) || /^[[{].*[\]}]$/.test(s);
    return dynamic ? "detail" : s.replace(/[-_]/g, " ");
  });
  const label = segments.join(" ").trim();
  return label.charAt(0).toUpperCase() + label.slice(1);
}

const COLOR_VALUE = /^(#[0-9a-f]{3,8}|rgba?\(|hsla?\(|oklch\()/i;
/** Token names that are colors even when the value is a var() reference. */
const COLOR_NAME = /(color|bg|background|surface|ink|text|border|accent|primary|secondary|success|warning|danger|error|muted)/i;

/** Dependency and path evidence for flows that need a security review. */
const SECURITY_SIGNALS: { flow: string; deps: RegExp; paths: RegExp }[] = [
  {
    flow: "Authentication and session handling",
    deps: /^(next-auth|@auth\/|@clerk\/|passport|jsonwebtoken|@supabase\/|firebase|lucia|better-auth|bcrypt)/,
    paths: /(^|\/)(auth|login|signin|signup|register|session|middleware)\b/i,
  },
  {
    flow: "Payments and checkout (PCI)",
    deps: /^(stripe|@stripe\/|braintree|paypal|@paypal\/|square|razorpay|lemonsqueezy)/,
    paths: /(^|\/)(checkout|payment|billing|subscription|invoice)\b/i,
  },
  {
    flow: "Role-based access control",
    deps: /^(casl|@casl\/|accesscontrol|casbin)/,
    paths: /(^|\/)(admin|role|permission|rbac|policy|guard)\b/i,
  },
  {
    flow: "Personal data storage and privacy",
    deps: /^(prisma|@prisma\/|mongoose|drizzle-orm|typeorm|sequelize|knex)/,
    paths: /(^|\/)(user|profile|customer|patient|student|account)s?\b/i,
  },
  {
    flow: "File upload handling",
    deps: /^(multer|uploadthing|@uploadthing\/|busboy|formidable|sharp)/,
    paths: /(^|\/)(upload|attachment|media)s?\b/i,
  },
  {
    flow: "Outbound API keys and secrets",
    deps: /^(dotenv|@aws-sdk\/|openai|@anthropic-ai\/)/,
    paths: /(^|\/)\.env/,
  },
];

const MAX_PAGES = 24;
const MAX_PALETTE = 10;

/**
 * Build the evidence set for a project. `design` is optional — without it the
 * palette simply comes from the template instead of the repository.
 */
export function inferProject(map: RepoMap, design?: DesignReport): ProjectInference {
  const signals: string[] = [];

  // ---- pages: real routes beat invented ones -------------------------------
  const pages: Evidence<string>[] = [];
  const seenPages = new Set<string>();
  for (const route of map.routes) {
    const name = routeToPageName(route);
    const key = name.toLowerCase();
    if (seenPages.has(key)) continue;
    seenPages.add(key);
    pages.push({ value: name, source: `route ${route || "/"}` });
    if (pages.length >= MAX_PAGES) break;
  }
  if (pages.length) signals.push(`${pages.length} page(s) derived from real routes`);

  // ---- components: what already exists should be reused, not rebuilt -------
  const existingComponents: ExistingComponent[] = [];
  const kinds = new Set<string>();
  for (const file of map.components) {
    const base = (file.split("/").pop() ?? file).replace(/\.[a-z]+$/i, "");
    const kind = kindOf(file);
    existingComponents.push({ name: base, file, ...(kind ? { kind } : {}) });
    if (kind && COMPONENT_LIBRARY[kind]) kinds.add(kind);
  }
  if (existingComponents.length) {
    signals.push(`${existingComponents.length} existing component file(s) found; ${kinds.size} matched to known component rules`);
  }

  // ---- palette: the project's own tokens ----------------------------------
  const palette: Evidence<{ name: string; value: string }>[] = [];
  const seenTokens = new Set<string>();
  for (const token of design?.tokens ?? []) {
    const isColor = COLOR_VALUE.test(token.value.trim()) || COLOR_NAME.test(token.name);
    if (!isColor) continue;
    const name = token.name.replace(/^--/, "");
    if (seenTokens.has(name)) continue;
    seenTokens.add(name);
    palette.push({ value: { name, value: token.value }, source: token.source });
    if (palette.length >= MAX_PALETTE) break;
  }
  if (palette.length) signals.push(`${palette.length} color token(s) read from the project's stylesheets`);

  // ---- security flows: evidence, not assumption ---------------------------
  const allDeps = [...map.dependencies, ...map.devDependencies];
  const securityFlows: Evidence<string>[] = [];
  for (const signal of SECURITY_SIGNALS) {
    const dep = allDeps.find((d) => signal.deps.test(d));
    if (dep) {
      securityFlows.push({ value: signal.flow, source: `dependency "${dep}"` });
      continue;
    }
    const file = map.files.find((f) => signal.paths.test(f.path));
    if (file) securityFlows.push({ value: signal.flow, source: `file ${file.path}` });
  }
  if (securityFlows.length) signals.push(`${securityFlows.length} security-sensitive flow(s) backed by dependencies or files`);

  const greenfield = map.fileCount === 0 || (!pages.length && !existingComponents.length);
  if (greenfield) signals.push("No routes or components found — planning from the project template");

  return { greenfield, pages, existingComponents, componentKinds: [...kinds], palette, securityFlows, signals };
}

/** Resolve library keys to specs, skipping unknown keys. */
export function specsFor(keys: string[]): ComponentSpec[] {
  const seen = new Set<string>();
  const specs: ComponentSpec[] = [];
  for (const key of keys) {
    const spec = COMPONENT_LIBRARY[key];
    if (!spec || seen.has(key)) continue;
    seen.add(key);
    specs.push(spec);
  }
  return specs;
}
