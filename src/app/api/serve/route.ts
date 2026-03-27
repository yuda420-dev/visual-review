/**
 * Static file server for local HTML projects.
 * Starts an http server on a random port serving a given directory,
 * fetches the target HTML, rewrites relative src/href to absolute URLs,
 * and returns the rewritten HTML so it can be loaded as a same-origin blob.
 *
 * POST /api/serve  { dirPath, htmlFile } → { html }  — start/restart server
 * GET  /api/serve  ?htmlFile=foo.html    → { html }  — re-fetch (for auto-reload)
 * DELETE /api/serve                      → { ok }    — stop server
 */

import { NextRequest } from "next/server";
import http from "http";
import fs from "fs";
import path from "path";
import net from "net";

export const runtime = "nodejs";

// ── Module-level singleton ────────────────────────────────────────────────────
let server: http.Server | null = null;
let serverPort: number | null = null;
let serverDir: string | null = null;

const MIME: Record<string, string> = {
  html: "text/html; charset=utf-8",
  htm: "text/html; charset=utf-8",
  js: "application/javascript",
  mjs: "application/javascript",
  cjs: "application/javascript",
  css: "text/css",
  json: "application/json",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  svg: "image/svg+xml",
  ico: "image/x-icon",
  woff: "font/woff",
  woff2: "font/woff2",
  ttf: "font/ttf",
  webp: "image/webp",
  map: "application/json",
};

function mime(p: string): string {
  return MIME[p.split(".").pop()?.toLowerCase() ?? ""] ?? "application/octet-stream";
}

function freePort(start: number): Promise<number> {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.listen(start, "127.0.0.1", () => {
      const port = (s.address() as net.AddressInfo).port;
      s.close(() => resolve(port));
    });
    s.on("error", () => freePort(start + 1).then(resolve));
  });
}

function stopServer(): Promise<void> {
  return new Promise((resolve) => {
    if (!server) { resolve(); return; }
    const s = server;
    server = null; serverPort = null; serverDir = null;
    s.close(() => resolve());
    setTimeout(resolve, 1500); // force close if slow
  });
}

function startServer(dir: string, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const resolvedDir = path.resolve(dir);
    const srv = http.createServer((req, res) => {
      const url = new URL(req.url ?? "/", `http://127.0.0.1:${port}`);
      const rel = decodeURIComponent(url.pathname).replace(/^\/+/, "") || "index.html";
      const abs = path.resolve(path.join(resolvedDir, rel));

      // Prevent directory traversal
      if (!abs.startsWith(resolvedDir + path.sep) && abs !== resolvedDir) {
        res.writeHead(403); res.end("Forbidden"); return;
      }

      fs.stat(abs, (err, stat) => {
        if (err || !stat.isFile()) { res.writeHead(404); res.end(`Not found: ${rel}`); return; }
        res.writeHead(200, {
          "Content-Type": mime(abs),
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "no-cache, no-store, must-revalidate",
        });
        fs.createReadStream(abs).pipe(res);
      });
    });

    srv.listen(port, "127.0.0.1", () => {
      server = srv; serverPort = port; serverDir = resolvedDir;
      resolve();
    });
    srv.on("error", reject);
  });
}

/** Rewrite relative src/href to absolute URLs using the HTML file's URL as base */
function rewriteUrls(html: string, baseUrl: string): string {
  return html.replace(/(\bsrc="|href=")([^"]+)(")/g, (match, pre, p, post) => {
    if (/^(https?:|\/\/|data:|blob:|#)/.test(p)) return match;
    try { return `${pre}${new URL(p, baseUrl).href}${post}`; }
    catch { return match; }
  });
}

async function fetchHtml(htmlFile: string): Promise<string> {
  if (!serverPort) throw new Error("No server running");
  const url = `http://127.0.0.1:${serverPort}/${htmlFile}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${htmlFile}`);
  const raw = await res.text();
  return rewriteUrls(raw, url);
}

// ── Routes ────────────────────────────────────────────────────────────────────

// POST: start server + return rewritten HTML
export async function POST(req: NextRequest) {
  const { dirPath, htmlFile } = (await req.json()) as { dirPath: string; htmlFile: string };

  if (!dirPath || !htmlFile)
    return Response.json({ error: "dirPath and htmlFile are required" }, { status: 400 });

  const resolved = path.resolve(dirPath);
  if (!fs.existsSync(resolved))
    return Response.json({ error: `Directory not found: ${resolved}` }, { status: 404 });

  await stopServer();
  const port = await freePort(3099);
  await startServer(resolved, port);

  try {
    const html = await fetchHtml(htmlFile);
    return Response.json({ html, port });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}

// GET: re-fetch HTML from running server (auto-reload)
export async function GET(req: NextRequest) {
  const htmlFile = req.nextUrl.searchParams.get("htmlFile");
  if (!htmlFile || !serverPort)
    return Response.json({ error: "No server running or htmlFile missing" }, { status: 400 });
  try {
    const html = await fetchHtml(htmlFile);
    return Response.json({ html });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}

// DELETE: stop server
export async function DELETE() {
  await stopServer();
  return Response.json({ ok: true });
}
