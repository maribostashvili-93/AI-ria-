import { createServer, Server } from "node:http";
import path from "node:path";
import { studioData, studioDesignMemory, STUDIO_ENDPOINTS, StudioEndpoint } from "./api.js";
import { STUDIO_HTML } from "./ui.js";

export interface StudioOptions {
  port?: number;
}

/**
 * `ria studio` — local read-only dashboard over the project's `.ria/` layer.
 * One embedded HTML page + a JSON API; no build step, no extra dependencies.
 */
export function createStudioServer(root: string): Server {
  return createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const send = (status: number, body: string, type: string) => {
      res.writeHead(status, { "content-type": type, "cache-control": "no-store" });
      res.end(body);
    };
    try {
      if (url.pathname === "/" || url.pathname === "/index.html") {
        return send(200, STUDIO_HTML, "text/html; charset=utf-8");
      }
      if (url.pathname === "/api/project") {
        return send(200, JSON.stringify({ name: path.basename(path.resolve(root)), root: path.resolve(root) }), "application/json");
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
