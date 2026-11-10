// Offline tests for the reviewer's post-processing. No model call: the reviewer output is a hand-written fixture.
import assert from "node:assert/strict";
import { test } from "node:test";
import { finalizeReview, verdictOf } from "./agents/reviewer";
import { adText, lint } from "./lint";

const text = adText({
  headline: "Weight care, the same as Ozempic",
  primary_text: "Get started online. The best support from licensed providers.",
  cta: "Start now",
});
const lintHits = lint(text, "compounded");

test("drops findings whose quote is not in the ad text", () => {
  const { result, dropped } = finalizeReview("A", text, lintHits, {
    findings: [
      { rule_id: "R2", severity: "block", quote: "same as Ozempic", reason: "equivalence" },
      { rule_id: "R3", severity: "block", quote: "lose 20 pounds", reason: "not in ad" },
    ],
    dismissed_lint: [],
  });
  assert.equal(dropped, 1);
  assert.deepEqual(result.findings.map((f) => f.rule_id), ["R2"]);
});

test("quote match is exact (case-sensitive), so a paraphrased quote is dropped", () => {
  const { dropped } = finalizeReview("A", text, lintHits, {
    findings: [{ rule_id: "R2", severity: "block", quote: "same as ozempic", reason: "wrong case" }],
    dismissed_lint: [],
  });
  assert.equal(dropped, 1);
});

test("span points at the quoted text; source is lint when it overlaps a lint hit, reviewer otherwise", () => {
  const { result } = finalizeReview("A", text, lintHits, {
    findings: [
      { rule_id: "R2", severity: "block", quote: "same as Ozempic", reason: "equivalence" },
      { rule_id: "R8", severity: "warn", quote: "Get started online.", reason: "no compounded disclosure" },
    ],
    dismissed_lint: [],
  });
  for (const f of result.findings) assert.equal(text.slice(f.span!.start, f.span!.end), f.quote);
  assert.equal(result.findings[0].source, "lint");
  assert.equal(result.findings[1].source, "reviewer");
});

test("a dismissed lint hit does not count toward the verdict", () => {
  const { result, dismissed } = finalizeReview("A", text, lintHits, {
    findings: [],
    dismissed_lint: [{ rule_id: "R4", quote: "best", reason: "describes support, not the treatment" }],
  });
  assert.equal(result.verdict, "pass");
  assert.equal(dismissed.length, 1);
});

test("verdict: any block wins, then warn, else pass", () => {
  const f = (severity: "block" | "warn") => ({ rule_id: "R4" as const, severity, quote: "x", reason: "", source: "reviewer" as const });
  assert.equal(verdictOf([]), "pass");
  assert.equal(verdictOf([f("warn")]), "warn");
  assert.equal(verdictOf([f("warn"), f("block")]), "block");
});
