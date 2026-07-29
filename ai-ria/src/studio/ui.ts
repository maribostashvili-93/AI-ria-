/**
 * AI RIA Studio — embedded single-file dashboard.
 * Zero build step: vanilla JS, hash routing, custom SVG force graph.
 * Branding: logo auto-discovered from assets/ and served at /logo.
 * Motion: gsap served from the package's node_modules at /vendor/gsap.min.js;
 * every animation is skipped under prefers-reduced-motion or if gsap is absent.
 */
export const STUDIO_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>AI RIA Studio</title>
<link rel="icon" href="/logo" />
<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
<style>
  :root {
    --bg: #0d1117; --panel: #161b22; --border: #30363d; --text: #e6edf3;
    --muted: #8b949e; --accent: #fcc204; --green: #3fb950; --red: #f85149;
    --blue: #58a6ff; --purple: #bc8cff; --orange: #ffa657;
  }
  * { box-sizing: border-box; margin: 0; }
  body { background: var(--bg); color: var(--text); font: 14px/1.5 system-ui, sans-serif; display: flex; min-height: 100vh; }
  nav { width: 220px; background: var(--panel); border-right: 1px solid var(--border); padding: 16px 0; position: fixed; top: 0; bottom: 0; display: flex; flex-direction: column; }
  .brand { display: flex; align-items: center; gap: 10px; padding: 0 16px 14px; }
  .brand img { width: 34px; height: 34px; border-radius: 8px; object-fit: contain; }
  .brand b { color: var(--accent); font-size: 15px; }
  .brand small { display: block; color: var(--muted); font-weight: normal; font-size: 10px; }
  nav a { display: block; padding: 8px 16px; color: var(--muted); text-decoration: none; border-left: 2px solid transparent; }
  nav a:hover { color: var(--text); }
  nav a.active { color: var(--text); border-left-color: var(--accent); background: rgba(252,194,4,.06); }
  nav .spacer { flex: 1; }
  .wrap { margin-left: 220px; flex: 1; min-width: 0; }
  header { display: flex; align-items: center; gap: 14px; padding: 14px 24px; border-bottom: 1px solid var(--border); background: rgba(22,27,34,.6); }
  header img { width: 28px; height: 28px; border-radius: 6px; object-fit: contain; }
  header .t b { font-size: 15px; }
  header .t span { display: block; color: var(--muted); font-size: 11px; }
  header .hstats { margin-left: auto; display: flex; gap: 18px; color: var(--muted); font-size: 12px; text-align: right; }
  header .hstats b { display: block; color: var(--text); font-size: 15px; }
  header .hstats .good b { color: var(--green); }
  main { padding: 24px; }
  h2 { font-size: 18px; margin-bottom: 4px; }
  .sub { color: var(--muted); margin-bottom: 20px; font-size: 12px; }
  .cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 12px; margin-bottom: 24px; }
  .card { background: var(--panel); border: 1px solid var(--border); border-radius: 8px; padding: 14px; }
  .card .v { font-size: 22px; font-weight: 600; }
  .card .k { color: var(--muted); font-size: 12px; }
  .card.good .v { color: var(--green); } .card.bad .v { color: var(--red); } .card.accent .v { color: var(--accent); }
  table { width: 100%; border-collapse: collapse; background: var(--panel); border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
  th, td { text-align: left; padding: 8px 12px; border-bottom: 1px solid var(--border); font-size: 13px; }
  th { color: var(--muted); font-weight: 500; background: rgba(255,255,255,.02); }
  tr:last-child td { border-bottom: 0; }
  .sev-critical { color: var(--red); font-weight: 600; } .sev-high { color: var(--orange); }
  .sev-medium { color: var(--accent); } .sev-low { color: var(--muted); }
  .empty { color: var(--muted); background: var(--panel); border: 1px dashed var(--border); border-radius: 8px; padding: 24px; text-align: center; }
  .empty code { color: var(--accent); }
  svg.graph { width: 100%; height: 560px; background: var(--panel); border: 1px solid var(--border); border-radius: 8px; }
  .legend { display: flex; gap: 16px; margin: 10px 0 16px; color: var(--muted); font-size: 12px; flex-wrap: wrap; }
  .legend i { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 5px; }
  .chain { background: var(--panel); border: 1px solid var(--border); border-radius: 8px; padding: 14px; margin-bottom: 12px; }
  .chain b { color: var(--accent); }
  .chain .hop { color: var(--muted); margin: 0 6px; }
  ul.plain { list-style: none; } ul.plain li { padding: 3px 0; }
  .pill { display: inline-block; background: rgba(88,166,255,.15); color: var(--blue); border-radius: 10px; padding: 1px 8px; font-size: 12px; margin: 2px; }
  #splash { position: fixed; inset: 0; background: var(--bg); z-index: 100; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px; }
  #splash img { width: 96px; height: 96px; border-radius: 18px; object-fit: contain; }
  #splash .st { color: var(--accent); font-size: 18px; font-weight: 600; }
  #splash .ss { color: var(--muted); font-size: 12px; }
  .about-logo { width: 120px; height: 120px; border-radius: 20px; object-fit: contain; margin-bottom: 14px; }
</style>
</head>
<body>
<div id="splash">
  <img src="/logo" onerror="this.style.display='none'" alt="" />
  <div class="st">AI RIA Studio</div>
  <div class="ss">Agent Intelligence Layer</div>
</div>
<nav>
  <div class="brand">
    <img src="/logo" onerror="this.style.display='none'" alt="" />
    <div><b>AI RIA Studio</b><small id="proj"></small></div>
  </div>
  <a href="#/overview">Overview</a>
  <a href="#/memory-graph">Memory Graph</a>
  <a href="#/routing">Agent Routing</a>
  <a href="#/visual-memory">Visual Memory</a>
  <a href="#/figma">Figma Design</a>
  <a href="#/tokens">Token Usage</a>
  <a href="#/security">Security</a>
  <a href="#/handoff">Handoffs</a>
  <div class="spacer"></div>
  <a href="#/about">About</a>
</nav>
<div class="wrap">
  <header>
    <img src="/logo" onerror="this.style.display='none'" alt="" />
    <div class="t"><b>AI RIA Studio</b><span>Agent Intelligence Layer</span></div>
    <div class="hstats" id="hstats"></div>
  </header>
  <main id="view">Loading…</main>
</div>
<script src="/vendor/gsap.min.js" onerror="window.gsap = undefined"></script>
<script>
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const api = (e) => fetch("/api/" + e).then((r) => r.json());
const fmt = (n) => Number(n ?? 0).toLocaleString("en-US");
const REDUCE = matchMedia("(prefers-reduced-motion: reduce)").matches;
const motion = () => !REDUCE && typeof gsap !== "undefined";

const KIND_COLORS = {
  memory: "#58a6ff", agent: "#fcc204", handoff: "#f85149", design: "#bc8cff",
  decision: "#bc8cff", component: "#fcc204", "figma-node": "#58a6ff", "code-file": "#3fb950", "agent-task": "#f85149",
};

function forceGraph(graph, height) {
  const W = 980, H = height || 560;
  const nodes = (graph.nodes || []).slice(0, 80).map((n, i) => ({
    ...n, x: W / 2 + 280 * Math.cos((2 * Math.PI * i) / Math.max(graph.nodes.length, 1)),
    y: H / 2 + 200 * Math.sin((2 * Math.PI * i) / Math.max(graph.nodes.length, 1)), vx: 0, vy: 0,
  }));
  const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
  const edges = (graph.edges || []).filter((e) => byId[e.from] && byId[e.to]);
  for (let t = 0; t < 200; t++) {
    for (const a of nodes) for (const b of nodes) {
      if (a === b) continue;
      const dx = a.x - b.x, dy = a.y - b.y, d2 = Math.max(dx * dx + dy * dy, 40);
      const f = 1800 / d2; a.vx += (dx / Math.sqrt(d2)) * f; a.vy += (dy / Math.sqrt(d2)) * f;
    }
    for (const e of edges) {
      const a = byId[e.from], b = byId[e.to];
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
      const f = (d - 120) * 0.02;
      a.vx += (dx / d) * f; a.vy += (dy / d) * f; b.vx -= (dx / d) * f; b.vy -= (dy / d) * f;
    }
    for (const n of nodes) {
      n.vx += (W / 2 - n.x) * 0.005; n.vy += (H / 2 - n.y) * 0.005;
      n.x = Math.max(30, Math.min(W - 30, n.x + n.vx * 0.6)); n.y = Math.max(24, Math.min(H - 24, n.y + n.vy * 0.6));
      n.vx *= 0.55; n.vy *= 0.55;
    }
  }
  const lines = edges.map((e) => {
    const a = byId[e.from], b = byId[e.to];
    return '<line x1="' + a.x + '" y1="' + a.y + '" x2="' + b.x + '" y2="' + b.y + '" stroke="#30363d" />' +
      '<text x="' + (a.x + b.x) / 2 + '" y="' + ((a.y + b.y) / 2 - 3) + '" fill="#484f58" font-size="9" text-anchor="middle">' + esc(e.relation || "") + "</text>";
  }).join("");
  const dots = nodes.map((n) => {
    const c = KIND_COLORS[n.kind] || "#8b949e";
    const r = 5 + Math.min(n.importance || 4, 10);
    const label = (n.label || n.id).slice(0, 28);
    return '<g class="gnode"><circle cx="' + n.x + '" cy="' + n.y + '" r="' + r + '" fill="' + c + '" fill-opacity="0.85"><title>' + esc(n.label || n.id) + "</title></circle>" +
      '<text x="' + n.x + '" y="' + (n.y - r - 4) + '" fill="#e6edf3" font-size="10" text-anchor="middle">' + esc(label) + "</text></g>";
  }).join("");
  const kinds = [...new Set(nodes.map((n) => n.kind))];
  const legend = kinds.map((k) => '<span><i style="background:' + (KIND_COLORS[k] || "#8b949e") + '"></i>' + esc(k) + "</span>").join("");
  return '<div class="legend">' + legend + '</div><svg class="graph" viewBox="0 0 ' + W + " " + H + '">' + lines + dots + "</svg>";
}

const card = (k, v, cls) => '<div class="card ' + (cls || "") + '"><div class="v">' + v + '</div><div class="k">' + esc(k) + "</div></div>";
const ncard = (k, n, cls) => '<div class="card ' + (cls || "") + '"><div class="v" data-count="' + Number(n || 0) + '">' + fmt(n) + '</div><div class="k">' + esc(k) + "</div></div>";
const empty = (hint) => '<div class="empty">No data yet — <code>' + esc(hint) + "</code></div>";

const pages = {
  async overview() {
    const o = await api("overview");
    const types = Object.entries(o.memoriesByType || {}).map(([t, n]) => '<span class="pill">' + esc(t) + ": " + n + "</span>").join(" ");
    return "<h2>Overview</h2><p class='sub'>" + esc(o.generatedAt) + "</p><div class='cards'>" +
      ncard("Memories", o.memories, "accent") +
      ncard("Tokens saved", o.tokensSaved, "good") +
      card("Savings", (o.savingsPercent ?? 0) + "%", "good") +
      ncard("Components", o.components) +
      ncard("Active agents", o.activeAgents, o.activeAgents ? "accent" : "") +
      card("Security findings", o.securityFindings === null ? "—" : fmt(o.securityFindings), o.securityCriticalOrHigh ? "bad" : "") +
      card("Critical / High", o.securityCriticalOrHigh === null ? "—" : fmt(o.securityCriticalOrHigh), o.securityCriticalOrHigh ? "bad" : "good") +
      card("Figma imported", o.figmaImported ? "yes" : "no", o.figmaImported ? "good" : "") +
      "</div>" +
      (o.activeTask ? "<h2>Active Task</h2><div class='chain'><b>" + esc(o.activeTask) + "</b></div>" : "") +
      (types ? "<h2>Memory Types</h2><p>" + types + "</p>" : "");
  },
  async "memory-graph"() {
    const g = await api("memory-graph");
    if (!g.nodes || !g.nodes.length) return "<h2>Memory Graph</h2>" + empty("ria memory add / ria graph build");
    return "<h2>Memory Graph</h2><p class='sub'>" + g.stats.nodes + " nodes · " + g.stats.edges + " edges · " + g.stats.agents + " agents</p>" + forceGraph(g);
  },
  async routing() {
    const r = await api("routing");
    if (r.missing) return "<h2>Agent Routing</h2>" + empty(r.missing);
    const rows = (r.agents || []).map((a) => "<tr><td>" + a.order + "</td><td>" + esc(a.name) + "</td><td>" + esc(a.role) + "</td><td><code>" + esc(a.pack) + "</code></td><td>" + fmt(a.packBudget) + "</td><td>" + fmt(a.tokenLimit) + "</td></tr>").join("");
    return "<h2>Agent Routing</h2><p class='sub'>Goal: " + esc(r.goal) + " · " + esc(r.projectType) + "</p>" +
      "<table><tr><th>#</th><th>Agent</th><th>Role</th><th>Pack</th><th>Pack budget</th><th>Token limit</th></tr>" + rows + "</table>" +
      (r.securityFlows && r.securityFlows.length ? "<h2 style='margin-top:20px'>Security Flows</h2><ul class='plain'>" + r.securityFlows.map((s) => "<li>⚠ " + esc(s) + "</li>").join("") + "</ul>" : "");
  },
  async "visual-memory"() {
    const [vm, g] = await Promise.all([api("visual-memory"), api("design-graph")]);
    if (!vm.chains || !vm.chains.length) return "<h2>Visual Memory</h2>" + empty("ria figma import + ria visual memory");
    const chains = vm.chains.map((c) =>
      "<div class='chain'>" +
      (c.decisions.length ? c.decisions.map(esc).join("; ") : "(no decision)") + "<span class='hop'>→</span><b>" + esc(c.component) + "</b>" +
      "<span class='hop'>→</span>" + esc(c.figmaNode || "(no figma)") +
      "<span class='hop'>→</span>" + (c.codeFiles.length ? c.codeFiles.map((f) => "<code>" + esc(f) + "</code>").join(", ") : "(no code)") +
      (c.agentTask ? "<span class='hop'>→</span>" + esc(c.agentTask) : "") + "</div>").join("");
    return "<h2>Visual Memory</h2><p class='sub'>" + vm.stats.components + " components · " + vm.stats.withFigma + " in Figma · " + vm.stats.withCode + " mapped to code</p>" +
      chains + "<h2 style='margin-top:20px'>Design Graph</h2>" + forceGraph(g, 480);
  },
  async figma() {
    const f = await api("figma");
    if (f.missing) return "<h2>Figma Design</h2>" + empty(f.missing);
    const section = (title, items, render) => items && items.length ? "<h2 style='margin-top:18px'>" + title + "</h2><ul class='plain'>" + items.map(render).join("") + "</ul>" : "";
    return "<h2>Figma Design</h2><p class='sub'>Source: " + esc(f.source) + " · " + esc(f.importedAt) + "</p>" +
      "<div class='cards'>" + ncard("Colors", f.colors.length) + ncard("Typography", f.typography.length) + ncard("Spacing", f.spacing.length) + ncard("Components", f.components.length) + "</div>" +
      section("Colors", f.colors, (t) => "<li><span style='display:inline-block;width:12px;height:12px;border-radius:3px;background:" + esc(t.value) + ";margin-right:8px;vertical-align:middle'></span><code>" + esc(t.name) + "</code> = " + esc(t.value) + "</li>") +
      section("Typography", f.typography, (t) => "<li><code>" + esc(t.name) + "</code> — " + esc(t.fontFamily) + " " + (t.fontSize || "") + "</li>") +
      section("Components", f.components, (c) => "<li><span class='pill'>" + esc(c.name) + "</span> " + esc(c.type) + "</li>");
  },
  async tokens() {
    const t = await api("tokens");
    if (!t.entryCount) return "<h2>Token Usage</h2>" + empty("ria orchestrate / ria agent-pack");
    const packs = Object.entries(t.byPack || {}).sort((a, b) => b[1] - a[1]).map(([p, n]) => "<tr><td><code>" + esc(p) + "</code></td><td>" + fmt(n) + "</td></tr>").join("");
    const agents = Object.entries(t.byAgent || {}).map(([a, s]) => "<tr><td>" + esc(a) + "</td><td>" + s.entries + "</td><td>" + fmt(s.compressedTokens) + "</td><td>" + fmt(s.savedTokens) + "</td></tr>").join("");
    return "<h2>Token Usage</h2><p class='sub'>" + t.entryCount + " ledger entries</p><div class='cards'>" +
      ncard("Raw tokens", t.totalRawTokens) + ncard("Compressed", t.totalCompressedTokens, "accent") +
      ncard("Saved", t.totalSavedTokens, "good") + card("Savings", t.savingsPercent + "%", "good") + "</div>" +
      "<h2>By Pack</h2><table><tr><th>Pack</th><th>Tokens</th></tr>" + packs + "</table>" +
      "<h2 style='margin-top:20px'>By Agent</h2><table><tr><th>Agent</th><th>Entries</th><th>Compressed</th><th>Saved</th></tr>" + agents + "</table>" +
      (t.warnings || []).map((w) => "<p style='color:var(--orange);margin-top:10px'>⚠ " + esc(w) + "</p>").join("");
  },
  async security() {
    const s = await api("security");
    if (s.missing) return "<h2>Security</h2>" + empty(s.missing);
    const counts = {};
    for (const f of s.findings || []) counts[f.severity] = (counts[f.severity] || 0) + 1;
    const rows = (s.findings || []).slice(0, 100).map((f) => "<tr><td class='sev-" + esc(f.severity) + "'>" + esc(f.severity) + "</td><td>" + esc(f.rule) + "</td><td><code>" + esc(f.file) + ":" + f.line + "</code></td><td>" + esc(f.message) + "</td></tr>").join("");
    return "<h2>Security</h2><p class='sub'>" + (s.findings || []).length + " findings · scanned " + (s.scannedFiles ?? "?") + " files</p>" +
      "<div class='cards'>" + ["critical", "high", "medium", "low"].map((sev) => {
        const danger = counts[sev] && (sev === "critical" || sev === "high");
        return '<div class="card ' + (danger ? "bad sev-flash" : "") + '"><div class="v">' + (counts[sev] || 0) + '</div><div class="k">' + sev + "</div></div>";
      }).join("") + "</div>" +
      (rows ? "<table><tr><th>Severity</th><th>Rule</th><th>Location</th><th>Message</th></tr>" + rows + "</table>" : "<div class='empty'>✅ No findings.</div>");
  },
  async handoff() {
    const h = await api("handoff");
    if (h.missing) return "<h2>Handoffs</h2>" + empty(h.missing);
    const list = (title, items, mark) => items && items.length ? "<h2 style='margin-top:18px'>" + title + "</h2><ul class='plain'>" + items.map((x) => "<li>" + mark + " " + esc(x) + "</li>").join("") + "</ul>" : "";
    return "<h2>Handoffs</h2><p class='sub'>" + esc(h.id) + " · " + esc(h.createdAt) + " · from " + esc(h.agent || "?") + "</p>" +
      "<div class='chain'><b>" + esc(h.task) + "</b>" + (h.nextAction ? "<span class='hop'>→ next:</span>" + esc(h.nextAction) : "") + "</div>" +
      list("Completed", h.completed, "✅") + list("Remaining", h.remaining, "⬜") +
      list("Warnings", h.warnings, "⚠") + list("Decisions", h.decisions, "•") + list("Files to avoid", h.filesToAvoid, "🚫");
  },
  async about() {
    const p = await fetch("/api/project").then((r) => r.json());
    return "<h2>About</h2><p class='sub'>AI RIA Studio</p>" +
      "<div style='text-align:center;padding:30px 0'>" +
      (p.hasLogo ? "<img class='about-logo' src='/logo' alt='AI RIA' />" : "") +
      "<h2 style='color:var(--accent)'>AI RIA v" + esc(p.version) + "</h2>" +
      "<p class='sub'>Agent Intelligence Layer</p>" +
      "<p style='max-width:520px;margin:14px auto;color:var(--muted)'>AI RIA compresses context, preserves memory, routes agents, converts Figma into DESIGN.md, and visualizes project memory, tokens, security, and design knowledge.</p>" +
      "<p class='sub'>Project: <code>" + esc(p.root) + "</code></p>" +
      "</div>";
  },
};

/* ---------- motion (gsap; skipped under reduced-motion or when offline) ---------- */

function countUp(el) {
  const target = Number(el.dataset.count || 0);
  if (!target) return;
  const o = { v: 0 };
  gsap.to(o, { v: target, duration: 0.9, ease: "power2.out", onUpdate: () => { el.textContent = fmt(Math.round(o.v)); } });
}

function animate(route) {
  if (!motion()) return;
  const cards = document.querySelectorAll(".card");
  if (cards.length) gsap.from(cards, { opacity: 0, y: 14, duration: 0.45, stagger: 0.06, ease: "power2.out", clearProps: "all" });
  document.querySelectorAll("[data-count]").forEach(countUp);
  const nodes = document.querySelectorAll("svg.graph .gnode");
  if (nodes.length) gsap.from(nodes, { opacity: 0, scale: 0.4, transformOrigin: "center", duration: 0.5, stagger: 0.02, ease: "back.out(1.6)", clearProps: "all" });
  const rows = document.querySelectorAll("table tr");
  if (route === "routing" && rows.length) gsap.from(rows, { opacity: 0, x: -12, duration: 0.35, stagger: 0.07, ease: "power2.out", clearProps: "all" });
  const chains = document.querySelectorAll(".chain");
  if (chains.length) gsap.from(chains, { opacity: 0, y: 10, duration: 0.4, stagger: 0.08, ease: "power2.out", clearProps: "all" });
  const flash = document.querySelectorAll(".sev-flash");
  if (flash.length) gsap.fromTo(flash, { boxShadow: "0 0 0 0 rgba(248,81,73,0)" }, { boxShadow: "0 0 0 4px rgba(248,81,73,.35)", duration: 0.5, repeat: 3, yoyo: true, ease: "power1.inOut", clearProps: "boxShadow" });
}

function splash() {
  const el = $("#splash");
  if (!el) return;
  // hard guarantee: the splash never blocks the dashboard (rAF can be
  // throttled in background tabs, which would freeze the gsap timeline)
  setTimeout(() => { const s = $("#splash"); if (s) s.remove(); }, 2500);
  if (!motion()) return void el.remove();
  gsap.timeline()
    .from(el.children, { opacity: 0, y: 10, scale: 0.94, duration: 0.5, stagger: 0.12, ease: "power2.out" })
    .to(el, { opacity: 0, duration: 0.4, delay: 0.35, ease: "power1.in", onComplete: () => el.remove() });
}

/* ---------- routing ---------- */

async function render() {
  const route = (location.hash || "#/overview").slice(2);
  document.querySelectorAll("nav a").forEach((a) => a.classList.toggle("active", a.getAttribute("href") === "#/" + route));
  const page = pages[route] || pages.overview;
  try {
    $("#view").innerHTML = await page();
    animate(route);
  } catch (e) {
    $("#view").innerHTML = "<div class='empty'>Failed to load: " + esc(e.message) + "</div>";
  }
}

async function header() {
  try {
    const [p, o] = await Promise.all([fetch("/api/project").then((r) => r.json()), api("overview")]);
    $("#proj").textContent = p.name;
    $("#hstats").innerHTML =
      "<div><b>" + esc(p.name) + "</b>Project</div>" +
      "<div class='good'><b>" + (o.savingsPercent ?? 0) + "%</b>Token savings</div>" +
      "<div><b>" + (o.activeAgents ?? 0) + "</b>Active agents</div>";
  } catch { /* header is decorative */ }
}

splash();
header();
addEventListener("hashchange", render);
render();
</script>
</body>
</html>`;
