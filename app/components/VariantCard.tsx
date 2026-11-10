"use client";
import { useState } from "react";
import type { VariantState } from "@/app/lib/run-state";
import { Highlighted } from "./Highlighted";
import { VerdictBadge } from "./VerdictBadge";

const CARD_COLORS = ["bg-card-lavender", "bg-card-peach", "bg-card-ochre"];
const STAGE_LABEL = { writing: "Writing", reviewing: "Reviewing", editing: "Revising", done: "", error: "Failed" };

type ApproveCtx = { runId?: string; productType?: string; onApproved?: () => void };

export function VariantCard({ v, index, approveCtx }: { v: VariantState; index: number; approveCtx?: ApproveCtx }) {
  const latest = v.history.length - 1;
  const [picked, setPicked] = useState<number | null>(null);
  const [approval, setApproval] = useState<{ state: "idle" | "saving" | "done" | "error"; msg?: string }>({ state: "idle" });
  const finalReview = v.reviews[latest];
  const canApprove = v.stage === "done" && finalReview && finalReview.verdict !== "block" && approveCtx?.runId && approveCtx.productType;

  async function approve() {
    setApproval({ state: "saving" });
    const res = await fetch("/api/approve", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        run_id: approveCtx!.runId,
        product_type: approveCtx!.productType,
        variant: v.history[latest],
        verdict: finalReview!.verdict,
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (res.ok) {
      setApproval({ state: "done", msg: body.ad_id });
      approveCtx?.onApproved?.();
    } else setApproval({ state: "error", msg: body.error ?? `HTTP ${res.status}` });
  }
  const shown = picked ?? latest;
  const ad = v.history[shown];
  const review = v.reviews[shown];
  const findings = review?.findings ?? [];

  // Offsets into adText = headline \n primary_text \n cta, which is what finding spans index into.
  const hOff = 0;
  const pOff = ad ? ad.headline.length + 1 : 0;
  const cOff = ad ? pOff + ad.primary_text.length + 1 : 0;

  return (
    <article className={`rounded-3xl p-8 text-card-ink ${CARD_COLORS[index % CARD_COLORS.length]}`}>
      <header className="flex items-center justify-between gap-3">
        <span className="text-[12px] font-semibold uppercase tracking-[1.5px]">Variant {v.id}</span>
        {v.stage !== "done" ? (
          <span className="rounded-full bg-mark-bg px-3 py-1 text-[12px] font-medium">{STAGE_LABEL[v.stage]}</span>
        ) : review ? (
          <VerdictBadge verdict={review.verdict} />
        ) : null}
      </header>

      {v.history.length > 1 && (
        <nav className="mt-4 flex flex-wrap items-center gap-1 text-[13px]" aria-label="Revision history">
          {v.history.map((_, i) => (
            <span key={i} className="flex items-center gap-1">
              {i > 0 && <span aria-hidden>→</span>}
              <button
                onClick={() => setPicked(i)}
                className={`rounded-full px-3 py-1 font-medium ${i === shown ? "bg-mark-bg" : "hover:bg-mark-bg/50"}`}
              >
                v{i + 1}
                {v.reviews[i] && (
                  <span
                    className={`ml-1.5 inline-block h-2 w-2 rounded-full ${
                      { pass: "bg-pass", warn: "bg-warn", block: "bg-block" }[v.reviews[i].verdict]
                    }`}
                  />
                )}
              </button>
            </span>
          ))}
        </nav>
      )}

      {ad ? (
        <div className="mt-5">
          <h3 className="text-[24px] font-medium leading-tight tracking-[-0.5px]">
            <Highlighted text={ad.headline} offset={hOff} findings={findings} />
          </h3>
          <p className="mt-3 text-[15px] leading-relaxed">
            <Highlighted text={ad.primary_text} offset={pOff} findings={findings} />
          </p>
          <p className="mt-5">
            <span className="inline-block rounded-xl bg-primary px-5 py-3 text-[14px] font-semibold text-on-primary">
              <Highlighted text={ad.cta} offset={cOff} findings={findings} />
            </span>
          </p>
          <p className="mt-5 text-[12px] font-medium opacity-70">{ad.angle}</p>
          {findings.length > 0 && (
            <ul className="mt-4 space-y-1.5 border-t border-card-ink/15 pt-4 text-[13px]">
              {findings.map((f, i) => (
                <li key={i}>
                  <span className={`mr-2 font-mono text-[12px] font-semibold ${f.severity === "block" ? "text-[#991b1b]" : "text-[#92400e]"}`}>
                    {f.rule_id} {f.severity}
                  </span>
                  {f.reason}
                </li>
              ))}
            </ul>
          )}
          {!review && v.stage !== "error" && <p className="mt-4 text-[13px] opacity-70">Awaiting review</p>}
          {canApprove && (
            <div className="mt-5 border-t border-card-ink/15 pt-4">
              {approval.state === "done" ? (
                <p className="text-[13px] font-medium">Approved and live as {approval.msg}</p>
              ) : (
                <button
                  onClick={approve}
                  disabled={approval.state === "saving"}
                  className="h-10 rounded-xl bg-card-ink px-4 text-[14px] font-semibold text-white disabled:opacity-60"
                >
                  {approval.state === "saving" ? "Approving" : `Approve v${latest + 1}`}
                </button>
              )}
              {approval.state === "error" && <p className="mt-2 text-[13px] text-[#991b1b]">{approval.msg}</p>}
            </div>
          )}
        </div>
      ) : (
        <div className="mt-6 space-y-3" aria-busy>
          <div className="h-6 w-2/3 rounded-lg bg-mark-bg/50" />
          <div className="h-4 w-full rounded-lg bg-mark-bg/50" />
          <div className="h-4 w-5/6 rounded-lg bg-mark-bg/50" />
        </div>
      )}
    </article>
  );
}
