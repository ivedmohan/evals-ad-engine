// Offline tests for the watchdog's pure parts. No model calls.
import assert from "node:assert/strict";
import { test } from "node:test";
import { fingerprint, normalize } from "./approve";
import { levelOf, wordDiff } from "./watchdog";

const ad = { headline: "Weight care", primary_text: "Talk to a licensed provider.", cta: "Start" };

test("fingerprint ignores leading/trailing and repeated whitespace", () => {
  assert.equal(fingerprint(ad), fingerprint({ ...ad, primary_text: "  Talk  to a\n licensed   provider. " }));
  assert.equal(normalize("  a \n\t b  "), "a b");
});

test("fingerprint changes when a word changes", () => {
  assert.notEqual(fingerprint(ad), fingerprint({ ...ad, primary_text: "Talk to the best licensed provider." }));
});

test("wordDiff marks an inserted phrase as add, with the rest unchanged", () => {
  const d = wordDiff("Weight care for you", "Weight care for you, same as Ozempic");
  assert.deepEqual(d, [
    { op: "eq", text: "Weight care for" },
    { op: "del", text: "you" },
    { op: "add", text: "you, same as Ozempic" },
  ]);
});

test("wordDiff on a typo fix is one del and one add", () => {
  const d = wordDiff("Talk to a licensed provder today", "Talk to a licensed provider today");
  assert.deepEqual(d.filter((x) => x.op !== "eq"), [
    { op: "del", text: "provder" },
    { op: "add", text: "provider" },
  ]);
});

test("levelOf maps verdicts to alert levels", () => {
  assert.equal(levelOf("pass"), "info");
  assert.equal(levelOf("warn"), "warn");
  assert.equal(levelOf("block"), "alert");
});
