import { promises as fs } from "node:fs";
import path from "node:path";
import { DesignReport, RepoMap } from "../core/types.js";
import { isFixturePath } from "../core/fixtures.js";
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

export type StackCategory = "state" | "server-state" | "data" | "api" | "i18n" | "testing" | "styling" | "ui-kit" | "forms";

export interface StackSignal {
  category: StackCategory;
  name: string;
  /** The dependency or path that proves it. */
  evidence: string;
  /** What an agent must do about it — this is the part that changes code. */
  rule: string;
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
  /** Libraries and conventions already in use, as constraints for the agent. */
  stack: StackSignal[];
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

/**
 * Stack detection. A plan that says "use Tailwind" when the project uses
 * styled-components produces code that has to be rewritten, so each signal
 * carries the rule an agent must follow, not just the library name.
 */
const STACK_RULES: { category: StackCategory; name: string; deps?: RegExp; paths?: RegExp; rule: string }[] = [
  // --- client state ---
  { category: "state", name: "Redux Toolkit", deps: /^(@reduxjs\/toolkit|react-redux|redux)$/, rule: "Client state lives in Redux slices — extend the existing store, do not add a second state library." },
  { category: "state", name: "Zustand", deps: /^zustand$/, rule: "Client state lives in Zustand stores — extend them, do not add a second state library." },
  { category: "state", name: "Jotai", deps: /^jotai$/, rule: "Client state is atom-based (Jotai) — add atoms, do not introduce a store library." },
  { category: "state", name: "MobX", deps: /^mobx(-react(-lite)?)?$/, rule: "Client state is observable (MobX) — mutate through actions, keep components observers." },
  { category: "state", name: "XState", deps: /^(xstate|@xstate\/)/, rule: "Complex flows are state machines (XState) — model new flows as machines, not ad-hoc booleans." },
  { category: "state", name: "Pinia", deps: /^pinia$/, rule: "Client state lives in Pinia stores — extend them rather than adding local singletons." },

  // --- server state ---
  { category: "server-state", name: "TanStack Query", deps: /^@tanstack\/(react|vue|svelte)-query$/, rule: "Fetch server data with TanStack Query — no raw useEffect + fetch, and reuse existing query keys." },
  { category: "server-state", name: "SWR", deps: /^swr$/, rule: "Fetch server data with SWR hooks — no raw useEffect + fetch." },

  // --- data layer ---
  { category: "data", name: "Prisma", deps: /^(prisma|@prisma\/client)$/, rule: "Database access goes through the Prisma client in server code only — never query from a component." },
  { category: "data", name: "Drizzle", deps: /^drizzle-orm$/, rule: "Database access goes through Drizzle schemas in server code only." },
  { category: "data", name: "Mongoose", deps: /^mongoose$/, rule: "Database access goes through Mongoose models in server code only." },
  { category: "data", name: "Supabase", deps: /^@supabase\//, rule: "Data access goes through the Supabase client; respect row-level security instead of filtering in the UI." },

  // --- api shape ---
  { category: "api", name: "tRPC", deps: /^@trpc\//, rule: "Call the API through tRPC procedures — do not add untyped fetch endpoints." },
  { category: "api", name: "GraphQL", deps: /^(graphql|@apollo\/client|urql|react-relay)$/, rule: "Data is fetched with GraphQL documents — add fields to existing queries rather than new REST routes." },
  { category: "api", name: "REST route handlers", paths: /(^|\/)(app|pages|src\/app|src\/pages)\/api\//, rule: "HTTP handlers live under the existing `api/` directory — follow its request/response conventions." },
  { category: "api", name: "Express", deps: /^express$/, rule: "Server routes are Express handlers — register new routes with the existing router and middleware." },
  { category: "api", name: "Fastify", deps: /^fastify$/, rule: "Server routes are Fastify handlers — reuse the existing plugin and schema setup." },
  { category: "api", name: "NestJS", deps: /^@nestjs\/core$/, rule: "Server code is NestJS — add controllers/providers through modules, not free functions." },
  { category: "api", name: "Hono", deps: /^hono$/, rule: "Server routes are Hono handlers — reuse the existing app instance and middleware." },

  // --- i18n ---
  { category: "i18n", name: "next-intl", deps: /^next-intl$/, rule: "Every user-facing string goes through next-intl message files — never hardcode copy in a component." },
  { category: "i18n", name: "i18next", deps: /^(i18next|react-i18next)$/, rule: "Every user-facing string goes through i18next translation keys — never hardcode copy in a component." },
  { category: "i18n", name: "vue-i18n", deps: /^vue-i18n$/, rule: "Every user-facing string goes through vue-i18n messages — never hardcode copy in a template." },
  { category: "i18n", name: "FormatJS", deps: /^(@formatjs\/|react-intl$)/, rule: "Every user-facing string goes through react-intl messages — never hardcode copy in a component." },
  { category: "i18n", name: "Lingui", deps: /^@lingui\//, rule: "Every user-facing string goes through Lingui macros — never hardcode copy in a component." },

  // --- testing ---
  { category: "testing", name: "Vitest", deps: /^vitest$/, rule: "Ship tests with the change — Vitest, colocated with the existing suite." },
  { category: "testing", name: "Jest", deps: /^jest$/, rule: "Ship tests with the change — Jest, colocated with the existing suite." },
  { category: "testing", name: "Playwright", deps: /^@playwright\/test$/, rule: "User-facing flows have Playwright e2e coverage — add a case for new flows." },
  { category: "testing", name: "Cypress", deps: /^cypress$/, rule: "User-facing flows have Cypress e2e coverage — add a case for new flows." },
  { category: "testing", name: "Testing Library", deps: /^@testing-library\//, rule: "Test components through Testing Library queries (role/label), not implementation details." },

  // --- styling ---
  { category: "styling", name: "Tailwind CSS", deps: /^tailwindcss$/, rule: "Style with Tailwind utility classes and the project's token scale — do not add ad-hoc CSS files." },
  { category: "styling", name: "styled-components", deps: /^styled-components$/, rule: "Style with styled-components — do not mix in utility-class frameworks." },
  { category: "styling", name: "Emotion", deps: /^@emotion\//, rule: "Style with Emotion — do not mix in utility-class frameworks." },
  { category: "styling", name: "vanilla-extract", deps: /^@vanilla-extract\//, rule: "Style with vanilla-extract recipes — keep styles type-safe and colocated." },
  { category: "styling", name: "CSS Modules", paths: /\.module\.(css|scss|less)$/, rule: "Styles are CSS Modules — keep class names local, no global selectors." },
  { category: "styling", name: "Sass", deps: /^(sass|node-sass)$/, rule: "Styles are Sass — reuse the existing variables and mixins instead of raw values." },

  // --- ui kit ---
  { category: "ui-kit", name: "MUI", deps: /^@mui\//, rule: "Compose from MUI components and theme tokens — do not hand-roll equivalents." },
  { category: "ui-kit", name: "Ant Design", deps: /^antd$/, rule: "Compose from Ant Design components — do not hand-roll equivalents." },
  { category: "ui-kit", name: "Chakra UI", deps: /^@chakra-ui\//, rule: "Compose from Chakra components and theme tokens — do not hand-roll equivalents." },
  { category: "ui-kit", name: "Mantine", deps: /^@mantine\//, rule: "Compose from Mantine components — do not hand-roll equivalents." },
  { category: "ui-kit", name: "Radix / shadcn", deps: /^(@radix-ui\/|class-variance-authority$)/, rule: "Compose from the existing Radix/shadcn primitives in the UI folder — do not hand-roll dialogs, menus or popovers." },
  { category: "ui-kit", name: "Bootstrap", deps: /^(bootstrap|react-bootstrap)$/, rule: "Compose from Bootstrap components and grid — do not introduce a second CSS framework." },

  // --- forms and validation ---
  { category: "forms", name: "React Hook Form", deps: /^react-hook-form$/, rule: "Build forms with React Hook Form — no manual useState-per-field." },
  { category: "forms", name: "Formik", deps: /^formik$/, rule: "Build forms with Formik — no manual useState-per-field." },
  { category: "forms", name: "Zod", deps: /^zod$/, rule: "Validate with Zod schemas, and validate on the server too — client validation is not a control." },
  { category: "forms", name: "Yup", deps: /^yup$/, rule: "Validate with Yup schemas, and validate on the server too — client validation is not a control." },
];

const MAX_PAGES = 24;
const MAX_PALETTE = 10;
const MAX_STACK_PER_CATEGORY = 3;

const MAX_NESTED_MANIFESTS = 12;

/**
 * Dependencies for the whole project, not just its root.
 *
 * Monorepos and multi-project folders often have no root `package.json` at all
 * — the stack lives in `frontend/package.json`, `apps/web/package.json` and so
 * on. Fixture manifests are skipped: a test fixture's dependencies are not the
 * project's stack.
 */
export async function collectDependencies(root: string, map: RepoMap): Promise<{ deps: string[]; manifests: string[] }> {
  const deps = new Set([...map.dependencies, ...map.devDependencies]);
  const manifests: string[] = deps.size ? ["package.json"] : [];

  const nested = map.files
    .filter((f) => f.path.endsWith("package.json") && f.path !== "package.json" && !isFixturePath(f.path))
    .sort((a, b) => a.path.split("/").length - b.path.split("/").length)
    .slice(0, MAX_NESTED_MANIFESTS);

  for (const file of nested) {
    try {
      const raw = await fs.readFile(path.join(path.resolve(root), file.path), "utf8");
      const pkg = JSON.parse(raw) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
      const names = [...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {})];
      if (!names.length) continue;
      names.forEach((n) => deps.add(n));
      manifests.push(file.path);
    } catch { /* unreadable or invalid manifest — skip it */ }
  }
  return { deps: [...deps], manifests };
}

/**
 * Detect the libraries and conventions already in use.
 * Pass `deps` from `collectDependencies` to cover monorepos.
 */
export function inferStack(map: RepoMap, deps?: string[]): StackSignal[] {
  const allDeps = deps ?? [...map.dependencies, ...map.devDependencies];
  const found: StackSignal[] = [];
  const perCategory = new Map<StackCategory, number>();

  for (const rule of STACK_RULES) {
    const used = perCategory.get(rule.category) ?? 0;
    if (used >= MAX_STACK_PER_CATEGORY) continue;

    let evidence: string | null = null;
    const dep = rule.deps ? allDeps.find((d) => rule.deps!.test(d)) : undefined;
    if (dep) evidence = `dependency "${dep}"`;
    else if (rule.paths) {
      // A fixture's API folder is not the project's API convention.
      const file = map.files.find((f) => rule.paths!.test(f.path) && !isFixturePath(f.path));
      if (file) evidence = `file ${file.path}`;
    }
    if (!evidence) continue;

    found.push({ category: rule.category, name: rule.name, evidence, rule: rule.rule });
    perCategory.set(rule.category, used + 1);
  }
  return found;
}

/**
 * Build the evidence set for a project. `design` is optional — without it the
 * palette simply comes from the template instead of the repository.
 */
export function inferProject(map: RepoMap, design?: DesignReport, deps?: string[]): ProjectInference {
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
    if (isFixturePath(file)) continue; // a fixture's components are not this project's
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
    if (isFixturePath(token.source)) continue;
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
  const allDeps = deps ?? [...map.dependencies, ...map.devDependencies];
  const securityFlows: Evidence<string>[] = [];
  for (const signal of SECURITY_SIGNALS) {
    const dep = allDeps.find((d) => signal.deps.test(d));
    if (dep) {
      securityFlows.push({ value: signal.flow, source: `dependency "${dep}"` });
      continue;
    }
    const file = map.files.find((f) => signal.paths.test(f.path) && !isFixturePath(f.path));
    if (file) securityFlows.push({ value: signal.flow, source: `file ${file.path}` });
  }
  if (securityFlows.length) signals.push(`${securityFlows.length} security-sensitive flow(s) backed by dependencies or files`);

  // ---- stack: what the project already commits to -------------------------
  const stack = inferStack(map, allDeps);
  if (stack.length) {
    const byCategory = [...new Set(stack.map((s) => s.category))];
    signals.push(`stack detected: ${stack.map((s) => s.name).join(", ")} (${byCategory.length} concern${byCategory.length === 1 ? "" : "s"})`);
  }

  const greenfield = map.fileCount === 0 || (!pages.length && !existingComponents.length);
  if (greenfield) signals.push("No routes or components found — planning from the project template");

  return { greenfield, pages, existingComponents, componentKinds: [...kinds], palette, securityFlows, stack, signals };
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
