import { promises as fs } from "node:fs";
import path from "node:path";

export const RIA_DIR = ".ria";

/** Ensure `<root>/.ria/` exists and return its absolute path. */
export async function ensureRiaDir(root: string): Promise<string> {
  const dir = path.join(path.resolve(root), RIA_DIR);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

/** Write a file into `<root>/.ria/` (nested names like `context/pack.md` allowed) and return its absolute path. */
export async function writeRiaFile(root: string, name: string, content: string): Promise<string> {
  const dir = await ensureRiaDir(root);
  const file = path.join(dir, name);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, content.endsWith("\n") ? content : content + "\n", "utf8");
  return file;
}

/** Read a file from `<root>/.ria/`, or null if missing. */
export async function readRiaFile(root: string, name: string): Promise<string | null> {
  try {
    return await fs.readFile(path.join(path.resolve(root), RIA_DIR, name), "utf8");
  } catch {
    return null;
  }
}
