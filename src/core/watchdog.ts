// Compares every live ad with its approved fingerprint. On a mismatch: word diff, re-lint + re-review, tamper_detected.
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { reviewText } from "./agents/reviewer";
import { DIRS, fingerprint, normalize } from "./approve";
import { adText, lint } from "./lint";
import {
  ApprovedAd,
  LiveAd,
  type AlertLevel,
  type DiffOp,
  type Emit,
  type Finding,
  type Verdict,
} from "./schemas";

export type WatchStatus = "in_sync" | "edited" | "edited_violation" | "missing";
export type CheckResult = {
  ad_id: string;
  status: WatchStatus;
  approved: ApprovedAd;
  live?: LiveAd;
  live_fingerprint?: string;
  diff?: DiffOp[];
  verdict?: Verdict;
  findings?: Finding[];
  level?: AlertLevel;
  cost_usd?: number;
  checked_at: string;
};

// Word-level diff (LCS over whitespace-separated words).
export function wordDiff(before: string, after: string): DiffOp[] {
  const a = normalize(before).split(" ").filter(Boolean);
  const b = normalize(after).split(" ").filter(Boolean);
  const dp = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const ops: DiffOp[] = [];
  const push = (op: DiffOp["op"], word: string) => {
    const last = ops[ops.length - 1];
    if (last?.op === op) last.text += ` ${word}`;
    else ops.push({ op, text: word });
  };
  let i = 0, j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      push("eq", a[i]);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) push("del", a[i++]);
    else push("add", b[j++]);
  }
  while (i < a.length) push("del", a[i++]);
  while (j < b.length) push("add", b[j++]);
  return ops;
}

export const levelOf = (v: Verdict): AlertLevel => (v === "block" ? "alert" : v === "warn" ? "warn" : "info");

// Check one live ad against its approval. Pure apart from the reviewer call; used by the watchdog loop and the eval.
export async function checkLiveAd(approved: ApprovedAd, live: LiveAd, emit: Emit): Promise<CheckResult> {
  const fp = fingerprint(live);
  const checked_at = new Date().toISOString();
  if (fp === approved.fingerprint)
    return { ad_id: approved.ad_id, status: "in_sync", approved, live, live_fingerprint: fp, checked_at };

  const text = adText(live);
  const review = await reviewText(approved.ad_id, text, approved.product_type, lint(text, approved.product_type), emit);
  const level = levelOf(review.result.verdict);
  const diff = wordDiff(adText(approved.variant), text);
  emit({
    type: "tamper_detected",
    ad_id: approved.ad_id,
    diff,
    verdict: review.result.verdict,
    findings: review.result.findings,
    level,
  });
  return {
    ad_id: approved.ad_id,
    status: level === "info" ? "edited" : "edited_violation",
    approved,
    live,
    live_fingerprint: fp,
    diff,
    verdict: review.result.verdict,
    findings: review.result.findings,
    level,
    cost_usd: review.costUsd,
    checked_at,
  };
}

// Results are cached per ad by live fingerprint, so polling every 5s never re-reviews unchanged text.
const inflight = new Map<string, Promise<CheckResult>>();
const cachePath = (dirs: typeof DIRS, id: string) => join(dirs.approved, `${id}.check.json`);

export async function checkAll(emit: Emit, dirs = DIRS): Promise<CheckResult[]> {
  if (!existsSync(dirs.approved)) return [];
  const ids = readdirSync(dirs.approved)
    .filter((f) => f.endsWith(".json") && !f.endsWith(".check.json"))
    .map((f) => f.slice(0, -".json".length))
    .sort();

  return Promise.all(
    ids.map(async (id): Promise<CheckResult> => {
      const approved = ApprovedAd.parse(JSON.parse(readFileSync(join(dirs.approved, `${id}.json`), "utf8")));
      const livePath = join(dirs.live, `${id}.json`);
      if (!existsSync(livePath)) return { ad_id: id, status: "missing", approved, checked_at: new Date().toISOString() };

      let live: LiveAd;
      try {
        live = LiveAd.parse(JSON.parse(readFileSync(livePath, "utf8")));
      } catch {
        // A half-saved or hand-broken JSON file: report it rather than crash the loop.
        return { ad_id: id, status: "missing", approved, checked_at: new Date().toISOString() };
      }
      const fp = fingerprint(live);
      if (fp === approved.fingerprint) return { ad_id: id, status: "in_sync", approved, live, live_fingerprint: fp, checked_at: new Date().toISOString() };

      const cp = cachePath(dirs, id);
      if (existsSync(cp)) {
        const cached = JSON.parse(readFileSync(cp, "utf8")) as CheckResult;
        if (cached.live_fingerprint === fp) return cached;
      }
      const key = `${id}:${fp}`;
      if (!inflight.has(key)) {
        inflight.set(
          key,
          checkLiveAd(approved, live, emit)
            .then((r) => (writeFileSync(cp, JSON.stringify(r, null, 2) + "\n"), r))
            .finally(() => inflight.delete(key)),
        );
      }
      return inflight.get(key)!;
    }),
  );
}
