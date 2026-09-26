import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { extname, join, normalize } from "node:path";

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".map": "application/json",
  ".json": "application/json",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".wav": "audio/wav",
  ".mp4": "video/mp4",
};

/**
 * Serve `dirs` (first match wins) on a free localhost port. Fonts need http:
 * Chromium refuses @font-face files from file:// pages.
 */
export async function serve(
  dirs: string[],
  extra?: (req: string, res: import("node:http").ServerResponse) => boolean,
): Promise<{ url: string; server: Server }> {
  const server = createServer(async (req, res) => {
    const path = decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname);
    if (extra?.(path, res)) return;
    const rel = normalize(path === "/" ? "/index.html" : path).replace(/^(\.\.[/\\])+/, "");
    for (const dir of dirs) {
      const file = join(dir, rel);
      try {
        const info = await stat(file);
        if (!info.isFile()) continue;
        res.writeHead(200, {
          "content-type": TYPES[extname(file)] ?? "application/octet-stream",
          "content-length": info.size,
          "cache-control": "no-store",
        });
        createReadStream(file).pipe(res);
        return;
      } catch {
        // try the next directory
      }
    }
    res.writeHead(404).end("not found");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("no port");
  return { url: `http://127.0.0.1:${address.port}`, server };
}
