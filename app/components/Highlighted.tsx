// Renders a slice of the ad text with findings highlighted inline. Hover shows rule ID and reason.
// Spans index into the full adText; `offset` is where this slice starts in it.
import type { Finding } from "@/src/core/schemas";

type Segment = { start: number; end: number; findings: Finding[] };

function segments(text: string, offset: number, findings: Finding[]): Segment[] {
  const end = offset + text.length;
  const hits = findings.filter((f) => f.span && f.span.start < end && f.span.end > offset);
  const cuts = new Set<number>([offset, end]);
  for (const f of hits) {
    cuts.add(Math.max(f.span!.start, offset));
    cuts.add(Math.min(f.span!.end, end));
  }
  const points = [...cuts].sort((a, b) => a - b);
  const out: Segment[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const [s, e] = [points[i], points[i + 1]];
    out.push({ start: s, end: e, findings: hits.filter((f) => f.span!.start < e && f.span!.end > s) });
  }
  return out;
}

export function Highlighted({ text, offset = 0, findings }: { text: string; offset?: number; findings: Finding[] }) {
  return (
    <>
      {segments(text, offset, findings).map((seg) => {
        const slice = text.slice(seg.start - offset, seg.end - offset);
        if (seg.findings.length === 0) return <span key={seg.start}>{slice}</span>;
        const block = seg.findings.some((f) => f.severity === "block");
        return (
          <span key={seg.start} className="group relative">
            <mark
              className={`rounded-[4px] bg-mark-bg px-0.5 text-card-ink underline decoration-2 underline-offset-2 ${
                block ? "decoration-block" : "decoration-warn"
              }`}
            >
              {slice}
            </mark>
            <span className="pointer-events-none absolute bottom-full left-0 z-20 mb-2 hidden w-72 rounded-xl border border-hairline bg-canvas p-3 text-left text-[13px] leading-snug text-body shadow-sm group-hover:block">
              {seg.findings.map((f, i) => (
                <span key={i} className="block not-first:mt-2">
                  <span className={`font-mono text-[12px] font-semibold ${f.severity === "block" ? "text-block" : "text-warn"}`}>
                    {f.rule_id} · {f.severity} · {f.source}
                  </span>
                  <span className="block text-body">{f.reason}</span>
                </span>
              ))}
            </span>
          </span>
        );
      })}
    </>
  );
}
