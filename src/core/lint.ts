// Stage 1: deterministic regex check. High recall, no judgment; the reviewer confirms or dismisses each hit.
import { RULES } from "./rules";
import type { AdCopy, Finding, ProductType } from "./schemas";

// The single text that lint, the reviewer and the UI all index into.
export function adText(ad: Pick<AdCopy, "headline" | "primary_text" | "cta">): string {
  return `${ad.headline}\n${ad.primary_text}\n${ad.cta}`;
}

export function lint(text: string, productType: ProductType): Finding[] {
  const findings: Finding[] = [];
  for (const rule of RULES) {
    if (!rule.applies_to.includes(productType)) continue;
    for (const p of rule.patterns) {
      const re = new RegExp(p.re.source, "gi");
      for (const m of text.matchAll(re)) {
        const start = m.index;
        const end = start + m[0].length;
        if (findings.some((f) => f.rule_id === rule.id && f.span && start < f.span.end && end > f.span.start)) continue;
        findings.push({
          rule_id: rule.id,
          severity: p.severity ?? rule.severity,
          quote: m[0],
          reason: `Lint pattern /${p.re.source}/: ${rule.title}`,
          source: "lint",
          span: { start, end },
        });
      }
    }
  }
  return findings.sort((a, b) => a.span!.start - b.span!.start);
}
