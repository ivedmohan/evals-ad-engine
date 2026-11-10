"use client";
import { useEffect, useMemo, useState } from "react";
import { LiveAdsPanel } from "@/app/components/LiveAdsPanel";
import { Trace } from "@/app/components/Trace";
import { VariantCard } from "@/app/components/VariantCard";
import { deriveRunState } from "@/app/lib/run-state";
import type { RunEvent } from "@/src/core/schemas";

async function streamRun(brief: string, onEvent: (e: RunEvent) => void) {
  const res = await fetch("/api/run", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ brief }),
  });
  if (!res.ok || !res.body) throw new Error((await res.json().catch(() => null))?.error ?? `HTTP ${res.status}`);
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += value;
    const chunks = buf.split("\n\n");
    buf = chunks.pop() ?? "";
    for (const c of chunks) if (c.startsWith("data: ")) onEvent(JSON.parse(c.slice(6)));
  }
}

export default function Home() {
  const [brief, setBrief] = useState("");
  const [events, setEvents] = useState<RunEvent[]>([]);
  const [running, setRunning] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const [fatal, setFatal] = useState<string | null>(null);
  const [liveTick, setLiveTick] = useState(0); // bumped on approval so the Live ads panel refreshes at once
  const state = useMemo(() => deriveRunState(events), [events]);

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(t);
  }, [running]);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    if (!brief.trim() || running) return;
    setEvents([]);
    setFatal(null);
    setRunning(true);
    const t0 = Date.now();
    setStartedAt(t0);
    setNow(t0);
    try {
      await streamRun(brief.trim(), (ev) => setEvents((prev) => [...prev, ev]));
    } catch (err) {
      setFatal(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  }

  const elapsed = state.finishedMs ?? (startedAt ? now - startedAt : 0);
  const slots = state.variants.length ? state.variants : running ? ["A", "B", "C"].map((id) => ({ id, history: [], reviews: [], stage: "writing" as const })) : [];

  return (
    <div className="mx-auto flex w-full max-w-[1280px] flex-1 flex-col px-6">
      <header className="pt-14 pb-10">
        <p className="text-[12px] font-semibold uppercase tracking-[1.5px] text-muted">Halden Health · ad compliance</p>
        <h1 className="mt-3 text-[56px] font-medium leading-[1.05] tracking-[-2px] text-ink">Redline</h1>
        <form onSubmit={run} className="mt-8 flex max-w-3xl gap-3">
          <input
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            placeholder="One-line brief, e.g. hair regrowth ad for guys in their late 20s, instagram"
            className="h-11 flex-1 rounded-xl border border-hairline bg-canvas px-4 text-[15px] text-ink placeholder:text-muted focus:border-ink focus:outline-none"
            maxLength={500}
          />
          <button
            type="submit"
            disabled={running || !brief.trim()}
            className="h-11 rounded-xl bg-primary px-5 text-[14px] font-semibold text-on-primary active:bg-primary-active disabled:bg-surface-strong disabled:text-muted"
          >
            {running ? "Running" : "Run"}
          </button>
        </form>
        {state.brief && (
          <p className="mt-4 flex flex-wrap gap-2 text-[13px] font-medium text-ink">
            {[state.brief.product_category, state.brief.product_type, state.brief.channel].map((t) => (
              <span key={t} className="rounded-full bg-surface-card px-3 py-1">{t.replace(/_/g, " ")}</span>
            ))}
          </p>
        )}
      </header>

      <main className="grid flex-1 gap-8 pb-12 lg:grid-cols-[360px_1fr]">
        <section className="rounded-2xl border border-hairline bg-surface-soft p-4 lg:self-start">
          <h2 className="mb-3 px-2 text-[12px] font-semibold uppercase tracking-[1.5px] text-muted">Agent trace</h2>
          <Trace rows={state.trace} />
        </section>
        <section className="grid content-start gap-6 xl:grid-cols-3">
          {slots.length === 0 ? (
            <p className="text-[15px] text-muted xl:col-span-3">Variants appear here once the copywriters start.</p>
          ) : (
            slots.map((v, i) => (
              <VariantCard
                key={`${state.runId}-${v.id}`}
                v={v}
                index={i}
                approveCtx={{ runId: state.runId, productType: state.brief?.product_type, onApproved: () => setLiveTick((t) => t + 1) }}
              />
            ))
          )}
        </section>
      </main>

      <LiveAdsPanel refreshKey={liveTick} />

      <footer className="sticky bottom-0 -mx-6 border-t border-hairline bg-surface-soft px-6 py-3 font-mono text-[12px] text-muted">
        <span className="text-ink">total ${state.totalCostUsd.toFixed(4)}</span>
        {" · "}
        {(elapsed / 1000).toFixed(1)}s
        {" · "}
        {state.trace.length} agent steps
        {fatal && <span className="ml-3 text-block">error: {fatal}</span>}
        {state.errors.map((m, i) => (
          <span key={i} className="ml-3 text-block">{m}</span>
        ))}
      </footer>
    </div>
  );
}
