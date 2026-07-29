import { promises as fs } from "node:fs";
import path from "node:path";
import { Skill, SkillCheck, SkillEvidence, SkillResult, SkillResultSchema } from "../core/types.js";
import { scanRepo } from "../repo/scanner.js";
import { analyzeDesign } from "../design/analyzer.js";
import { scanSecurity } from "../security/scanner.js";
import { buildContextPack } from "../compression/compressor.js";
import { writeRiaFile } from "../core/paths.js";
import { skillResultToMarkdown, contextPackToMarkdown } from "../output/markdown.js";

type Runner = (root: string) => Promise<{ checks: SkillCheck[]; evidence: SkillEvidence[] }>;

interface SkillDef extends Skill {
  run: Runner;
}

const HEX_LITERAL = /#[0-9a-fA-F]{3,8}\b/g;

const uiReview: Runner = async (root) => {
  const map = await scanRepo(root);
  const design = await analyzeDesign(root, map);
  const tokenValues = new Set(design.tokens.map((t) => t.value.toLowerCase()));
  const checks: SkillCheck[] = [];
  const evidence: SkillEvidence[] = [];

  checks.push({
    name: "design-tokens-exist",
    passed: design.tokenCount > 0,
    details: design.tokenCount > 0 ? `${design.tokenCount} tokens found` : "No design tokens — define CSS custom properties",
  });
  checks.push({
    name: "design-doc-exists",
    passed: design.hasDesignDoc,
    details: design.hasDesignDoc ? `Found ${design.designDocPath}` : "No DESIGN.md — run `ria design` to generate one",
  });

  let hardcoded = 0;
  for (const c of map.components) {
    const content = await fs.readFile(path.join(map.root, c), "utf8");
    content.split("\n").forEach((line, i) => {
      for (const m of line.match(HEX_LITERAL) ?? []) {
        if (tokenValues.size && !tokenValues.has(m.toLowerCase())) {
          hardcoded++;
          if (evidence.length < 30) evidence.push({ file: c, line: i + 1, note: `Hardcoded color \`${m}\` not in token set` });
        }
      }
    });
  }
  checks.push({
    name: "no-hardcoded-colors-in-components",
    passed: hardcoded === 0,
    details: hardcoded === 0 ? "Components use tokens" : `${hardcoded} hardcoded color(s) outside the token set`,
  });
  return { checks, evidence };
};

const securityReview: Runner = async (root) => {
  const report = await scanSecurity(root);
  const critical = report.findings.filter((f) => f.severity === "critical").length;
  const high = report.findings.filter((f) => f.severity === "high").length;
  const checks: SkillCheck[] = [
    { name: "no-critical-findings", passed: critical === 0, details: `${critical} critical` },
    { name: "no-high-findings", passed: high === 0, details: `${high} high` },
    { name: "scan-coverage", passed: report.scannedFiles > 0, details: `${report.scannedFiles} files scanned` },
  ];
  const evidence: SkillEvidence[] = report.findings.slice(0, 30).map((f) => ({
    file: f.file, line: f.line, note: `[${f.severity}] ${f.rule}: ${f.message}`,
  }));
  return { checks, evidence };
};

const codeReview: Runner = async (root) => {
  const map = await scanRepo(root);
  const checks: SkillCheck[] = [];
  const evidence: SkillEvidence[] = [];
  let longFiles = 0, todos = 0, anyUsage = 0, consoleLogs = 0;

  for (const f of map.files) {
    if (![".ts", ".tsx", ".js", ".jsx"].includes(f.ext)) continue;
    if (f.lines > 300) {
      longFiles++;
      evidence.push({ file: f.path, note: `${f.lines} lines — consider splitting` });
    }
    const content = await fs.readFile(path.join(map.root, f.path), "utf8");
    content.split("\n").forEach((line, i) => {
      if (/\b(TODO|FIXME|HACK)\b/.test(line)) { todos++; if (evidence.length < 40) evidence.push({ file: f.path, line: i + 1, note: "TODO/FIXME marker" }); }
      if ((f.ext === ".ts" || f.ext === ".tsx") && /:\s*any\b/.test(line)) { anyUsage++; if (evidence.length < 40) evidence.push({ file: f.path, line: i + 1, note: "`any` type" }); }
      if (/\bconsole\.log\(/.test(line) && !/(^|\/)(cli|scripts?)\//.test(f.path)) { consoleLogs++; }
    });
  }
  checks.push({ name: "no-oversized-files", passed: longFiles === 0, details: `${longFiles} files > 300 lines` });
  checks.push({ name: "no-stale-todos", passed: todos === 0, details: `${todos} TODO/FIXME markers` });
  checks.push({ name: "no-any-types", passed: anyUsage === 0, details: `${anyUsage} \`any\` usages` });
  checks.push({ name: "no-stray-console-logs", passed: consoleLogs === 0, details: `${consoleLogs} console.log outside cli/scripts` });
  return { checks, evidence };
};

const compressSkill: Runner = async (root) => {
  const map = await scanRepo(root);
  const pack = await buildContextPack(root, map);
  await writeRiaFile(root, "context-pack.md", contextPackToMarkdown(pack));
  await writeRiaFile(root, "context-pack.json", JSON.stringify(pack, null, 2));
  const checks: SkillCheck[] = [
    { name: "context-pack-generated", passed: true, details: `${pack.files.length} files included` },
    { name: "compression-effective", passed: pack.compressionRatio < 1, details: `ratio ${pack.compressionRatio} (~${pack.totalTokens} vs ~${pack.originalTokenEstimate} tokens)` },
  ];
  const evidence: SkillEvidence[] = [
    { note: `Wrote .ria/context-pack.md and .ria/context-pack.json` },
    { note: `Token estimate: ${pack.totalTokens} compressed vs ${pack.originalTokenEstimate} raw` },
  ];
  return { checks, evidence };
};

const SKILLS: SkillDef[] = [
  {
    name: "ui-review",
    description: "Review UI code for design-system consistency.",
    input: "repository path",
    steps: ["scan repo", "extract design tokens", "scan components for hardcoded values", "compare against token set"],
    checks: ["design tokens exist", "DESIGN.md exists", "no hardcoded colors in components"],
    output: ".ria/SKILL_ui-review.md",
    run: uiReview,
  },
  {
    name: "security-review",
    description: "Run the security brain and gate on critical/high findings.",
    input: "repository path",
    steps: ["scan code, scripts, env files, agent files", "classify findings by severity"],
    checks: ["no critical findings", "no high findings", "scan coverage > 0"],
    output: ".ria/SKILL_security-review.md",
    run: securityReview,
  },
  {
    name: "code-review",
    description: "Heuristic code quality review: file size, TODOs, `any`, stray logs.",
    input: "repository path",
    steps: ["scan repo", "read source files", "apply quality heuristics"],
    checks: ["no oversized files", "no stale TODOs", "no `any` types", "no stray console.logs"],
    output: ".ria/SKILL_code-review.md",
    run: codeReview,
  },
  {
    name: "compress",
    description: "Build the compressed agent context pack.",
    input: "repository path",
    steps: ["scan repo", "select key files", "dedupe + summarize", "write context pack"],
    checks: ["context pack generated", "compression ratio < 1"],
    output: ".ria/context-pack.md + .ria/SKILL_compress.md",
    run: compressSkill,
  },
];

export function listSkills(): Skill[] {
  return SKILLS.map(({ run: _run, ...skill }) => skill);
}

export function getSkill(skillName: string): Skill | undefined {
  return listSkills().find((s) => s.name === skillName);
}

/** v0.3: run a skill and write its evidence report into .ria/. */
export async function runSkill(skillName: string, root: string): Promise<SkillResult> {
  const def = SKILLS.find((s) => s.name === skillName);
  if (!def) {
    throw new Error(`Unknown skill "${skillName}". Available: ${SKILLS.map((s) => s.name).join(", ")}`);
  }
  const { checks, evidence } = await def.run(root);
  const result: SkillResult = {
    skill: def.name,
    root: path.resolve(root),
    passed: checks.every((c) => c.passed),
    checks,
    evidence,
    outputFile: `.ria/SKILL_${def.name}.md`,
  };
  await writeRiaFile(root, `SKILL_${def.name}.md`, skillResultToMarkdown(result));
  return SkillResultSchema.parse(result);
}
