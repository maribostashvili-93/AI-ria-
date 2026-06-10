#!/usr/bin/env node
import { Command } from "commander";
import { scanRepo } from "../repo/scanner.js";
import { generateArchitectureMd, generateFeaturesMd, generateAgentsMd, generateAgentContextMd, buildSummary } from "../repo/analyzer.js";
import { buildContextPack, compressRepoMap } from "../compression/compressor.js";
import { buildContextPackV2, contextPackV2ToMarkdown } from "../compression/context-pack-builder.js";
import { scanSecurity } from "../security/scanner.js";
import { analyzeDesign } from "../design/analyzer.js";
import { generateDesignMd } from "../design/generator.js";
import { importDesignMd, buildDesignPack } from "../design/designmd.js";
import { buildUiFixSuggestions, suggestionsToPatch, suggestionsToReport } from "../design/uifix.js";
import { listSkills, runSkill } from "../skills/registry.js";
import { FigmaClient, extractFromFigmaFile, figmaSummaryMarkdown } from "../figma/client.js";
import { compareFigmaToCode, diffToMarkdown } from "../figma/compare.js";
import { importFigmaTokens } from "../figma/figma-token-importer.js";
import { generateFigmaCode } from "../figma/figma-codegen.js";
import { addMemory, loadMemories, buildDesignMemory, loadDesignMemory, mapDesignComponent, designMemoryToMarkdown } from "../memory/memory-store.js";
import { searchMemories, hitsToMarkdown } from "../memory/memory-search.js";
import { compressMemories } from "../memory/memory-compressor.js";
import { compressConversation, conversationSummaryToMarkdown } from "../memory/conversation.js";
import { buildMemoryLayers } from "../memory/layers.js";
import { createHandoff, loadHandoff, handoffToMarkdown } from "../memory/memory-handoff.js";
import { loadIndex, rebuildIndex } from "../memory/memory-index.js";
import { buildAgentPack } from "../agentpack/agent-pack.js";
import { buildProviderPack, Provider } from "../exports/provider-packs.js";
import { writeRiaFile, readRiaFile } from "../core/paths.js";
import { toJson } from "../output/json.js";
import { repoMapToMarkdown, contextPackToMarkdown, securityToMarkdown, skillsToMarkdown } from "../output/markdown.js";
import { FigmaTokensSchema } from "../core/types.js";

const program = new Command();

program
  .name("ria")
  .description(
    "AI RIA - Git for AI context and memory.\nEnters an existing project, compresses context, keeps agent memory,\nbuilds handoffs and agent packs so the next AI agent starts informed.\nOutputs land in <path>/.ria/",
  )
  .version("0.2.0");

const done = (files: string[], extra = "") => {
  console.log(`Wrote:\n${files.map((f) => `  ${f}`).join("\n")}${extra ? `\n${extra}` : ""}`);
};
const csv = (v?: string) => (v ? v.split(",").map((s) => s.trim()).filter(Boolean) : []);

// ------------------------- repo intelligence -------------------------

program
  .command("scan")
  .description("v0.1 - scan repository -> .ria/repo-map.json + .ria/repo-summary.md")
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
  .description("Repo brain - generates the COMPLETE .ria/ knowledge folder in one run")
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
  context pack:       ~${pack.totalTokens} tokens (raw ~${pack.originalTokenEstimate}, ratio ${pack.compressionRatio})

Next steps:
  ria context build ${path}
  ria handoff create ${path} --task "..."
  ria agent-pack ${path}`);
  });

program
  .command("summary")
  .description("Print the one-screen compressed repo summary to stdout")
  .argument("[path]", "repository path", ".")
  .action(async (path: string) => {
    const map = await scanRepo(path);
    const ctx = compressRepoMap(map);
    console.log(ctx.summary);
    console.log(`\n~${ctx.tokenEstimate} tokens (raw ~${ctx.originalTokenEstimate}, ratio ${ctx.compressionRatio})`);
  });

// ------------------------- context compression -------------------------

program
  .command("compress")
  .description("v0.1 - quick compressed context -> .ria/context-pack.md + .ria/context-pack.json")
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

const context = program.command("context").description("v0.1 - Context Compression Engine");

context
  .command("build")
  .description("Ranked + semantically compressed context -> .ria/context/{context-pack.md,context-pack.json,token-report.json}")
  .argument("[path]", "repository path", ".")
  .option("--budget <tokens>", "token budget", "12000")
  .option("--json", "also print the token report as JSON")
  .action(async (path: string, opts: { budget: string; json?: boolean }) => {
    const map = await scanRepo(path);
    const pack = await buildContextPackV2(path, map, Number(opts.budget) || 12000);
    const files = [
      await writeRiaFile(path, "context/context-pack.md", contextPackV2ToMarkdown(pack)),
      await writeRiaFile(path, "context/context-pack.json", toJson({ summary: pack.summary, files: pack.files })),
      await writeRiaFile(path, "context/token-report.json", toJson(pack.report)),
    ];
    const r = pack.report;
    done(files, `  ~${r.compressedTokens} tokens vs ~${r.rawTokens} raw (ratio ${r.compressionRatio}) | kept ${r.includedFiles.length}, excluded ${r.excludedFiles.length}`);
    if (opts.json) console.log(toJson(r));
  });

// ------------------------- agent memory -------------------------

const memory = program.command("memory").description("v0.1 - Persistent Agent Memory (project-scoped, agent-neutral; inspired by claude-mem)");

memory
  .command("add")
  .description("Add a memory -> .ria/memory/memories.jsonl + memory-index.json")
  .argument("[path]", "repository path", ".")
  .requiredOption("--title <title>", "what to remember")
  .option("--content <content>", "details / why")
  .option("--type <type>", "decision | task | design-rule | architecture-note | warning | security-note | figma-note", "decision")
  .option("--files <files>", "comma-separated related files")
  .option("--tags <tags>", "comma-separated tags")
  .option("--agent <agent>", "which agent is remembering (claude, cursor, codex, ...)")
  .option("--json", "print the saved entry as JSON")
  .action(async (path: string, opts: { title: string; content?: string; type?: string; files?: string; tags?: string; agent?: string; json?: boolean }) => {
    const entry = await addMemory(path, { title: opts.title, content: opts.content, type: opts.type as never, files: csv(opts.files), tags: csv(opts.tags), agent: opts.agent });
    console.log(`Saved ${entry.id} [${entry.type}] ${entry.title}`);
    if (opts.json) console.log(toJson(entry));
  });

memory
  .command("search")
  .description("Search project memory by topic")
  .argument("<path>", "repository path")
  .argument("<query>", "topic, e.g. \"product cards\"")
  .option("--limit <n>", "max results", "10")
  .option("--json", "print hits as JSON")
  .action(async (path: string, query: string, opts: { limit: string; json?: boolean }) => {
    const hits = await searchMemories(path, query, Number(opts.limit) || 10);
    console.log(opts.json ? toJson(hits) : hitsToMarkdown(query, hits));
  });

memory
  .command("list")
  .description("List the memory index")
  .argument("[path]", "repository path", ".")
  .option("--json", "print as JSON")
  .action(async (path: string, opts: { json?: boolean }) => {
    const index = (await loadIndex(path)) ?? (await rebuildIndex(path, await loadMemories(path)));
    if (opts.json) return void console.log(toJson(index));
    console.log(`${index.count} memories (${Object.entries(index.byType).map(([t, n]) => `${t}: ${n}`).join(", ") || "empty"})`);
    for (const e of index.entries) console.log(`  ${e.id} [${e.type}] ${e.title}`);
  });

memory
  .command("short")
  .description("Short memory - compressed essentials -> .ria/memory/short-memory.md (+ working-memory.md)")
  .argument("[path]", "repository path", ".")
  .action(async (path: string) => {
    const layers = await buildMemoryLayers(path);
    done([
      await writeRiaFile(path, "memory/short-memory.md", layers.short),
      await writeRiaFile(path, "memory/working-memory.md", layers.working),
    ]);
    console.log(layers.short);
  });

memory
  .command("deep")
  .description("Deep memory - full history -> .ria/memory/deep-memory.md")
  .argument("[path]", "repository path", ".")
  .action(async (path: string) => {
    const layers = await buildMemoryLayers(path);
    done([await writeRiaFile(path, "memory/deep-memory.md", layers.deep)]);
  });

memory
  .command("compress")
  .description("Distill all memories -> .ria/memory/summary.md (decisions kept, noise dropped)")
  .argument("[path]", "repository path", ".")
  .option("--json", "also print the pack as JSON")
  .action(async (path: string, opts: { json?: boolean }) => {
    const pack = await compressMemories(path);
    done([await writeRiaFile(path, "memory/summary.md", pack.markdown)], `  ${pack.entryCount} entries -> ~${pack.tokenEstimate} tokens (raw ~${pack.originalTokenEstimate}, ratio ${pack.compressionRatio})`);
    if (opts.json) console.log(toJson(pack));
  });

memory
  .command("compress-conversation")
  .description("Compress an agent conversation log -> .ria/memory/conversation-summary.md (+ saves decisions/warnings as memories)")
  .argument("<path>", "repository path")
  .argument("<conversationFile>", "conversation text/markdown file")
  .option("--no-save", "do not save extracted decisions/warnings as memories")
  .option("--agent <agent>", "which agent the conversation belongs to")
  .action(async (path: string, conversationFile: string, opts: { save: boolean; agent?: string }) => {
    const summary = await compressConversation(conversationFile);
    const markdown = conversationSummaryToMarkdown(summary);
    let saved = 0;
    if (opts.save) {
      for (const d of summary.decisions.slice(0, 10)) {
        await addMemory(path, { type: "decision", title: d, tags: ["conversation"], agent: opts.agent });
        saved++;
      }
      for (const w of summary.warnings.slice(0, 10)) {
        await addMemory(path, { type: "warning", title: w, tags: ["conversation"], agent: opts.agent });
        saved++;
      }
    }
    done([await writeRiaFile(path, "memory/conversation-summary.md", markdown)],
      `  ~${summary.rawTokenEstimate} tokens -> ~${summary.compressedTokenEstimate} (ratio ${summary.compressionRatio}) | decisions=${summary.decisions.length}, warnings=${summary.warnings.length}, saved=${saved}`);
  });

// ------------------------- handoff -------------------------

const handoff = program.command("handoff").description("v0.1 - Agent Handoff Protocol: the next agent resumes without rereading everything");

handoff
  .command("create")
  .description("Create .ria/handoffs/{latest-handoff.json,HANDOFF.md}; memory and design rules injected automatically")
  .argument("[path]", "repository path", ".")
  .requiredOption("--task <task>", "the task being handed off")
  .option("--completed <items>", "comma-separated completed items")
  .option("--remaining <items>", "comma-separated remaining items")
  .option("--changed <files>", "comma-separated changed files")
  .option("--avoid <files>", "comma-separated files to avoid")
  .option("--risks <items>", "comma-separated risks / safety notes")
  .option("--warnings <items>", "comma-separated warnings")
  .option("--next-action <action>", "next recommended action")
  .option("--agent <agent>", "agent handing off")
  .option("--next-agent <agent>", "agent expected to continue")
  .option("--json", "print the handoff as JSON")
  .action(async (path: string, opts: { task: string; completed?: string; remaining?: string; changed?: string; avoid?: string; risks?: string; warnings?: string; nextAction?: string; agent?: string; nextAgent?: string; json?: boolean }) => {
    const { handoff: h, file } = await createHandoff(path, {
      task: opts.task,
      agent: opts.agent,
      nextAgent: opts.nextAgent,
      completed: csv(opts.completed),
      remaining: csv(opts.remaining),
      changedFiles: csv(opts.changed),
      filesToAvoid: csv(opts.avoid),
      risks: csv(opts.risks),
      warnings: csv(opts.warnings),
      nextAction: opts.nextAction,
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
    const h = await loadHandoff(path, opts.id);
    if (!h) {
      console.error("No handoff found. Run `ria handoff create` first.");
      process.exitCode = 1;
      return;
    }
    console.log(opts.json ? toJson(h) : handoffToMarkdown(h));
  });

// ------------------------- agent pack + provider exports -------------------------

program
  .command("agent-pack")
  .description("THE file the next agent reads -> .ria/agent-pack/AGENT_PACK.md (+ agent-pack.json)")
  .argument("[path]", "repository path", ".")
  .action(async (path: string) => {
    const { data, files } = await buildAgentPack(path);
    done(files, `  ~${data.tokens} tokens, ${data.sections.length} sections${data.missing.length ? `, missing: ${data.missing.length} input(s)` : ""}`);
    for (const m of data.missing) console.log(`  missing: ${m}`);
  });

program
  .command("pack")
  .description("Provider export packs with per-agent token budgets -> .ria/exports/<PROVIDER>_CONTEXT.md")
  .argument("<provider>", "claude | cursor | codex | compact")
  .argument("[path]", "repository path", ".")
  .action(async (provider: string, path: string) => {
    if (!["claude", "cursor", "codex", "compact"].includes(provider)) {
      console.error(`Unknown provider "${provider}". Use: claude, cursor, codex, compact.`);
      process.exitCode = 1;
      return;
    }
    const result = await buildProviderPack(path, provider as Provider);
    done([result.file], `  ~${result.tokens}/${result.budget} tokens${result.removedSections.length ? ` | removed: ${result.removedSections.join(", ")}` : " | everything fit"}`);
  });

// ------------------------- design intelligence -------------------------

const designCmd = program
  .command("design")
  .description("v0.2 - DESIGN.md generator -> .ria/DESIGN.md (subcommands: recall, map)")
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
  .description("Recall Design Memory (builds .ria/design-memory.json if missing)")
  .argument("[path]", "repository path", ".")
  .option("--refresh", "rebuild from code tokens and design-rule memories")
  .option("--json", "print as JSON")
  .action(async (path: string, opts: { refresh?: boolean; json?: boolean }) => {
    let memoryData = opts.refresh ? null : await loadDesignMemory(path);
    if (!memoryData) {
      const report = await analyzeDesign(path);
      const designEntries = (await loadMemories(path)).filter((e) => e.type === "design-rule" || e.type === "figma-note");
      memoryData = await buildDesignMemory(path, report.tokens, designEntries);
    }
    console.log(opts.json ? toJson(memoryData) : designMemoryToMarkdown(memoryData));
  });

designCmd
  .command("map")
  .description("Map a design component to code files in Design Memory")
  .argument("<component>", "design component name (e.g. Button)")
  .argument("<files...>", "code files implementing it")
  .option("--path <path>", "repository path", ".")
  .action(async (component: string, files: string[], opts: { path: string }) => {
    const memoryData = await mapDesignComponent(opts.path, component, files);
    console.log(`${component} <-> ${memoryData.components[component].files.join(", ")}`);
  });

const designMd = program.command("design-md").description("v0.2 - DESIGN.md bridge (design.md-style structured docs)");

designMd
  .command("import")
  .description("Import a DESIGN.md into Design Memory (tokens + rules + do-not-change)")
  .argument("<path>", "repository path")
  .argument("<file>", "DESIGN.md file to import")
  .action(async (path: string, file: string) => {
    const result = await importDesignMd(path, file);
    console.log(`Imported: ${result.tokens.length} tokens, ${result.rules.length} rules (${result.doNotChange.length} do-not-change)`);
  });

program
  .command("design-pack")
  .description("v0.2 - design knowledge for UI agents -> .ria/design/DESIGN_PACK.md")
  .argument("[path]", "repository path", ".")
  .action(async (path: string) => {
    await buildDesignPack(path);
    done([`${path}/.ria/design/DESIGN_PACK.md`]);
  });

// ------------------------- figma bridge -------------------------

const figma = program.command("figma").description("v0.2 - Figma -> code bridge");

figma
  .command("connect")
  .description("Verify FIGMA_TOKEN against the Figma API")
  .action(async () => {
    const status = await new FigmaClient().connect();
    console.log(status.connected ? `OK ${status.message}` : `FAIL ${status.message}`);
    if (!status.connected) process.exitCode = 1;
  });

figma
  .command("import")
  .description("Import a local Figma export / token file -> .ria/figma/{figma-tokens.json,FIGMA_SUMMARY.md} + design memory")
  .argument("<path>", "repository path")
  .argument("<file>", "Figma export or token JSON file")
  .action(async (path: string, file: string) => {
    const { pack, files } = await importFigmaTokens(path, file);
    done(files, `  colors=${pack.colors.length}, typography=${pack.typography.length}, spacing=${pack.spacing.length}, radius=${pack.radius.length}, shadows=${pack.shadows.length}, components=${pack.components.length}`);
  });

figma
  .command("generate-code")
  .description("Starter drafts from imported tokens -> .ria/figma/generated/ (drafts, not production code)")
  .argument("[path]", "repository path", ".")
  .action(async (path: string) => {
    done(await generateFigmaCode(path));
  });

figma
  .command("extract")
  .description("Extract tokens/components -> .ria/figma-tokens.json, figma-components.json, figma-design-summary.md")
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
  .description("Compare Figma tokens vs code tokens -> .ria/FIGMA_CODE_DIFF.md")
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
    done([f1], issues ? `  ${issues} mismatch(es)` : `  consistent`);
  });

// ------------------------- skills, security, ui-fix, mcp -------------------------

program
  .command("skill")
  .description("v0.3 - run an executable agent skill -> .ria/SKILL_<name>.md")
  .argument("<name>", `skill name: ${listSkills().map((s) => s.name).join(", ")}`)
  .argument("[path]", "repository path", ".")
  .option("--json", "also print the result as JSON")
  .action(async (name: string, path: string, opts: { json?: boolean }) => {
    const result = await runSkill(name, path);
    console.log(`${result.passed ? "PASSED" : "ISSUES FOUND"} - ${result.checks.filter((c) => c.passed).length}/${result.checks.length} checks passed`);
    for (const c of result.checks) console.log(`  ${c.passed ? "+" : "-"} ${c.name}: ${c.details}`);
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
  .description("v0.3 - security brain -> .ria/SECURITY_REPORT.md + .ria/security-report.json (scan only, never executes)")
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

program
  .command("ui-fix")
  .description("v0.4 - UI patch preview -> .ria/ui-fix.patch + .ria/UI_FIX_REPORT.md (never rewrites files)")
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
    done(files, `  ${suggestions.length} suggestion(s) - preview only, no files modified`);
  });

program
  .command("mcp")
  .description("v0.1 - start the MCP server (stdio) exposing AI RIA tools to agents")
  .action(async () => {
    const { startServer } = await import("../mcp/server.js");
    await startServer();
  });

program.parseAsync(process.argv).catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
