import type { TraceRow } from "@/app/lib/run-state";

const DOT = { running: "bg-warn animate-pulse", done: "bg-pass", error: "bg-block" };

export function Trace({ rows }: { rows: TraceRow[] }) {
  if (rows.length === 0) return <p className="text-[13px] text-muted">Agent steps appear here as they run.</p>;
  return (
    <ol className="space-y-1 font-mono text-[12px]">
      {rows.map((r) => (
        <li key={r.key} className="grid grid-cols-[10px_1fr_auto] items-baseline gap-x-2 rounded-lg px-2 py-1.5 hover:bg-surface-card">
          <span className={`h-2 w-2 translate-y-[-1px] rounded-full ${DOT[r.status]}`} />
          <span className="truncate text-ink">
            {r.agent}
            {r.variantId && <span className="text-muted"> {r.variantId}</span>}
            {r.attempts && r.attempts > 1 && <span className="text-warn"> retry</span>}
          </span>
          <span className="text-right text-muted tabular-nums">{r.ms !== undefined ? `${(r.ms / 1000).toFixed(1)}s` : "…"}</span>
          <span />
          <span className="col-span-2 text-muted tabular-nums">
            {r.model.replace("claude-", "")}
            {r.inputTokens !== undefined && (
              <>
                {" · "}
                {r.inputTokens}→{r.outputTokens} tok · ${r.costUsd!.toFixed(5)}
              </>
            )}
          </span>
        </li>
      ))}
    </ol>
  );
}
