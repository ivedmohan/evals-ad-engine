import type { Verdict } from "@/src/core/schemas";

const STYLES: Record<Verdict, string> = {
  pass: "bg-pass text-white",
  warn: "bg-warn text-white",
  block: "bg-block text-white",
};

export function VerdictBadge({ verdict }: { verdict: Verdict }) {
  return (
    <span className={`rounded-full px-3 py-1 text-[12px] font-semibold uppercase tracking-[1.5px] ${STYLES[verdict]}`}>
      {verdict}
    </span>
  );
}
