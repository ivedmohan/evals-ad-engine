// pnpm watch       poll live/ every 5 seconds
// pnpm watch --once  check once and exit
import { appendFileSync, mkdirSync } from "node:fs";
import { checkAll, type CheckResult } from "./core/watchdog";
import type { RunEventInput } from "./core/schemas";

const LOG = "runs/watchdog.jsonl";
const POLL_MS = 5000;

const emit = (e: RunEventInput) => {
  mkdirSync("runs", { recursive: true });
  appendFileSync(LOG, JSON.stringify({ ...e, run_id: "watchdog", ts: new Date().toISOString() }) + "\n");
};

const LABEL = { in_sync: "in sync", edited: "edited", edited_violation: "edited + violation", missing: "missing" };
const seen = new Map<string, string>(); // ad_id -> last printed fingerprint, so the loop only prints changes

function print(r: CheckResult, force: boolean) {
  const key = `${r.status}:${r.live_fingerprint ?? ""}`;
  if (!force && seen.get(r.ad_id) === key) return;
  seen.set(r.ad_id, key);
  const level = r.level ? `  level=${r.level.toUpperCase()}` : "";
  console.log(`${new Date().toLocaleTimeString()}  ${r.ad_id}  ${LABEL[r.status]}${level}`);
  if (r.diff) {
    const d = r.diff.filter((op) => op.op !== "eq").map((op) => (op.op === "add" ? `+[${op.text}]` : `-[${op.text}]`));
    console.log(`    diff: ${d.join("  ")}`);
    for (const f of r.findings ?? []) console.log(`    ${f.rule_id} ${f.severity} "${f.quote}": ${f.reason}`);
  }
}

async function tick(force: boolean) {
  const results = await checkAll(emit);
  if (results.length === 0 && force) console.log("no approved ads yet (approve one first)");
  results.forEach((r) => print(r, force));
  return results;
}

async function main() {
  if (process.argv.includes("--once")) {
    const results = await tick(true);
    process.exit(results.some((r) => r.level === "alert") ? 1 : 0);
  }
  console.log(`watching live/ every ${POLL_MS / 1000}s (ctrl+c to stop); events -> ${LOG}`);
  await tick(true);
  setInterval(() => tick(false).catch((e) => console.error(e instanceof Error ? e.message : e)), POLL_MS);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
