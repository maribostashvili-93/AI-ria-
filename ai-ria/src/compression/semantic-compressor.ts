import { estimateTokens } from "./tokenizer.js";

export interface CompressedFile {
  path: string;
  excerpt: string;
  tokens: number;
  truncated: boolean;
}

const MAX_LINES_CODE = 60;
const MAX_LINES_DOC = 40;

function compressCode(content: string, maxLines: number): { excerpt: string; truncated: boolean } {
  const lines = content.split("\n");
  const signatures: string[] = [];
  const sigRe = /^\s*(export\s+)?(default\s+)?(async\s+)?(function|const|class|interface|type|enum)\s+[A-Za-z0-9_$]+|^\s*(public|private|protected)?\s*[A-Za-z0-9_$]+\s*\([^)]*\)\s*\{/;
  for (let i = 0; i < lines.length; i++) {
    if (sigRe.test(lines[i])) signatures.push(`${lines[i].trim()}  // L${i + 1}`);
  }
  const head = lines.slice(0, Math.min(maxLines, lines.length)).join("\n");
  const sigBlock = signatures.length > 3 ? `\n\n/* signatures */\n${signatures.slice(0, 30).join("\n")}` : "";
  return { excerpt: head + sigBlock, truncated: lines.length > maxLines };
}

function compressDoc(content: string, maxLines: number): { excerpt: string; truncated: boolean } {
  const lines = content.split("\n");
  const headings = lines.filter((l) => /^#{1,4}\s/.test(l));
  const head = lines.slice(0, Math.min(maxLines, lines.length)).join("\n");
  const toc = headings.length > 3 ? `\n\n<!-- outline -->\n${headings.join("\n")}` : "";
  return { excerpt: head + toc, truncated: lines.length > maxLines };
}

/**
 * Semantic (not lossy) compression of one file: keep structure agents need —
 * exports, signatures, headings, the opening lines — drop the bulk.
 */
export function compressFile(path: string, content: string): CompressedFile {
  const isDoc = /\.(md|mdx|txt)$/i.test(path);
  const isData = /\.(json|ya?ml|toml)$/i.test(path);
  let excerpt: string;
  let truncated: boolean;

  if (isData) {
    const lines = content.split("\n");
    excerpt = lines.slice(0, MAX_LINES_DOC).join("\n");
    truncated = lines.length > MAX_LINES_DOC;
  } else if (isDoc) {
    ({ excerpt, truncated } = compressDoc(content, MAX_LINES_DOC));
  } else {
    ({ excerpt, truncated } = compressCode(content, MAX_LINES_CODE));
  }

  return { path, excerpt, tokens: estimateTokens(excerpt), truncated };
}
