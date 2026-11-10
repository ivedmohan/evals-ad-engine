// pnpm eval:e2e: run the full pipeline on evals/briefs.json and report outcome, revisions, cost and latency.
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { LIMITS } from "../src/core/config";
import { runPipeline, type RunSummary } from "../src/core/orchestrator";
import { fingerprint } from "../src/core/approve";
import { checkLiveAd } from "../src/core/watchdog";
import type { AlertLevel, ApprovedAd, Emit, RunEvent } from "../src/core/schemas";

type Brief = { id: string; brief: string };

// T4.4 tamper cases: a fixed approved compounded ad (passes on its own) is edited on the "platform".
const BASE = {
  id: "T",
  angle: "provider support",
  headline: "Weight care, guided by a provider",
  primary_text:
    "Halden Health connects you with a licensed provider who decides whether a compounded GLP-1 medication is right for you. Prescription required; eligibility determined by a licensed provider. Compounded medications are not FDA-approved.",
  cta: "Start your visit",
};
const TAMPER_CASES: { id: string; approved: typeof BASE; live: typeof BASE; expected: AlertLevel }[] = [
  {
    id: "typo_fix",
    approved: { ...BASE, primary_text: BASE.primary_text.replace("connects", "conects") },
    live: BASE,
    expected: "info",
  },
  {
    id: "superlative_added",
    approved: BASE,
    live: { ...BASE, primary_text: BASE.primary_text.replace("Halden Health connects", "Halden Health offers the best online weight care and connects") },
    expected: "warn",
  },
  {
    id: "same_as_ozempic_added",
    approved: BASE,
    live: { ...BASE, primary_text: BASE.primary_text.replace("right for you.", "right for you. Same as Ozempic, for less.") },
    expected: "alert",
  },
];

async function runTamperCases(emit: Emit) {
  return Promise.all(
    TAMPER_CASES.map(async (c) => {
      const approved: ApprovedAd = {
        ad_id: `tamper-${c.id}`,
        run_id: "eval",
        variant: c.approved,
        product_type: "compounded",
        fingerprint: fingerprint(c.approved),
        approved_at: new Date().toISOString(),
      };
      const { headline, primary_text, cta } = c.live;
      const r = await checkLiveAd(approved, { ad_id: approved.ad_id, headline, primary_text, cta }, emit);
      return { id: c.id, expected: c.expected, actual: r.level ?? "in_sync", findings: (r.findings ?? []).map((f) => `${f.rule_id}/${f.severity}`) };
    }),
  );
}

async function main() {
  const briefs: Brief[] = JSON.parse(readFileSync(join("evals", "briefs.json"), "utf8"));
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  mkdirSync("runs", { recursive: true });
  mkdirSync(join("evals", "results"), { recursive: true });
  const logPath = join("runs", `e2e-${ts}.jsonl`);
  const errors: string[] = [];

  const onEvent = (e: RunEvent) => {
    appendFileSync(logPath, JSON.stringify(e) + "\n");
    if (e.type === "error") errors.push(e.message);
  };

  const tamperEmit: Emit = (e) => onEvent({ ...e, run_id: "eval-tamper", ts: new Date().toISOString() } as RunEvent);
  const [runs, tamper] = await Promise.all([
    Promise.all(briefs.map(async (b): Promise<RunSummary & { id: string }> => ({ id: b.id, ...(await runPipeline(b.brief, onEvent)) }))),
    runTamperCases(tamperEmit),
  ]);

  console.log("brief                     finals  verdicts (revisions)              cost      time");
  for (const r of runs) {
    const v = r.finals.map((f) => `${f.variant.id}:${f.review.verdict}(${f.revisions})`).join(" ");
    console.log(`${r.id.padEnd(24)}  ${String(r.finals.length).padStart(6)}  ${v.padEnd(32)}  $${r.totalCostUsd.toFixed(4)}  ${(r.ms / 1000).toFixed(1)}s`);
  }

  const finals = runs.flatMap((r) => r.finals);
  const noBlock = finals.filter((f) => !f.review.findings.some((x) => x.severity === "block")).length;
  const avgRevisions = finals.length ? finals.reduce((a, f) => a + f.revisions, 0) / finals.length : 0;
  const cost = runs.reduce((a, r) => a + r.totalCostUsd, 0);
  const sorted = runs.map((r) => r.ms).sort((a, b) => a - b);
  const p50 = sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;

  const summary = {
    ts,
    briefs: runs.length,
    final_variants: finals.length,
    no_block_share: finals.length ? noBlock / finals.length : 0,
    avg_revisions: avgRevisions,
    total_cost_usd: cost,
    p50_latency_ms: p50,
    errors,
    tamper,
    runs,
  };
  const outPath = join("evals", "results", `e2e-${ts}.json`);
  writeFileSync(outPath, JSON.stringify(summary, null, 2) + "\n");

  console.log(`\nfinal variants with no block findings: ${noBlock}/${finals.length} (${((summary.no_block_share) * 100).toFixed(0)}%)`);
  console.log(`average revisions: ${avgRevisions.toFixed(2)}`);
  console.log(`total cost: $${cost.toFixed(4)}   p50 latency per brief: ${(p50 / 1000).toFixed(1)}s`);
  if (errors.length) console.log(`errors (${errors.length}):\n  ${errors.join("\n  ")}`);

  console.log("\ntamper case               expected  actual    findings");
  for (const t of tamper)
    console.log(`${t.id.padEnd(24)}  ${t.expected.padEnd(8)}  ${t.actual.padEnd(8)}  ${t.findings.join(", ") || "-"}${t.expected === t.actual ? "" : "   <- WRONG LEVEL"}`);
  const tamperOk = tamper.every((t) => t.expected === t.actual);
  console.log(`tamper cases: ${tamper.filter((t) => t.expected === t.actual).length}/${tamper.length} correct`);
  console.log(`results: ${outPath}\nevent log: ${logPath}`);

  // Fails if any brief produced fewer than the expected variants, or any tamper case got the wrong level.
  const variantsOk = runs.every((r) => r.finals.length === LIMITS.variantsPerRun);
  process.exit(variantsOk && tamperOk ? 0 : 1);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
