#!/usr/bin/env node
import { Command } from "commander";
import { buildAgentPack, buildDesignPack } from "../agent/packs.js";
import { buildContextPack, compressRepoMap } from "../compression/compressor.js";
import { FigmaTokensSchema } from "../core/types.js";
import { readRiaFile, writeRiaFile } from "../core/paths.js";
import { analyzeDesign } from "../design/analyzer.js";
import { generateDesignMd } from "../design/generator.js";
import { buildUiFixSuggestions, suggestionsToPatch, suggestionsToReport } from "../design/uifix.js";
import { compareFigmaToCode, diffToMarkdown } from "../figma/compare.js";
import { FigmaClient, extractFromFigmaFile, figmaSummaryMarkdown } from "../figma/client.js";
import { importFigmaData, writeImportedFigmaData } from "../figma/importer.js";
import { conversationSummaryToMarkdown, compressConversation } from "../memory/conversation.js";
import { createHandoff, handoffToMarkdown, loadHandoff } from "../memory/memory-handoff.js";
import { loadIndex } from "../memory/memory-index.js";
import { buildMemoryLayers } from "../memory/layers.js";
import { compressMemories } from "../memory/memory-compress.js";
import { searchMemories, hitsToMarkdown } from "../memory/memory-search.js";
import { buildDesignMemory, designMemoryToMarkdown, loadDesignMemory, loadMemories, mapDesignComponent, saveMemory } from "../memory/memory-store.js";
import { toJson } from "../output/json.js";
import { contextPackToMarkdown, repoMapToMarkdown, securityToMarkdown, skillsToMarkdown } from "../output/markdown.js";
import { buildSummary, generateAgentContextMd, generateAgentsMd, generateArchitectureMd, generateFeaturesMd } from "../repo/analyzer.js";
import { scanRepo } from "../repo/scanner.js";
import { scanSecurity } from "../security/scanner.js";
import { listSkills, runSkill } from "../skills/registry.js";

const program = new Command();

program
  .name("ria")
  .description(
    "AI RIA - Runtime Intelligence Assistant.\n" +
      "A shared intelligence layer for AI coding agents: repo knowledge,\n" +
      "context compression, memory, handoff, design awareness, Figma bridge,\n" +
      "and security checks. Outputs land in <path>/.ria/",
  )
  .version("0.3.0");

const done = (files: string[], extra = "") => {
  console.log(`Wrote:\n${files.map((file) => `  ${file}`).join("\n")}${extra ? `\n${extra}` : ""}`);
};

const csv = (value?: string) => (value ? value.split(",").map((item) => item.trim()).filter(Boolean) : []);

program
  .command("scan")
  .description("Scan repository -> .ria/repo-map.json + .ria/repo-summary.md")
  .argument("[path]", "repository path", ".")
  .option("--json", "also print the map as JSON")
  .action(async (path: string, opts: { json?: boolean }) => {
    const map = await scanRepo(path);
    const files = [
      await writeRiaFile(path, "repo-map.json", toJson(map)),
      await writeRiaFile(path, "repo-summary.md", repoMapToMarkdown(map)),
    ];
    done(files, `  framework=${map.framework}, files=${map.fileCount}, routes=${map.routes.length}, components=${map.components.length}`);
    if (opts.json) console.log(toJson(map));
  });

program
  .command("analyze")
  .description("Generate the complete .ria knowledge folder in one run")
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
    const names = files.map((file) => file.split(/[\\/]/).pop()!);
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
  context pack:       ~${pack.totalTokens} tokens (raw ~= ${pack.originalTokenEstimate}, ratio ${pack.compressionRatio})

Tell your AI agent:
  "Before editing this project, read .ria/AGENT_CONTEXT.md, .ria/DESIGN.md
   and .ria/ARCHITECTURE.md. Follow .ria/AGENTS.md rules."`);
  });

program
  .command("compress")
  .description("Build .ria/context-pack.md + .ria/context-pack.json")
  .argument("[path]", "repository path", ".")
  .option("--json", "also print the pack as JSON")
  .action(async (path: string, opts: { json?: boolean }) => {
    const map = await scanRepo(path);
    const pack = await buildContextPack(path, map);
    const files = [
      await writeRiaFile(path, "context-pack.md", contextPackToMarkdown(pack)),
      await writeRiaFile(path, "context-pack.json", toJson(pack)),
    ];
    done(files, `  ~${pack.totalTokens} tokens vs ~${pack.originalTokenEstimate} raw (ratio ${pack.compressionRatio})`);
    if (opts.json) console.log(toJson(pack));
  });

const context = program.command("context").description("Context workflows for next-agent handoff");

context
  .command("build")
  .description("Build the main context pack and token report")
  .argument("[path]", "repository path", ".")
  .action(async (path: string) => {
    const map = await scanRepo(path);
    const pack = await buildContextPack(path, map);
    const files = [
      await writeRiaFile(path, "context-pack.md", contextPackToMarkdown(pack)),
      await writeRiaFile(path, "context-pack.json", toJson(pack)),
      await writeRiaFile(path, "context/token-report.json", toJson({
        generatedAt: new Date().toISOString(),
        rawTokenCount: pack.originalTokenEstimate,
        compressedTokenCount: pack.totalTokens,
        compressionRatio: pack.compressionRatio,
        preserved: ["repo summary", "important files", "architecture signals"],
        removed: ["duplicate file content", "oversized files", "junk directories"],
        whyEnough: "The next agent gets the highest-value repository context without paying the full repo token cost.",
      })),
    ];
    done(files);
  });

const designCmd = program.command("design").description("Design intelligence commands");

designCmd
  .argument("[path]", "repository path", ".")
  .option("--json", "also print the token report as JSON")
  .action(async (path: string, opts: { json?: boolean }) => {
    const map = await scanRepo(path);
    const report = await analyzeDesign(path);
    const file = await writeRiaFile(path, "DESIGN.md", generateDesignMd(report, map));
    done([file], `  tokens=${report.tokenCount}, tailwind=${report.hasTailwindConfig}`);
    if (opts.json) console.log(toJson(report));
  });

designCmd
  .command("recall")
  .description("Recall design memory; build it from code/Figma if missing")
  .argument("[path]", "repository path", ".")
  .option("--refresh", "rebuild even if design-memory.json exists")
  .option("--json", "print as JSON")
  .action(async (path: string, opts: { refresh?: boolean; json?: boolean }) => {
    let memory = opts.refresh ? null : await loadDesignMemory(path);
    if (!memory) {
      const report = await analyzeDesign(path);
      const designEntries = (await loadMemories(path)).filter((entry) => entry.type === "design-rule");
      memory = await buildDesignMemory(path, report.tokens, designEntries);
    }
    console.log(opts.json ? toJson(memory) : designMemoryToMarkdown(memory));
  });

designCmd
  .command("map")
  .description("Map a design component to implementation files in design memory")
  .argument("<component>", "design component name")
  .argument("<files...>", "code files implementing it")
  .option("--path <path>", "repository path", ".")
  .action(async (component: string, files: string[], opts: { path: string }) => {
    const memory = await mapDesignComponent(opts.path, component, files);
    console.log(`Mapped ${component} -> ${memory.components[component].files.join(", ")}`);
  });

program
  .command("design-pack")
  .description("Build a compact markdown design pack for visual/code agents")
  .argument("[path]", "repository path", ".")
  .action(async (path: string) => {
    const { markdown, report } = await buildDesignPack(path);
    const files = [
      await writeRiaFile(path, "design/DESIGN_PACK.md", markdown),
      await writeRiaFile(path, "context/token-report.json", toJson(report)),
    ];
    done(files, `  ~${report.compressedTokenCount} tokens vs ~${report.rawTokenCount} raw (ratio ${report.compressionRatio})`);
  });

program
  .command("skill")
  .description("Run an executable agent skill -> .ria/SKILL_<name>.md")
  .argument("<name>", `skill name: ${listSkills().map((skill) => skill.name).join(", ")}`)
  .argument("[path]", "repository path", ".")
  .option("--json", "also print the result as JSON")
  .action(async (name: string, path: string, opts: { json?: boolean }) => {
    const result = await runSkill(name, path);
    console.log(`${result.passed ? "PASSED" : "ISSUES FOUND"} - ${result.checks.filter((check) => check.passed).length}/${result.checks.length} checks passed`);
    for (const check of result.checks) console.log(`  ${check.passed ? "OK" : "FAIL"} ${check.name}: ${check.details}`);
    console.log(`Report: ${result.outputFile}`);
    if (opts.json) console.log(toJson(result));
    if (!result.passed) process.exitCode = 1;
  });

program
  .command("skills")
  .description("List available agent skills")
  .option("--json", "print as JSON")
  .action((opts: { json?: boolean }) => {
    console.log(opts.json ? toJson(listSkills()) : skillsToMarkdown(listSkills()));
  });

program
  .command("security")
  .description("Scan the repository for secrets and unsafe patterns")
  .argument("[path]", "repository path", ".")
  .option("--json", "also print the report as JSON")
  .action(async (path: string, opts: { json?: boolean }) => {
    const report = await scanSecurity(path);
    const files = [
      await writeRiaFile(path, "SECURITY_REPORT.md", securityToMarkdown(report)),
      await writeRiaFile(path, "security-report.json", toJson(report)),
    ];
    done(files, `  findings=${report.findings.length}`);
    if (opts.json) console.log(toJson(report));
    if (report.findings.some((finding) => finding.severity === "critical" || finding.severity === "high")) process.exitCode = 1;
  });

const figma = program.command("figma").description("Figma bridge for design-aware agents");

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
  .description("Import Figma tokens/export for low-token agent use")
  .argument("[path]", "repository path", ".")
  .argument("<input>", "Figma tokens JSON or raw Figma export JSON")
  .action(async (path: string, input: string) => {
    const data = await importFigmaData(input);
    const files = await writeImportedFigmaData(path, data);
    const report = await analyzeDesign(path);
    const designEntries = (await loadMemories(path)).filter((entry) => entry.type === "design-rule");
    const memory = await buildDesignMemory(path, [...report.tokens, ...data.tokens.colors, ...data.tokens.radii, ...data.tokens.spacing], designEntries);
    files.push(
      await writeRiaFile(path, "design-memory.json", toJson(memory)),
      await writeRiaFile(path, "DESIGN.md", generateDesignMd(report, await scanRepo(path))),
    );
    done(files, `  colors=${data.tokens.colors.length}, text styles=${data.tokens.typography.length}, components=${data.components.length}`);
  });

figma
  .command("extract")
  .description("Extract tokens/components -> .ria/figma-tokens.json etc.")
  .argument("[path]", "repository path", ".")
  .option("--file <key>", "Figma file key (API mode)")
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
    const raw = await readRiaFile(path, "figma/figma-tokens.json") ?? await readRiaFile(path, "figma-tokens.json");
    if (!raw) {
      console.error("No Figma tokens found. Run `ria figma import` or `ria figma extract` first.");
      process.exitCode = 1;
      return;
    }
    const figmaTokens = FigmaTokensSchema.parse(JSON.parse(raw));
    const code = await analyzeDesign(path);
    const diff = compareFigmaToCode(figmaTokens, code);
    const file = await writeRiaFile(path, "FIGMA_CODE_DIFF.md", diffToMarkdown(diff, figmaTokens.source));
    const issues = diff.missingColorsInCode.length + diff.missingRadiiInCode.length + diff.typographyNotes.length + diff.spacingNotes.length;
    done([file], issues ? `  mismatches=${issues}` : "  consistent");
  });

program
  .command("agent-pack")
  .description("Build the main compressed file another agent should read before editing")
  .argument("[path]", "repository path", ".")
  .action(async (path: string) => {
    const { markdown, report } = await buildAgentPack(path);
    const files = [
      await writeRiaFile(path, "agent-pack/AGENT_PACK.md", markdown),
      await writeRiaFile(path, "context/token-report.json", toJson(report)),
    ];
    done(files, `  ~${report.compressedTokenCount} tokens vs ~${report.rawTokenCount} raw (ratio ${report.compressionRatio})`);
  });

program
  .command("ui-fix")
  .description("Build a UI patch preview -> .ria/ui-fix.patch + .ria/UI_FIX_REPORT.md")
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
    done(files, `  suggestions=${suggestions.length} (preview only, no files modified)`);
  });

const memory = program.command("memory").description("Project-scoped memory for multi-agent workflows");

const saveMemoryAction = async (path: string, opts: { task: string; decision: string; reason?: string; type?: string; files?: string; tags?: string; agent?: string; json?: boolean }) => {
  const entry = await saveMemory(path, {
    task: opts.task,
    decision: opts.decision,
    reason: opts.reason,
    type: opts.type,
    files: csv(opts.files),
    tags: csv(opts.tags),
    agent: opts.agent,
  });
  console.log(`Saved memory ${entry.id} [${entry.type}] - ${entry.title}`);
  if (opts.json) console.log(toJson(entry));
};

memory
  .command("add")
  .description("Save a project memory entry")
  .argument("[path]", "repository path", ".")
  .requiredOption("--task <task>", "what was being worked on")
  .requiredOption("--decision <decision>", "what was decided")
  .option("--reason <reason>", "why")
  .option("--type <type>", "decision | architecture | design | security | note", "decision")
  .option("--files <files>", "comma-separated affected files")
  .option("--tags <tags>", "comma-separated tags")
  .option("--agent <agent>", "which agent made the decision")
  .option("--json", "print the saved entry as JSON")
  .action(saveMemoryAction);

memory
  .command("save")
  .description("Save a decision -> .ria/memory/memories.jsonl + index")
  .argument("[path]", "repository path", ".")
  .requiredOption("--task <task>", "what was being worked on")
  .requiredOption("--decision <decision>", "what was decided")
  .option("--reason <reason>", "why")
  .option("--type <type>", "decision | architecture | design | security | note", "decision")
  .option("--files <files>", "comma-separated affected files")
  .option("--tags <tags>", "comma-separated tags")
  .option("--agent <agent>", "which agent made the decision")
  .option("--json", "print the saved entry as JSON")
  .action(saveMemoryAction);

memory
  .command("search")
  .description("Search project memory by topic")
  .argument("<query>", "topic")
  .argument("[path]", "repository path", ".")
  .option("--limit <n>", "max results", "10")
  .option("--json", "print hits as JSON")
  .action(async (query: string, path: string, opts: { limit: string; json?: boolean }) => {
    const hits = await searchMemories(path, query, Number(opts.limit) || 10);
    console.log(opts.json ? toJson(hits) : hitsToMarkdown(query, hits));
  });

memory
  .command("compress")
  .description("Distill all memories into .ria/memory-pack.md")
  .argument("[path]", "repository path", ".")
  .option("--json", "also print the pack as JSON")
  .action(async (path: string, opts: { json?: boolean }) => {
    const pack = await compressMemories(path);
    const file = await writeRiaFile(path, "memory-pack.md", pack.markdown);
    done([file], `  ${pack.entryCount} entries -> ~${pack.tokenEstimate} tokens (raw ~= ${pack.originalTokenEstimate}, ratio ${pack.compressionRatio})`);
    if (opts.json) console.log(toJson(pack));
  });

memory
  .command("compress-conversation")
  .description("Compress a long agent conversation into reusable memory artifacts")
  .argument("[path]", "repository path", ".")
  .argument("<conversationFile>", "path to conversation text/markdown/json export")
  .action(async (path: string, conversationFile: string) => {
    const summary = await compressConversation(conversationFile);
    const files = [
      await writeRiaFile(path, "memory/conversation-summary.json", toJson(summary)),
      await writeRiaFile(path, "memory/conversation-summary.md", conversationSummaryToMarkdown(summary)),
    ];
    done(files, `  ~${summary.compressedTokenEstimate} tokens vs ~${summary.rawTokenEstimate} raw (ratio ${summary.compressionRatio})`);
  });

memory
  .command("short")
  .description("Generate short memory for low-token daily agent use")
  .argument("[path]", "repository path", ".")
  .action(async (path: string) => {
    const layers = await buildMemoryLayers(path);
    done([await writeRiaFile(path, "memory/short-memory.md", layers.short)]);
  });

memory
  .command("working")
  .description("Generate working memory for the active task and recent changes")
  .argument("[path]", "repository path", ".")
  .action(async (path: string) => {
    const layers = await buildMemoryLayers(path);
    done([await writeRiaFile(path, "memory/working-memory.md", layers.working)]);
  });

memory
  .command("deep")
  .description("Generate deep memory with broader project history")
  .argument("[path]", "repository path", ".")
  .action(async (path: string) => {
    const layers = await buildMemoryLayers(path);
    done([await writeRiaFile(path, "memory/deep-memory.md", layers.deep)]);
  });

memory
  .command("list")
  .description("List the memory index")
  .argument("[path]", "repository path", ".")
  .option("--json", "print as JSON")
  .action(async (path: string, opts: { json?: boolean }) => {
    const index = await loadIndex(path);
    if (!index) {
      console.log("No memories saved yet.");
      return;
    }
    if (opts.json) {
      console.log(toJson(index));
      return;
    }
    console.log(`${index.count} memories (${Object.entries(index.byType).map(([type, count]) => `${type}: ${count}`).join(", ") || "empty"})`);
    for (const entry of index.entries) console.log(`  ${entry.id} [${entry.type}] ${entry.title}`);
  });

const handoff = program.command("handoff").description("Task-scoped handoff between agents");

handoff
  .command("create")
  .description("Create .ria/handoffs/latest.json (+ task-specific file)")
  .argument("[path]", "repository path", ".")
  .requiredOption("--task <task>", "the task being handed off")
  .option("--completed <items>", "comma-separated completed items")
  .option("--remaining <items>", "comma-separated remaining items")
  .option("--warnings <items>", "comma-separated warnings")
  .option("--files <items>", "comma-separated changed files")
  .option("--avoid <items>", "comma-separated files to avoid")
  .option("--risks <items>", "comma-separated risks")
  .option("--next-action <text>", "next recommended action")
  .option("--agent <agent>", "agent handing off")
  .option("--next-agent <agent>", "agent expected to continue")
  .option("--json", "print the handoff as JSON")
  .action(async (path: string, opts: { task: string; completed?: string; remaining?: string; warnings?: string; files?: string; avoid?: string; risks?: string; nextAction?: string; agent?: string; nextAgent?: string; json?: boolean }) => {
    const { handoff, file } = await createHandoff(path, {
      task: opts.task,
      agent: opts.agent,
      nextAgent: opts.nextAgent,
      completed: csv(opts.completed),
      remaining: csv(opts.remaining),
      warnings: csv(opts.warnings),
      changedFiles: csv(opts.files),
      filesToAvoid: csv(opts.avoid),
      risks: csv(opts.risks),
      nextAction: opts.nextAction,
    });
    const summaryFile = await writeRiaFile(path, "handoffs/HANDOFF.md", handoffToMarkdown(handoff));
    done([file, summaryFile], `  completed=${handoff.completed.length}, remaining=${handoff.remaining.length}, warnings=${handoff.warnings.length}, decisions=${handoff.decisions.length}`);
    if (opts.json) console.log(toJson(handoff));
  });

handoff
  .command("load")
  .description("Load the latest handoff (or --id) as agent-ready markdown")
  .argument("[path]", "repository path", ".")
  .option("--id <id>", "specific handoff id")
  .option("--json", "print as JSON")
  .action(async (path: string, opts: { id?: string; json?: boolean }) => {
    const handoff = await loadHandoff(path, opts.id);
    if (!handoff) {
      console.error("No handoff found. Run `ria handoff create` first.");
      process.exitCode = 1;
      return;
    }
    console.log(opts.json ? toJson(handoff) : handoffToMarkdown(handoff));
  });

program
  .command("mcp")
  .description("Start the MCP server (stdio) exposing AI RIA tools to agents")
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
    console.log(`\n~${ctx.tokenEstimate} tokens (raw ~= ${ctx.originalTokenEstimate}, ratio ${ctx.compressionRatio})`);
  });

program.parseAsync(process.argv).catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
