// pnpm eval: lint + reviewer on every golden example, scored by rule ID against the labels.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { reviewText } from "../src/core/agents/reviewer";
import { AGENTS } from "../src/core/config";
import { lint } from "../src/core/lint";
import { RuleId, type Finding, type ProductType, type RunEventInput } from "../src/core/schemas";

// Rules whose labelled violations are always block-severity. R4 and R6 can be warn or block depending on
// wording, and the labels do not record severity, so they are left out of block-level recall.
const BLOCK_RULES = ["R1", "R2", "R3", "R5"] as const;
const CONCURRENCY = 6;

type Golden = { text: string; product_type: ProductType; expected_rule_ids: string[] };
type Row = {
  line: number;
  expected: string[];
  predicted: string[];
  verdict: string;
  findings: Finding[];
  dismissed_lint: { rule_id: string; quote: string; reason: string }[];
  dropped_quotes: number;
  cost_usd: number;
  error?: string;
};

async function pool<T, R>(items: T[], n: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i], i);
      }
    }),
  );
  return out;
}

const pct = (x: number | null) => (x === null ? "  n/a" : `${(x * 100).toFixed(0).padStart(4)}%`);

async function main() {
  const golden: Golden[] = readFileSync(join("evals", "golden.jsonl"), "utf8")
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l));

  let cost = 0;
  const emit = (e: RunEventInput) => {
    if (e.type === "agent_end") cost += e.cost_usd;
  };

  const started = Date.now();
  const rows: Row[] = await pool(golden, CONCURRENCY, async (g, i): Promise<Row> => {
    const id = `L${i + 1}`;
    try {
      const r = await reviewText(id, g.text, g.product_type, lint(g.text, g.product_type), emit);
      return {
        line: i + 1,
        expected: [...g.expected_rule_ids].sort(),
        predicted: [...new Set(r.result.findings.map((f) => f.rule_id))].sort(),
        verdict: r.result.verdict,
        findings: r.result.findings,
        dismissed_lint: r.dismissed,
        dropped_quotes: r.dropped,
        cost_usd: r.costUsd,
      };
    } catch (e) {
      // A failed example counts as "found nothing" so errors lower recall instead of hiding.
      return {
        line: i + 1,
        expected: [...g.expected_rule_ids].sort(),
        predicted: [],
        verdict: "error",
        findings: [],
        dismissed_lint: [],
        dropped_quotes: 0,
        cost_usd: 0,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  });

  // Per-rule precision and recall over examples.
  const perRule: Record<string, { tp: number; fp: number; fn: number; precision: number | null; recall: number | null }> = {};
  for (const rule of RuleId.options) {
    let tp = 0, fp = 0, fn = 0;
    for (const r of rows) {
      const exp = r.expected.includes(rule);
      const got = r.predicted.includes(rule);
      if (exp && got) tp++;
      else if (got) fp++;
      else if (exp) fn++;
    }
    perRule[rule] = {
      tp, fp, fn,
      precision: tp + fp ? tp / (tp + fp) : null,
      recall: tp + fn ? tp / (tp + fn) : null,
    };
  }

  const blockRows = rows.filter((r) => r.expected.some((x) => (BLOCK_RULES as readonly string[]).includes(x)));
  const blockRecall = blockRows.filter((r) => r.verdict === "block").length / blockRows.length;
  const exact = rows.filter((r) => r.expected.join(",") === r.predicted.join(",")).length;

  const result = {
    ts: new Date().toISOString(),
    reviewer_model: AGENTS.reviewer.model,
    reviewer_effort: AGENTS.reviewer.effort,
    examples: rows.length,
    exact_match: exact,
    block_recall: blockRecall,
    block_examples: blockRows.length,
    per_rule: perRule,
    total_cost_usd: cost,
    ms: Date.now() - started,
    rows,
  };
  mkdirSync(join("evals", "results"), { recursive: true });
  const outPath = join("evals", "results", `${result.ts.replace(/[:.]/g, "-")}.json`);
  writeFileSync(outPath, JSON.stringify(result, null, 2) + "\n");

  // Compact table.
  console.log(`reviewer: ${result.reviewer_model} (effort ${result.reviewer_effort})   examples: ${rows.length}\n`);
  console.log("rule   tp  fp  fn   precision  recall");
  for (const [rule, m] of Object.entries(perRule))
    console.log(`${rule.padEnd(5)} ${String(m.tp).padStart(3)} ${String(m.fp).padStart(3)} ${String(m.fn).padStart(3)}      ${pct(m.precision)}   ${pct(m.recall)}`);
  console.log(`\nblock-level recall: ${pct(blockRecall)}  (${blockRows.filter((r) => r.verdict === "block").length}/${blockRows.length} examples labelled ${BLOCK_RULES.join("/")} got verdict=block)`);
  console.log(`exact rule-set match: ${exact}/${rows.length}`);

  const misses = rows.filter((r) => r.expected.join(",") !== r.predicted.join(","));
  if (misses.length) {
    console.log("\nmismatches (line: expected -> predicted):");
    for (const r of misses)
      console.log(`  ${String(r.line).padStart(2)}: ${r.expected.join(",") || "clean"} -> ${r.predicted.join(",") || "clean"}${r.dropped_quotes ? `  (${r.dropped_quotes} quote(s) dropped)` : ""}${r.error ? `  ERROR: ${r.error}` : ""}`);
  }
  console.log(`\ncost: $${cost.toFixed(4)}   time: ${(result.ms / 1000).toFixed(1)}s`);
  console.log(`results: ${outPath}`);

  process.exit(gate(result, outPath));
}

// T2.3 regression gate. The baseline is saved by the human, never by this script.
const BASELINE = join("evals", "baseline.json");
const MAX_BLOCK_RECALL_DROP = 0.05;
const MAX_RULE_RECALL_DROP = 0.15;

function gate(cur: { block_recall: number; per_rule: Record<string, { recall: number | null }> }, outPath: string): number {
  if (!existsSync(BASELINE)) {
    console.log(`\nno baseline yet. To accept this run as the baseline, run:\n  cp ${outPath} ${BASELINE}`);
    return 0;
  }
  const base = JSON.parse(readFileSync(BASELINE, "utf8")) as typeof cur;
  const failures: string[] = [];
  const blockDrop = base.block_recall - cur.block_recall;
  if (blockDrop > MAX_BLOCK_RECALL_DROP)
    failures.push(`block-level recall ${pct(base.block_recall)} -> ${pct(cur.block_recall)} (drop ${blockDrop.toFixed(2)} > ${MAX_BLOCK_RECALL_DROP})`);
  for (const [rule, b] of Object.entries(base.per_rule)) {
    const c = cur.per_rule[rule]?.recall ?? 0;
    if (b.recall === null) continue;
    if (b.recall - c > MAX_RULE_RECALL_DROP)
      failures.push(`${rule} recall ${pct(b.recall)} -> ${pct(c)} (drop ${(b.recall - c).toFixed(2)} > ${MAX_RULE_RECALL_DROP})`);
  }
  if (failures.length) {
    console.log(`\nREGRESSION vs ${BASELINE}:`);
    failures.forEach((f) => console.log(`  - ${f}`));
    return 1;
  }
  console.log(`\nno regression vs ${BASELINE} (block recall ${pct(base.block_recall)} -> ${pct(cur.block_recall)})`);
  return 0;
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
