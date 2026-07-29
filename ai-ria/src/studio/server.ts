import { createServer, Server } from "node:http";
import { promises as fs } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { VERSION } from "../core/version.js";
import { studioData, studioDesignMemory, STUDIO_ENDPOINTS, StudioEndpoint } from "./api.js";
import { STUDIO_HTML } from "./ui.js";

export interface StudioOptions {
  port?: number;
}

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const LOGO_NAMES = ["airialogo.svg", "airialogo.png", "logo.svg", "logo.png"];

/**
 * Brand logo discovery — never hardcoded. Search order is by name
 * (airialogo.* first), looking in the AI RIA package, the repo above it
 * (monorepo layout), and finally the analyzed project's own assets/.
 */
export async function findLogo(root: string): Promise<{ file: string; type: string } | null> {
  const bases = [PACKAGE_ROOT, path.dirname(PACKAGE_ROOT), path.resolve(root)];
  for (const name of LOGO_NAMES) {
    for (const base of bases) {
      const file = path.join(base, "assets", name);
      try {
        await fs.access(file);
        return { file, type: name.endsWith(".svg") ? "image/svg+xml" : "image/png" };
      } catch { /* keep searching */ }
    }
  }
  return null;
}

function resolveGsap(): string | null {
  try {
    return createRequire(import.meta.url).resolve("gsap/dist/gsap.min.js");
  } catch {
    return null;
  }
}

/**
 * `ria studio` — local read-only dashboard over the project's `.ria/` layer.
 * One embedded HTML page + a JSON API; gsap is served from the package's own
 * node_modules so the dashboard works fully offline.
 */
export function createStudioServer(root: string): Server {
  const gsapFile = resolveGsap();
  return createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const send = (status: number, body: string | Buffer, type: string) => {
      res.writeHead(status, { "content-type": type, "cache-control": "no-store" });
      res.end(body);
    };
    try {
      if (url.pathname === "/" || url.pathname === "/index.html") {
        return send(200, STUDIO_HTML, "text/html; charset=utf-8");
      }
      if (url.pathname === "/vendor/gsap.min.js") {
        if (!gsapFile) return send(404, "// gsap not installed — studio falls back to static rendering", "text/javascript");
        return send(200, await fs.readFile(gsapFile), "text/javascript; charset=utf-8");
      }
      if (url.pathname === "/logo" || url.pathname === "/favicon.ico" || url.pathname === "/apple-touch-icon.png" || url.pathname === "/og-image.png") {
        const logo = await findLogo(root);
        if (!logo) return send(404, JSON.stringify({ error: "no logo found in assets/" }), "application/json");
        return send(200, await fs.readFile(logo.file), logo.type);
      }
      if (url.pathname === "/api/project") {
        return send(200, JSON.stringify({
          name: path.basename(path.resolve(root)),
          root: path.resolve(root),
          version: VERSION,
          hasLogo: Boolean(await findLogo(root)),
        }), "application/json");
      }
      if (url.pathname === "/api/design-memory") {
        return send(200, JSON.stringify(await studioDesignMemory(root)), "application/json");
      }
      const endpoint = url.pathname.replace(/^\/api\//, "") as StudioEndpoint;
      if (url.pathname.startsWith("/api/") && STUDIO_ENDPOINTS.includes(endpoint)) {
        return send(200, JSON.stringify(await studioData(root, endpoint)), "application/json");
      }
      send(404, JSON.stringify({ error: "not found" }), "application/json");
    } catch (e) {
      send(500, JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), "application/json");
    }
  });
}

/** Start the studio and resolve once it is listening (or reject on EADDRINUSE). */
export function startStudio(root: string, options: StudioOptions = {}): Promise<{ server: Server; port: number; url: string }> {
  const port = options.port ?? 3333;
  const server = createStudioServer(root);
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, () => {
      const actual = (server.address() as { port: number }).port;
      resolve({ server, port: actual, url: `http://localhost:${actual}` });
    });
  });
}
