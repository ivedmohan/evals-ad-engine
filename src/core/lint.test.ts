import assert from "node:assert/strict";
import { test } from "node:test";
import { lint } from "./lint";

const ids = (text: string, pt: "compounded" | "fda_approved") => lint(text, pt).map((f) => f.rule_id);

test("R1: compounded product called FDA-approved", () => {
  const text = "Compounded semaglutide that is FDA-approved and ready to ship.";
  const r1 = lint(text, "compounded").find((x) => x.rule_id === "R1");
  assert.ok(r1, "expected an R1 finding");
  assert.equal(r1.severity, "block");
  assert.equal(r1.quote, "FDA-approved");
  assert.equal(text.slice(r1.span!.start, r1.span!.end), "FDA-approved");
});

test("R2: sameness to a branded drug", () => {
  const f = lint("Same active ingredient, basically the same as Ozempic, for less.", "compounded");
  assert.ok(f.some((x) => x.rule_id === "R2" && x.quote.toLowerCase() === "ozempic"));
  assert.ok(f.some((x) => x.rule_id === "R2" && x.quote.toLowerCase() === "same as"));
});

test("R3: efficacy number and timeline", () => {
  const f = lint("Lose 20 pounds in your first month.", "fda_approved");
  assert.ok(f.some((x) => x.rule_id === "R3" && x.severity === "block"));
});

test("fda_approved product may be called FDA-approved (no R1)", () => {
  assert.ok(!ids("Finasteride is an FDA-approved treatment for hair loss.", "fda_approved").includes("R1"));
});

test("clean ad has no findings", () => {
  const clean =
    "Hair loss care, from home\nTalk to a licensed provider online about treatment options. Prescription required; eligibility determined by a licensed provider.\nStart your visit";
  assert.deepEqual(lint(clean, "fda_approved"), []);
});

test("R4 superlative is warn, safety absolute is block", () => {
  const f = lint("The best plan, with no side effects.", "fda_approved");
  assert.equal(f.find((x) => x.quote.toLowerCase() === "best")?.severity, "warn");
  assert.equal(f.find((x) => x.quote.toLowerCase() === "no side effects")?.severity, "block");
});
