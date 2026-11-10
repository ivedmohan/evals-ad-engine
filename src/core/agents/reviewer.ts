import { readFileSync } from "node:fs";
import { join } from "node:path";
import { AGENTS } from "../config";
import { callStructured } from "../llm";
import { adText } from "../lint";
import { ReviewerOutput, type AdVariant, type Emit, type Finding, type ProductType, type ReviewResult } from "../schemas";

const RULES_MD = readFileSync(join(process.cwd(), "RULES.md"), "utf8");

export const REVIEWER_PROMPT = `You are a compliance reviewer for US telehealth ads. The rules below are the only source of truth.

${RULES_MD}

You receive an ad's text, its product_type, and stage-1 lint hits.
1. Lint hits are candidates, not verdicts. For each one, either include it in "findings" (confirmed) or in "dismissed_lint" with a one-line reason.
2. Then find violations lint cannot see: implied FDA approval, paraphrased equivalence to a branded drug, implied guarantees or results, implied manufacturing by Halden, and missing required disclosures (R6 for every ad, R8 for compounded products).
3. Every finding has rule_id, severity, quote and a one-line reason. The quote must be copied character for character from the ad text, as short as possible while still identifying the problem. For a missing disclosure, quote the sentence where it should have appeared.
4. Severity follows the rules table: R4 is warn for superlatives and block for safety claims; R6 is block if contradicted and warn if the statement is missing.
5. R1, R2, R5 and R8 do not apply to fda_approved products. Do not invent violations; a clean ad has no findings.`;

export type ReviewOutcome = { result: ReviewResult; dismissed: ReviewerOutput["dismissed_lint"]; dropped: number; costUsd: number };

export function runReviewer(variant: AdVariant, productType: ProductType, lintFindings: Finding[], emit: Emit) {
  return reviewText(variant.id, adText(variant), productType, lintFindings, emit);
}

// Same review on raw text; used by the eval, whose golden examples are plain strings.
export async function reviewText(
  id: string,
  text: string,
  productType: ProductType,
  lintFindings: Finding[],
  emit: Emit,
): Promise<ReviewOutcome> {
  const input = {
    product_type: productType,
    ad_text: text,
    lint_hits: lintFindings.map(({ rule_id, severity, quote }) => ({ rule_id, severity, quote })),
  };
  const res = await callStructured("reviewer", REVIEWER_PROMPT, input, ReviewerOutput, AGENTS.reviewer.model, emit, {
    variantId: id,
  });
  return { ...finalizeReview(id, text, lintFindings, res.data), costUsd: res.costUsd };
}

// Pure post-processing of the reviewer's output: validate quotes, attach spans and source, compute the verdict.
export function finalizeReview(variantId: string, text: string, lintFindings: Finding[], out: ReviewerOutput) {
  const findings: Finding[] = [];
  let dropped = 0;
  for (const f of out.findings) {
    const start = f.quote ? text.indexOf(f.quote) : -1;
    if (start === -1) {
      dropped++; // quote not in the ad: drop it so the UI never highlights text that isn't there
      continue;
    }
    const end = start + f.quote.length;
    const fromLint = lintFindings.some((l) => l.rule_id === f.rule_id && l.span && start < l.span.end && end > l.span.start);
    findings.push({ ...f, source: fromLint ? "lint" : "reviewer", span: { start, end } });
  }
  return {
    result: { variant_id: variantId, verdict: verdictOf(findings), findings } satisfies ReviewResult,
    dismissed: out.dismissed_lint,
    dropped,
  };
}

export function verdictOf(findings: Finding[]): ReviewResult["verdict"] {
  if (findings.some((f) => f.severity === "block")) return "block";
  if (findings.some((f) => f.severity === "warn")) return "warn";
  return "pass";
}
