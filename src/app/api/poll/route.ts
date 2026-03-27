/**
 * GET /api/poll?dirPath=...&htmlFile=...
 * Returns the mtime (ms) of the file so the client can detect changes.
 */

import { NextRequest } from "next/server";
import fs from "fs/promises";
import path from "path";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const dirPath = req.nextUrl.searchParams.get("dirPath");
  const htmlFile = req.nextUrl.searchParams.get("htmlFile");

  if (!dirPath || !htmlFile)
    return Response.json({ error: "dirPath and htmlFile required" }, { status: 400 });

  const filePath = path.resolve(path.join(dirPath, htmlFile));

  try {
    const stat = await fs.stat(filePath);
    return Response.json({ mtime: stat.mtimeMs });
  } catch {
    return Response.json({ error: "file not found" }, { status: 404 });
  }
}
