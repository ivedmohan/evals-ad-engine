// pnpm run:cli "<one-line brief>"
import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { approve } from "./core/approve";
import { runPipeline } from "./core/orchestrator";
import type { RunEvent } from "./core/schemas";

async function main() {
  const brief = process.argv.slice(2).filter((a) => !a.startsWith("--")).join(" ").trim();
  if (!brief) {
    console.error('usage: pnpm run:cli [--approve] "<one-line brief>"');
    process.exit(2);
  }

  mkdirSync("runs", { recursive: true });
  const logPath = join("runs", `${new Date().toISOString().replace(/[:.]/g, "-")}.jsonl`);

  const onEvent = (e: RunEvent) => {
    appendFileSync(logPath, JSON.stringify(e) + "\n");
    if (e.type === "agent_end")
      console.log(
        `  ${e.agent.padEnd(10)} ${(e.variant_id ?? "-").padEnd(2)} ${e.model}  in=${e.input_tokens} out=${e.output_tokens}  $${e.cost_usd.toFixed(5)}  ${e.ms}ms${e.attempts > 1 ? "  (retried)" : ""}`,
      );
    if (e.type === "review")
      console.log(`  review     ${e.variant_id}  round ${e.round}: ${e.result.verdict} (${e.result.findings.map((f) => `${f.rule_id}/${f.severity}`).join(", ") || "no findings"})`);
    if (e.type === "error") console.log(`  ERROR ${e.agent ?? ""} ${e.variant_id ?? ""}: ${e.message}`);
  };

  console.log(`brief: ${brief}\n`);
  const run = await runPipeline(brief, onEvent);

  if (run.brief) console.log(`\nstrategist: ${run.brief.product_category} / ${run.brief.product_type} / ${run.brief.channel}`);
  for (const f of run.finals) {
    console.log(`\n[${f.variant.id}] ${f.review.verdict.toUpperCase()}  revisions=${f.revisions}  angle: ${f.variant.angle}`);
    console.log(`  ${f.variant.headline}`);
    console.log(`  ${f.variant.primary_text}`);
    console.log(`  > ${f.variant.cta}`);
    for (const x of f.review.findings) console.log(`  - ${x.rule_id} ${x.severity} "${x.quote}": ${x.reason}`);
  }
  console.log(`\nvariants: ${run.finals.length}  total cost: $${run.totalCostUsd.toFixed(4)}  time: ${(run.ms / 1000).toFixed(1)}s`);
  console.log(`log: ${logPath}`);

  // --approve: approve every final variant that is not blocked.
  if (process.argv.includes("--approve") && run.brief) {
    for (const f of run.finals) {
      if (f.review.verdict === "block") {
        console.log(`not approved: ${f.variant.id} is blocked`);
        continue;
      }
      const a = approve(f.variant, run.brief.product_type, run.runId);
      console.log(`approved: approved/${a.ad_id}.json  live/${a.ad_id}.json  sha256=${a.fingerprint.slice(0, 12)}…`);
    }
  }
  if (run.finals.length === 0) process.exit(1);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
