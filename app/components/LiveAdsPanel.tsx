"use client";
// "Live ads": every approved ad, its watchdog status, the word diff, and new findings highlighted inline.
import { useEffect, useState } from "react";
import type { CheckResult } from "@/src/core/watchdog";
import { Highlighted } from "./Highlighted";

const POLL_MS = 5000;

const STATUS = {
  in_sync: { label: "In sync", cls: "bg-pass text-white" },
  edited: { label: "Edited", cls: "bg-surface-strong text-ink" },
  edited_violation: { label: "Edited + violation", cls: "bg-block text-white" },
  missing: { label: "Missing or unreadable", cls: "bg-warn text-white" },
} as const;

const LEVEL_CLS = { info: "text-muted", warn: "text-warn", alert: "text-block" };

function LiveAdCard({ r }: { r: CheckResult }) {
  const ad = r.live ?? r.approved.variant;
  const findings = r.findings ?? [];
  const pOff = ad.headline.length + 1;
  const cOff = pOff + ad.primary_text.length + 1;
  const s = r.status === "edited_violation" && r.level === "warn" ? { ...STATUS.edited_violation, cls: "bg-warn text-white" } : STATUS[r.status];
  return (
    <article className="rounded-2xl border border-hairline bg-canvas p-6">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-mono text-[12px] text-muted">{r.ad_id}</span>
        <span className="flex items-center gap-2">
          {r.level && <span className={`font-mono text-[12px] font-semibold uppercase ${LEVEL_CLS[r.level]}`}>level {r.level}</span>}
          <span className={`rounded-full px-3 py-1 text-[12px] font-semibold ${s.cls}`}>{s.label}</span>
        </span>
      </header>

      <h3 className="mt-4 text-[18px] font-semibold text-ink">
        <Highlighted text={ad.headline} offset={0} findings={findings} />
      </h3>
      <p className="mt-2 text-[14px] leading-relaxed text-body">
        <Highlighted text={ad.primary_text} offset={pOff} findings={findings} />
      </p>
      <p className="mt-2 text-[13px] font-semibold text-ink">
        <Highlighted text={ad.cta} offset={cOff} findings={findings} />
      </p>

      {r.diff && (
        <div className="mt-4 rounded-xl bg-surface-soft p-4">
          <p className="mb-2 text-[12px] font-semibold uppercase tracking-[1.5px] text-muted">Change since approval</p>
          <p className="text-[14px] leading-relaxed text-body">
            {r.diff.map((op, i) => (
              <span key={i}>
                {op.op === "eq" && op.text}
                {op.op === "del" && <del className="text-muted decoration-block decoration-2">{op.text}</del>}
                {op.op === "add" && <ins className="rounded-[4px] bg-card-ochre px-0.5 text-card-ink no-underline">{op.text}</ins>}{" "}
              </span>
            ))}
          </p>
        </div>
      )}

      {findings.length > 0 && (
        <ul className="mt-4 space-y-1.5 text-[13px] text-body">
          {findings.map((f, i) => (
            <li key={i}>
              <span className={`mr-2 font-mono text-[12px] font-semibold ${f.severity === "block" ? "text-block" : "text-warn"}`}>
                {f.rule_id} {f.severity}
              </span>
              {f.reason}
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

export function LiveAdsPanel({ refreshKey }: { refreshKey: number }) {
  const [results, setResults] = useState<CheckResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checkedAt, setCheckedAt] = useState<string>("");

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch("/api/live", { cache: "no-store" });
        const body = await res.json();
        if (!alive) return;
        if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
        setResults(body);
        setError(null);
        setCheckedAt(new Date().toLocaleTimeString());
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : String(e));
      }
    };
    load();
    const t = setInterval(load, POLL_MS);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [refreshKey]);

  return (
    <section className="pb-16">
      <div className="mb-4 flex items-baseline justify-between gap-4">
        <h2 className="text-[32px] font-medium tracking-[-0.5px] text-ink">Live ads</h2>
        <span className="font-mono text-[12px] text-muted">
          {error ? <span className="text-block">watchdog error: {error}</span> : checkedAt && `checked ${checkedAt} · every ${POLL_MS / 1000}s`}
        </span>
      </div>
      {results === null ? (
        <p className="text-[14px] text-muted">Loading</p>
      ) : results.length === 0 ? (
        <p className="text-[14px] text-muted">No approved ads yet. Approve a final variant above to publish it to live/.</p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
          {results.map((r) => (
            <LiveAdCard key={r.ad_id} r={r} />
          ))}
        </div>
      )}
    </section>
  );
}
