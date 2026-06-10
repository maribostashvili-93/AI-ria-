#!/usr/bin/env node
import { Command } from "commander";
import { scanRepo } from "../repo/scanner.js";
import { generateArchitectureMd, generateFeaturesMd, generateAgentsMd, generateAgentContextMd, buildSummary } from "../repo/analyzer.js";
import { buildContextPack, compressRepoMap } from "../compression/compressor.js";
import { scanSecurity } from "../security/scanner.js";
import { analyzeDesign } from "../design/analyzer.js";
import { generateDesignMd } from "../design/generator.js";
import { buildUiFixSuggestions, suggestionsToPatch, suggestionsToReport } from "../design/uifix.js";
import { listSkills, runSkill } from "../skills/registry.js";
import { FigmaClient, extractFromFigmaFile, figmaSummaryMarkdown } from "../figma/client.js";
import { compareFigmaToCode, diffToMarkdown } from "../figma/compare.js";
import { loadIndex } from "../memory/memory-index.js";
import { writeRiaFile, readRiaFile } from "../core/paths.js";
import { toJson } from "../output/json.js";
import { repoMapToMarkdown, contextPackToMarkdown, securityToMarkdown, skillsToMarkdown } from "../output/markdown.js";
import { FigmaTokensSchema } from "../core/types.js";

const program = new Command();

program
  .name("ria")
  .description(
    "AI RIA — Runtime Intelligence Assistant.\nAn intelligence layer for AI coding agents: repository intelligence,\ncontext compression, design awareness, Figma bridging, and security checks.\nOutputs land in <path>/.ria/",
  )
  .version("0.2.0");

const done = (files: string[], extra = "") => {
  console.log(`✔ Wrote:\n${files.map((f) => `  ${f}`).join("\n")}${extra ? `\n${extra}` : ""}`);
};

program
  .command("scan")
  .description("v0.1 — scan repository → .ria/repo-map.json + .ria/repo-summary.md")
  .argument("[path]", "repository path", ".")
  .option("--json", "also print the map as JSON")
  .action(async (path: string, opts: { json?: boolean }) => {
    const map = await scanRepo(path);
    const f1 = await writeRiaFile(path, "repo-map.json", toJson(map));
    const f2 = await writeRiaFile(path, "repo-summary.md", repoMapToMarkdown(map));
    done([f1, f2], `  framework=${map.framework}, files=${map.fileCount}, routes=${map.routes.length}, components=${map.components.length}`);
    if (opts.json) console.log(toJson(map));
  });

program
  .command("analyze")
  .description("Repo brain — generates the COMPLETE .ria/ knowledge folder in one run")
  .argument("[path]", "repository path", ".")
  .action(async (path: string) => {
    const map = await scanRepo(path);
    const design = await analyzeDesign(path);
    const security = await scanSecurity(path);
    const pack = await buildContextPack(path, map);
    const files = [
      await writeRiaFile(path, "repo-map.json", toJson(map)),
      await writeRiaFile(path, "repo-summary.md", repoMapToMarkdown(map)),
      await writeRiaFile(path, "ARCHITECTURE.md", generateArchitectureMd(map)),
      await writeRiaFile(path, "FEATURES.md", generateFeaturesMd(map)),
      await writeRiaFile(path, "AGENTS.md", generateAgentsMd(map)),
      await writeRiaFile(path, "AGENT_CONTEXT.md", generateAgentContextMd(map)),
      await writeRiaFile(path, "DESIGN.md", generateDesignMd(design, map)),
      await writeRiaFile(path, "context-pack.md", contextPackToMarkdown(pack)),
      await writeRiaFile(path, "context-pack.json", toJson(pack)),
      await writeRiaFile(path, "SECURITY_REPORT.md", securityToMarkdown(security)),
      await writeRiaFile(path, "security-report.json", toJson(security)),
    ];
    const names = files.map((f) => f.split(/[\\/]/).pop()!);
    const summary = buildSummary(map, design, security, pack, [...names, "summary.json"]);
    files.push(await writeRiaFile(path, "summary.json", toJson(summary)));
    done(files);
    console.log(`
Checklist:
  framework:          ${map.framework}
  routes:             ${map.routes.length}
  components:         ${map.components.length}
  styles:             ${map.styles.length}
  design tokens:      ${design.tokenCount}
  security findings:  ${security.findings.length} (${summary.counts.criticalOrHigh} critical/high)
  context pack:       ~${pack.totalTokens} tokens (raw ≈ ${pack.originalTokenEstimate}, ratio ${pack.compressionRatio})

Tell your AI agent:
  "Before editing this project, read .ria/AGENT_CONTEXT.md, .ria/DESIGN.md
   and .ria/ARCHITECTURE.md. Follow .ria/AGENTS.md rules."`);
  });

program
  .command("compress")
  .description("v0.1 — compressed agent context → .ria/context-pack.md + .ria/context-pack.json")
  .argument("[path]", "repository path", ".")
  .option("--json", "also print the pack as JSON")
  .action(async (path: string, opts: { json?: boolean }) => {
    const map = await scanRepo(path);
    const pack = await buildContextPack(path, map);
    const f1 = await writeRiaFile(path, "context-pack.md", contextPackToMarkdown(pack));
    const f2 = await writeRiaFile(path, "context-pack.json", toJson(pack));
    done([f1, f2], `  ~${pack.totalTokens} tokens vs ~${pack.originalTokenEstimate} raw (ratio ${pack.compressionRatio})`);
    if (opts.json) console.log(toJson(pack));
  });

const designCmd = program
  .command("design")
  .description("v0.2 — DESIGN.md generator → .ria/DESIGN.md (subcommands: recall, map)")
  .argument("[path]", "repository path", ".")
  .option("--json", "also print the token report as JSON")
  .action(async (path: string, opts: { json?: boolean }) => {
    const map = await scanRepo(path);
    const report = await analyzeDesign(path);
    const f1 = await writeRiaFile(path, "DESIGN.md", generateDesignMd(report, map));
    done([f1], `  tokens=${report.tokenCount}, tailwind=${report.hasTailwindConfig}`);
    if (opts.json) console.log(toJson(report));
  });

designCmd
  .command("recall")
  .description("v0.2 — recall Design Memory (builds .ria/design-memory.json if missing)")
  .argument("[path]", "repository path", ".")
  .option("--refresh", "rebuild from code/Figma tokens even if design memory exists")
  .option("--json", "print as JSON")
  .action(async (path: string, opts: { refresh?: boolean; json?: boolean }) => {
    const { buildDesignMemory, loadDesignMemory, designMemoryToMarkdown } = await import("../memory/memory-store.js");
    let memory = opts.refresh ? null : await loadDesignMemory(path);
    if (!memory) {
      const report = await analyzeDesign(path);
      const { loadMemories } = await import("../memory/memory-store.js");
      const designEntries = (await loadMemories(path)).filter((e) => e.type === "design");
      memory = await buildDesignMemory(path, report.tokens, designEntries);
    }
    console.log(opts.json ? toJson(memory) : designMemoryToMarkdown(memory));
  });

designCmd
  .command("map")
  .description("v0.2 — map a design component to code files in Design Memory")
  .argument("<component>", "design component name (e.g. Button)")
  .argument("<files...>", "code files implementing it (e.g. button.tsx button.css)")
  .option("--path <path>", "repository path", ".")
  .action(async (component: string, files: string[], opts: { path: string }) => {
    const { mapDesignComponent } = await import("../memory/memory-store.js");
    const memory = await mapDesignComponent(opts.path, component, files);
    console.log(`✔ ${component} ↔ ${memory.components[component].files.join(", ")}`);
  });

program
  .command("skill")
  .description("v0.3 — run an executable agent skill → .ria/SKILL_<name>.md")
  .argument("<name>", `skill name: ${listSkills().map((s) => s.name).join(", ")}`)
  .argument("[path]", "repository path", ".")
  .option("--json", "also print the result as JSON")
  .action(async (name: string, path: string, opts: { json?: boolean }) => {
    const result = await runSkill(name, path);
    console.log(`${result.passed ? "✅ PASSED" : "❌ ISSUES FOUND"} — ${result.checks.filter((c) => c.passed).length}/${result.checks.length} checks passed`);
    for (const c of result.checks) console.log(`  ${c.passed ? "✔" : "✘"} ${c.name}: ${c.details}`);
    console.log(`Report: ${result.outputFile}`);
    if (opts.json) console.log(toJson(result));
    if (!result.passed) process.exitCode = 1;
  });

program
  .command("skills")
  .description("List available agent skills (input/steps/checks/output)")
  .option("--json", "print as JSON")
  .action((opts: { json?: boolean }) => {
    console.log(opts.json ? toJson(listSkills()) : skillsToMarkdown(listSkills()));
  });

program
  .command("security")
  .description("v0.3 — security brain → .ria/SECURITY_REPORT.md + .ria/security-report.json (scan only, never executes)")
  .argument("[path]", "repository path", ".")
  .option("--json", "also print the report as JSON")
  .action(async (path: string, opts: { json?: boolean }) => {
    const report = await scanSecurity(path);
    const f1 = await writeRiaFile(path, "SECURITY_REPORT.md", securityToMarkdown(report));
    const f2 = await writeRiaFile(path, "security-report.json", toJson(report));
    done([f1, f2], `  findings=${report.findings.length}`);
    if (opts.json) console.log(toJson(report));
    if (report.findings.some((f) => f.severity === "critical" || f.severity === "high")) {
      process.exitCode = 1;
    }
  });

const figma = program.command("figma").description("v0.2 — Figma → code bridge");

figma
  .command("connect")
  .description("Verify FIGMA_TOKEN against the Figma API")
  .action(async () => {
    const status = await new FigmaClient().connect();
    console.log(status.connected ? `✅ ${status.message}` : `❌ ${status.message}`);
    if (!status.connected) process.exitCode = 1;
  });

figma
  .command("extract")
  .description("Extract tokens/components → .ria/figma-tokens.json, figma-components.json, figma-design-summary.md")
  .argument("[path]", "repository path (where .ria/ is written)", ".")
  .option("--file <key>", "Figma file key (API mode, requires FIGMA_TOKEN)")
  .option("--from <json>", "local Figma JSON export (offline mode)")
  .action(async (path: string, opts: { file?: string; from?: string }) => {
    const client = new FigmaClient();
    if (!opts.file && !opts.from) {
      console.error("Provide --file <key> (API) or --from <export.json> (offline).");
      process.exitCode = 1;
      return;
    }
    const file = opts.from ? await client.loadLocalFile(opts.from) : await client.fetchFile(opts.file!);
    const { tokens, components } = extractFromFigmaFile(file);
    const files = [
      await writeRiaFile(path, "figma-tokens.json", toJson(tokens)),
      await writeRiaFile(path, "figma-components.json", toJson(components)),
      await writeRiaFile(path, "figma-design-summary.md", figmaSummaryMarkdown(tokens, components)),
    ];
    done(files, `  colors=${tokens.colors.length}, text styles=${tokens.typography.length}, components=${components.length}`);
  });

figma
  .command("compare")
  .description("Compare Figma tokens vs code tokens → .ria/FIGMA_CODE_DIFF.md")
  .argument("[path]", "repository path", ".")
  .action(async (path: string) => {
    const raw = await readRiaFile(path, "figma-tokens.json");
    if (!raw) {
      console.error("No .ria/figma-tokens.json found. Run `ria figma extract` first.");
      process.exitCode = 1;
      return;
    }
    const figmaTokens = FigmaTokensSchema.parse(JSON.parse(raw));
    const code = await analyzeDesign(path);
    const diff = compareFigmaToCode(figmaTokens, code);
    const f1 = await writeRiaFile(path, "FIGMA_CODE_DIFF.md", diffToMarkdown(diff, figmaTokens.source));
    const issues = diff.missingColorsInCode.length + diff.missingRadiiInCode.length + diff.typographyNotes.length + diff.spacingNotes.length;
    done([f1], issues ? `  ❌ ${issues} mismatch(es)` : `  ✅ consistent`);
  });

program
  .command("ui-fix")
  .description("v0.4 — UI patch preview → .ria/ui-fix.patch + .ria/UI_FIX_REPORT.md (never rewrites files)")
  .argument("[path]", "repository path", ".")
  .option("--preview", "generate preview only (default and only mode)", true)
  .action(async (path: string) => {
    const map = await scanRepo(path);
    const design = await analyzeDesign(path);
    const rawFigma = await readRiaFile(path, "figma-tokens.json");
    const figmaTokens = rawFigma ? FigmaTokensSchema.parse(JSON.parse(rawFigma)) : null;
    const suggestions = await buildUiFixSuggestions(map, design, figmaTokens);
    const files = [
      await writeRiaFile(path, "ui-fix.patch", suggestionsToPatch(suggestions)),
      await writeRiaFile(path, "UI_FIX_REPORT.md", suggestionsToReport(suggestions)),
    ];
    done(files, `  ${suggestions.length} suggestion(s) — preview only, no files modified`);
  });

const csv = (v?: string) => (v ? v.split(",").map((s) => s.trim()).filter(Boolean) : []);

const memory = program
  .command("memory")
  .description("v0.1 — Agent Memory Layer: project-scoped decisions agents share (inspired by claude-mem)");

memory
  .command("save")
  .description("Save a decision → .ria/memory/<id>.json + memory-index.json")
  .argument("[path]", "repository path", ".")
  .requiredOption("--task <task>", "what was being worked on")
  .requiredOption("--decision <decision>", "what was decided")
  .option("--reason <reason>", "why")
  .option("--type <type>", "decision | architecture | design | security | note", "decision")
  .option("--files <files>", "comma-separated affected files")
  .option("--tags <tags>", "comma-separated tags")
  .option("--agent <agent>", "which agent made the decision (claude, cursor, codex, …)")
  .option("--json", "print the saved entry as JSON")
  .action(async (path: string, opts: { task: string; decision: string; reason?: string; type?: string; files?: string; tags?: string; agent?: string; json?: boolean }) => {
    const { saveMemory } = await import("../memory/memory-store.js");
    const entry = await saveMemory(path, {
      task: opts.task,
      decision: opts.decision,
      reason: opts.reason,
      type: opts.type as never,
      files: csv(opts.files),
      tags: csv(opts.tags),
      agent: opts.agent,
    });
    console.log(`✔ Saved memory ${entry.id} [${entry.type}] — ${entry.decision}`);
    if (opts.json) console.log(toJson(entry));
  });

memory
  .command("search")
  .description("Search project memory by topic")
  .argument("<query>", "topic, e.g. \"product cards\"")
  .argument("[path]", "repository path", ".")
  .option("--limit <n>", "max results", "10")
  .option("--json", "print hits as JSON")
  .action(async (query: string, path: string, opts: { limit: string; json?: boolean }) => {
    const { searchMemories, hitsToMarkdown } = await import("../memory/memory-search.js");
    const hits = await searchMemories(path, query, Number(opts.limit) || 10);
    console.log(opts.json ? toJson(hits) : hitsToMarkdown(query, hits));
  });

memory
  .command("compress")
  .description("Distill all memories into .ria/memory-pack.md (decisions kept, noise dropped)")
  .argument("[path]", "repository path", ".")
  .option("--json", "also print the pack as JSON")
  .action(async (path: string, opts: { json?: boolean }) => {
    const { compressMemories } = await import("../memory/memory-compress.js");
    const pack = await compressMemories(path);
    const f1 = await writeRiaFile(path, "memory-pack.md", pack.markdown);
    done([f1], `  ${pack.entryCount} entries → ~${pack.tokenEstimate} tokens (raw ≈ ${pack.originalTokenEstimate}, ratio ${pack.compressionRatio})`);
    if (opts.json) console.log(toJson(pack));
  });

memory
  .command("list")
  .description("List the memory index")
  .argument("[path]", "repository path", ".")
  .option("--json", "print as JSON")
  .action(async (path: string, opts: { json?: boolean }) => {
    const index = await loadIndex(path);
    if (opts.json) return void console.log(toJson(index));
    console.log(`${index.count} memories (${Object.entries(index.byType).map(([t, n]) => `${t}: ${n}`).join(", ") || "empty"})`);
    for (const e of index.entries) console.log(`  ${e.id} [${e.type}] ${e.decision}`);
  });

const handoff = program
  .command("handoff")
  .description("v0.1 — Agent Handoff Protocol: task-scoped memory view so the next agent resumes losslessly");

handoff
  .command("create")
  .description("Create .ria/handoffs/<id>.json (+ latest.json); recent decisions/design rules injected automatically")
  .argument("[path]", "repository path", ".")
  .requiredOption("--task <task>", "the task being handed off")
  .option("--completed <items>", "comma-separated completed items")
  .option("--remaining <items>", "comma-separated remaining items")
  .option("--warnings <items>", "comma-separated warnings (e.g. \"Do not edit payment.js\")")
  .option("--agent <agent>", "agent handing off")
  .option("--json", "print the handoff as JSON")
  .action(async (path: string, opts: { task: string; completed?: string; remaining?: string; warnings?: string; agent?: string; json?: boolean }) => {
    const { createHandoff } = await import("../memory/memory-handoff.js");
    const { handoff: h, file } = await createHandoff(path, {
      task: opts.task,
      agent: opts.agent,
      completed: csv(opts.completed),
      remaining: csv(opts.remaining),
      warnings: csv(opts.warnings),
    });
    done([file], `  completed=${h.completed.length}, remaining=${h.remaining.length}, warnings=${h.warnings.length}, decisions injected=${h.decisions.length}`);
    if (opts.json) console.log(toJson(h));
  });

handoff
  .command("load")
  .description("Load the latest handoff (or --id) as agent-ready markdown")
  .argument("[path]", "repository path", ".")
  .option("--id <id>", "specific handoff id")
  .option("--json", "print as JSON")
  .action(async (path: string, opts: { id?: string; json?: boolean }) => {
    const { loadHandoff, handoffToMarkdown } = await import("../memory/memory-handoff.js");
    const h = await loadHandoff(path, opts.id);
    if (!h) {
      console.error("No handoff found. Run `ria handoff create` first.");
      process.exitCode = 1;
      return;
    }
    console.log(opts.json ? toJson(h) : handoffToMarkdown(h));
  });

program
  .command("mcp")
  .description("v0.1 — start the MCP server (stdio) exposing AI RIA tools to agents")
  .action(async () => {
    const { startServer } = await import("../mcp/server.js");
    await startServer();
  });

program
  .command("summary")
  .description("Print the one-screen compressed repo summary to stdout")
  .argument("[path]", "repository path", ".")
  .action(async (path: string) => {
    const map = await scanRepo(path);
    const ctx = compressRepoMap(map);
    console.log(ctx.summary);
    console.log(`\n~${ctx.tokenEstimate} tokens (raw ≈ ${ctx.originalTokenEstimate}, ratio ${ctx.compressionRatio})`);
  });

program.parseAsync(process.argv).catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
