// POST { brief } -> server-sent events, one `data:` line per RunEvent, ending after run_end.
import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { runPipeline } from "@/src/core/orchestrator";
import type { RunEvent } from "@/src/core/schemas";

export const maxDuration = 300;

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { brief?: unknown } | null;
  const brief = typeof body?.brief === "string" ? body.brief.trim() : "";
  if (!brief || brief.length > 500) {
    return Response.json({ error: "brief must be a non-empty string of at most 500 characters" }, { status: 400 });
  }

  mkdirSync("runs", { recursive: true });
  const logPath = join("runs", `${new Date().toISOString().replace(/[:.]/g, "-")}.jsonl`);
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let open = true;
      const onEvent = (e: RunEvent) => {
        appendFileSync(logPath, JSON.stringify(e) + "\n");
        if (!open) return; // client went away; keep logging, stop writing to the stream
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`));
        } catch {
          open = false;
        }
      };
      try {
        await runPipeline(brief, onEvent);
      } finally {
        if (open) controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
