import { NextRequest } from "next/server";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";

export const runtime = "nodejs";

function readContext(filePath?: string): string {
  const parts: string[] = [];

  // Always load development rules
  try {
    const devRules = fs.readFileSync(
      path.join(os.homedir(), "orginize/knowledge/development-rules.md"),
      "utf-8"
    );
    parts.push(`=== DEVELOPMENT RULES ===\n${devRules}`);
  } catch { /* ignore */ }

  // Load RR specialist context when working on the RR dashboard
  if (filePath?.includes("/RR/")) {
    try {
      const specialist = fs.readFileSync(
        path.join(os.homedir(), "projects/apps/ai-talent-agency/agents/risk-reports-specialist.md"),
        "utf-8"
      );
      parts.push(`=== RR RISK REPORTS SPECIALIST CONTEXT ===\n${specialist}`);
    } catch { /* ignore */ }
  }

  return parts.join("\n\n");
}

export async function POST(req: NextRequest) {
  const { prompt, allowEdit, filePath } = (await req.json()) as {
    prompt: string;
    allowEdit?: boolean;
    filePath?: string;
  };

  if (!prompt?.trim()) {
    return new Response("prompt is required", { status: 400 });
  }

  const context = readContext(filePath);
  const fullPrompt = context
    ? `${context}\n\n=== USER REQUEST ===\n${prompt}`
    : prompt;

  const args = ["--print", fullPrompt];
  if (allowEdit) args.push("--dangerously-skip-permissions");

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const child = spawn("claude", args, {
        env: { ...process.env },
        stdio: ["ignore", "pipe", "pipe"],
      });

      child.stdout?.on("data", (chunk: Buffer) => {
        controller.enqueue(encoder.encode(chunk.toString()));
      });

      child.stderr?.on("data", (chunk: Buffer) => {
        console.error("[claude stderr]", chunk.toString());
      });

      child.on("close", (code) => {
        if (code !== 0 && code !== null) {
          controller.enqueue(encoder.encode(`\n\n---\n⚠️ Claude exited with code ${code}`));
        }
        controller.close();
      });

      child.on("error", (err) => {
        const msg = err.message.includes("ENOENT")
          ? "⚠️ 'claude' command not found. Make sure Claude Code is installed and in your PATH."
          : `⚠️ Error: ${err.message}`;
        controller.enqueue(encoder.encode(msg));
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
      "X-Accel-Buffering": "no",
    },
  });
}
