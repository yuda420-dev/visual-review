import { NextRequest } from "next/server";
import { spawn } from "child_process";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const { prompt, allowEdit } = (await req.json()) as {
    prompt: string;
    allowEdit?: boolean;
  };

  if (!prompt?.trim()) {
    return new Response("prompt is required", { status: 400 });
  }

  const args = ["--print", prompt];
  if (allowEdit) args.push("--dangerously-skip-permissions");

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      // Inherit the parent process's PATH so 'claude' can be found
      const child = spawn("claude", args, {
        env: { ...process.env },
        stdio: ["ignore", "pipe", "pipe"],
      });

      child.stdout?.on("data", (chunk: Buffer) => {
        controller.enqueue(encoder.encode(chunk.toString()));
      });

      child.stderr?.on("data", (chunk: Buffer) => {
        // Forward stderr as a comment so the user can see errors
        const text = chunk.toString();
        console.error("[claude stderr]", text);
      });

      child.on("close", (code) => {
        if (code !== 0 && code !== null) {
          controller.enqueue(
            encoder.encode(`\n\n---\n⚠️ Claude exited with code ${code}`)
          );
        }
        controller.close();
      });

      child.on("error", (err) => {
        const msg =
          err.message.includes("ENOENT")
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
