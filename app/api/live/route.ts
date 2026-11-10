// GET -> watchdog status for every approved ad. Cached by live fingerprint, so polling is free until a file changes.
import { appendFileSync, mkdirSync } from "node:fs";
import type { RunEventInput } from "@/src/core/schemas";
import { checkAll } from "@/src/core/watchdog";

const emit = (e: RunEventInput) => {
  mkdirSync("runs", { recursive: true });
  appendFileSync("runs/watchdog.jsonl", JSON.stringify({ ...e, run_id: "watchdog", ts: new Date().toISOString() }) + "\n");
};

export async function GET() {
  try {
    return Response.json(await checkAll(emit));
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
