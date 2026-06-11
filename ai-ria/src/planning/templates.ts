/**
 * UI/UX Planning templates (v0.2). Inspired by awesome-design-md / google-labs
 * design.md: structured, agent-readable design knowledge - compact on purpose.
 */
export interface ComponentSpec {
  name: string;
  purpose: string;
  rules: string[];
  hints: string[];
  tailwind: string;
  security?: string;
}

export interface ProjectTemplate {
  type: string;
  keywords: string[];
  style: string;
  palette: { name: string; value: string }[];
  pages: string[];
  components: string[];
  securityFlows: string[];
}

export const COMPONENT_LIBRARY: Record<string, ComponentSpec> = {
  sidebar: {
    name: "Sidebar",
    purpose: "Primary navigation between app sections",
    rules: ["Fixed left, collapsible on mobile", "Active item clearly highlighted", "Max 8 top-level items"],
    hints: ["nav + ul list, one route per item", "Persist collapsed state"],
    tailwind: "w-64 shrink-0 border-r bg-white flex flex-col gap-1 p-3",
  },
  "dashboard-cards": {
    name: "Dashboard cards",
    purpose: "At-a-glance KPI / status blocks on the main screen",
    rules: ["One metric per card", "Consistent height in a grid", "Skeleton state while loading"],
    hints: ["CSS grid 2-4 columns", "Number + label + trend icon"],
    tailwind: "grid grid-cols-1 md:grid-cols-3 gap-4; card: rounded-xl border bg-white p-4 shadow-sm",
  },
  "course-card": {
    name: "Course card",
    purpose: "Course preview: title, progress, mentor, CTA",
    rules: ["Cover image ratio 16:9", "Progress bar always visible", "Whole card clickable"],
    hints: ["Reuse progress-bar component", "Truncate title to 2 lines"],
    tailwind: "rounded-xl border bg-white overflow-hidden hover:shadow-md transition",
  },
  "data-table": {
    name: "Data table (students/records)",
    purpose: "Sortable, filterable list of records",
    rules: ["Sticky header", "Row hover state", "Pagination over 25 rows"],
    hints: ["Empty + loading states first", "Column sort via aria-sort"],
    tailwind: "w-full text-sm; th: text-left font-medium text-gray-500 px-3 py-2; td: px-3 py-2 border-t",
    security: "Never render unescaped user input in cells; respect role-based row visibility",
  },
  "profile-page": {
    name: "Profile page (student/mentor)",
    purpose: "Identity, stats, and activity of one user",
    rules: ["Avatar + name + role badge header", "Tabs for sections"],
    hints: ["Reuse dashboard-cards for stats row"],
    tailwind: "max-w-3xl mx-auto flex flex-col gap-6",
    security: "Show contact data only to permitted roles",
  },
  "auth-form": {
    name: "Auth form (login/register)",
    purpose: "Authentication entry point",
    rules: ["Single column, centered, max-w-sm", "Inline validation messages", "Show/hide password toggle"],
    hints: ["Disable submit while pending", "Autofocus first field"],
    tailwind: "max-w-sm mx-auto flex flex-col gap-4; input: rounded-lg border px-3 py-2",
    security: "POST only over HTTPS; never log credentials; rate-limit attempts; generic error messages",
  },
  "admin-panel": {
    name: "Admin panel",
    purpose: "Management area for privileged users",
    rules: ["Visually distinct from user area (badge or accent)", "Destructive actions need confirmation modal"],
    hints: ["Compose from sidebar + data-table + modal"],
    tailwind: "reuse app shell; destructive: bg-red-600 text-white rounded-lg px-3 py-2",
    security: "Server-side role check on every action - UI hiding is not authorization",
  },
  "notification-dropdown": {
    name: "Notification dropdown",
    purpose: "Recent events without leaving the page",
    rules: ["Unread badge with count", "Mark-all-read action", "Max 10 items, then link to full list"],
    hints: ["Popover anchored to bell icon; close on outside click and Esc"],
    tailwind: "absolute right-0 mt-2 w-80 rounded-xl border bg-white shadow-lg",
  },
  "progress-bar": {
    name: "Progress bar",
    purpose: "Completion state of a course/task",
    rules: ["Always pair with a % label for accessibility", "Animate width changes"],
    hints: ["role=progressbar with aria-valuenow"],
    tailwind: "h-2 rounded-full bg-gray-200; fill: h-2 rounded-full bg-primary transition-all",
  },
  modal: {
    name: "Modal",
    purpose: "Focused task or confirmation overlay",
    rules: ["Trap focus inside", "Close on Esc and backdrop click", "One primary action"],
    hints: ["Portal to body; lock scroll while open"],
    tailwind: "fixed inset-0 bg-black/40 flex items-center justify-center; panel: rounded-2xl bg-white p-6 max-w-md w-full",
  },
  navbar: {
    name: "Navbar",
    purpose: "Top-level navigation and account entry",
    rules: ["Sticky top", "Mobile hamburger under md"],
    hints: ["Keep under 64px height"],
    tailwind: "sticky top-0 z-40 flex items-center justify-between border-b bg-white px-4 h-16",
  },
  "product-card": {
    name: "Product card",
    purpose: "Product preview with price and CTA",
    rules: ["Price always visible", "Image ratio 1:1", "Add-to-cart reachable without detail page"],
    hints: ["Reuse for grids and carousels"],
    tailwind: "rounded-xl border bg-white p-3 flex flex-col gap-2",
  },
  cart: {
    name: "Cart",
    purpose: "Selected items, quantities, totals",
    rules: ["Quantity stepper per row", "Total recalculates instantly"],
    hints: ["Optimistic UI with rollback on error"],
    tailwind: "divide-y; row: flex items-center gap-3 py-3",
    security: "Validate prices server-side; never trust client totals",
  },
  "checkout-form": {
    name: "Checkout form",
    purpose: "Payment and delivery details",
    rules: ["Step indicator", "Summary visible at all times"],
    hints: ["Use a payment provider's hosted fields"],
    tailwind: "grid md:grid-cols-[1fr_320px] gap-6",
    security: "PCI: never touch raw card numbers; tokenize via provider; HTTPS only",
  },
  hero: {
    name: "Hero",
    purpose: "First-screen value proposition",
    rules: ["One headline, one CTA", "Readable contrast over imagery"],
    hints: ["Keep above-the-fold under 100KB"],
    tailwind: "max-w-5xl mx-auto text-center py-24 flex flex-col gap-6",
  },
  "pricing-table": {
    name: "Pricing table",
    purpose: "Plan comparison",
    rules: ["Highlight recommended plan", "Max 4 plans"],
    hints: ["Feature list as checkmarks; annual/monthly toggle"],
    tailwind: "grid md:grid-cols-3 gap-6; plan: rounded-2xl border p-6",
  },
  chart: {
    name: "Chart",
    purpose: "Trend and distribution visualization",
    rules: ["Title + period selector", "Accessible data table fallback"],
    hints: ["Lazy-load chart lib; one library project-wide"],
    tailwind: "rounded-xl border bg-white p-4",
  },
  "settings-form": {
    name: "Settings form",
    purpose: "Account and app configuration",
    rules: ["Group by section, save per section", "Unsaved-changes warning"],
    hints: ["Reuse auth-form input styles"],
    tailwind: "max-w-2xl flex flex-col gap-8",
    security: "Re-authenticate before email/password changes",
  },
  footer: {
    name: "Footer",
    purpose: "Secondary links and legal",
    rules: ["Low visual weight", "Columns collapse on mobile"],
    hints: ["Keep links in config, not hardcoded"],
    tailwind: "border-t text-sm text-gray-500 py-10",
  },
};

const PALETTES = {
  education: [
    { name: "primary", value: "#4F46E5" },
    { name: "primary-soft", value: "#EEF2FF" },
    { name: "success", value: "#16A34A" },
    { name: "warning", value: "#F59E0B" },
    { name: "ink", value: "#111827" },
    { name: "muted", value: "#6B7280" },
    { name: "surface", value: "#FFFFFF" },
    { name: "background", value: "#F9FAFB" },
  ],
  commerce: [
    { name: "primary", value: "#0F766E" },
    { name: "accent", value: "#F97316" },
    { name: "ink", value: "#111827" },
    { name: "muted", value: "#6B7280" },
    { name: "surface", value: "#FFFFFF" },
    { name: "background", value: "#FAFAF9" },
  ],
  saas: [
    { name: "primary", value: "#2563EB" },
    { name: "primary-soft", value: "#EFF6FF" },
    { name: "ink", value: "#0F172A" },
    { name: "muted", value: "#64748B" },
    { name: "surface", value: "#FFFFFF" },
    { name: "background", value: "#F8FAFC" },
  ],
  marketing: [
    { name: "primary", value: "#111827" },
    { name: "accent", value: "#FCC204" },
    { name: "ink", value: "#111827" },
    { name: "muted", value: "#6B7280" },
    { name: "surface", value: "#FFFFFF" },
    { name: "background", value: "#FFFFFF" },
  ],
};

export const PROJECT_TEMPLATES: ProjectTemplate[] = [
  {
    type: "lms",
    keywords: ["lms", "learning", "course", "student", "mentor", "teacher", "education", "school", "lesson", "exam"],
    style: "Education platform - clean SaaS dashboard, minimal card-based layout, calm indigo palette",
    palette: PALETTES.education,
    pages: ["Dashboard", "Courses", "Course detail", "Students", "Mentor profile", "Login / Register", "Admin panel", "Notifications"],
    components: ["sidebar", "dashboard-cards", "course-card", "data-table", "profile-page", "auth-form", "admin-panel", "notification-dropdown", "progress-bar", "modal"],
    securityFlows: ["Authentication", "Role-based access: student / mentor / admin", "Grades and personal data privacy"],
  },
  {
    type: "ecommerce",
    keywords: ["shop", "store", "ecommerce", "e-commerce", "product", "cart", "checkout", "order", "marketplace"],
    style: "Commerce - product-first grid, high-contrast CTAs, fast above-the-fold",
    palette: PALETTES.commerce,
    pages: ["Home / Catalog", "Product detail", "Cart", "Checkout", "Order history", "Login / Register", "Admin panel"],
    components: ["navbar", "product-card", "cart", "checkout-form", "auth-form", "admin-panel", "modal", "footer"],
    securityFlows: ["Payments / checkout (PCI)", "Authentication", "Order data privacy"],
  },
  {
    type: "saas-dashboard",
    keywords: ["dashboard", "analytics", "saas", "crm", "metrics", "admin panel", "internal tool", "platform"],
    style: "SaaS dashboard - clean admin UI, dense but breathable, blue on slate",
    palette: PALETTES.saas,
    pages: ["Dashboard", "Reports", "Records", "Settings", "Login", "Admin"],
    components: ["sidebar", "dashboard-cards", "chart", "data-table", "settings-form", "auth-form", "notification-dropdown", "modal"],
    securityFlows: ["Authentication", "API keys / tokens handling", "Audit of admin actions"],
  },
  {
    type: "landing",
    keywords: ["landing", "portfolio", "marketing", "website", "promo", "brochure", "agency"],
    style: "Marketing site - bold hero, generous whitespace, single accent color",
    palette: PALETTES.marketing,
    pages: ["Home", "Features", "Pricing", "About", "Contact"],
    components: ["navbar", "hero", "pricing-table", "modal", "footer"],
    securityFlows: ["Contact form spam protection"],
  },
  {
    type: "finance",
    keywords: ["bank", "finance", "fintech", "payment", "wallet", "invoice", "accounting", "budget"],
    style: "Finance - conservative, high-trust, data-dense tables, restrained color",
    palette: PALETTES.saas,
    pages: ["Overview", "Transactions", "Reports", "Settings", "Login (2FA)"],
    components: ["sidebar", "dashboard-cards", "chart", "data-table", "settings-form", "auth-form", "modal"],
    securityFlows: ["Strong auth / 2FA", "Transaction integrity", "PII and financial data encryption", "Audit trail"],
  },
];

export const GENERIC_TEMPLATE: ProjectTemplate = {
  type: "generic-app",
  keywords: [],
  style: "Clean minimal app - card-based layout, one primary color, system font stack",
  palette: PALETTES.saas,
  pages: ["Home", "Main view", "Detail view", "Settings", "Login"],
  components: ["navbar", "dashboard-cards", "data-table", "auth-form", "modal", "footer"],
  securityFlows: ["Authentication"],
};

/** Pick the best template for a goal/description by keyword score. */
export function detectTemplate(text: string): ProjectTemplate {
  const lower = text.toLowerCase();
  let best: { t: ProjectTemplate; score: number } | null = null;
  for (const t of PROJECT_TEMPLATES) {
    const exactTypeBonus = lower.includes(t.type) ? 3 : 0;
    const score = exactTypeBonus + t.keywords.reduce((s, k) => s + (lower.includes(k) ? 1 : 0), 0);
    if (score > 0 && (!best || score > best.score)) best = { t, score };
  }
  return best?.t ?? GENERIC_TEMPLATE;
}
