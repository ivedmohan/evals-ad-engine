// Pure derivation of UI state from the RunEvent stream. No state lives anywhere else.
import type { AdVariant, CreativeBrief, ReviewResult, RunEvent } from "@/src/core/schemas";

export type TraceRow = {
  key: string;
  agent: string;
  variantId?: string;
  model: string;
  status: "running" | "done" | "error";
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
  ms?: number;
  attempts?: number;
  startedAt: string;
};

export type VariantState = {
  id: string;
  history: AdVariant[]; // v1, v2, ...
  reviews: ReviewResult[]; // reviews[k] is the review of history[k]
  stage: "writing" | "reviewing" | "editing" | "done" | "error";
};

export type RunState = {
  runId?: string;
  brief?: CreativeBrief;
  trace: TraceRow[];
  variants: VariantState[];
  totalCostUsd: number;
  finishedMs?: number;
  errors: string[];
};

export function deriveRunState(events: RunEvent[]): RunState {
  const trace: TraceRow[] = [];
  const open = new Map<string, TraceRow>();
  const variants = new Map<string, VariantState>();
  const errors: string[] = [];
  let totalCostUsd = 0;
  let brief: CreativeBrief | undefined;
  let finishedMs: number | undefined;

  const variant = (id: string) => {
    let v = variants.get(id);
    if (!v) variants.set(id, (v = { id, history: [], reviews: [], stage: "writing" }));
    return v;
  };

  for (const e of events) {
    switch (e.type) {
      case "agent_start": {
        const key = `${e.agent}:${e.variant_id ?? "-"}:${trace.length}`;
        const row: TraceRow = { key, agent: e.agent, variantId: e.variant_id, model: e.model, status: "running", startedAt: e.ts };
        trace.push(row);
        open.set(`${e.agent}:${e.variant_id ?? "-"}`, row);
        if (e.variant_id) {
          const v = variant(e.variant_id);
          v.stage = e.agent === "reviewer" ? "reviewing" : e.agent === "editor" ? "editing" : "writing";
        }
        break;
      }
      case "agent_end": {
        const row = open.get(`${e.agent}:${e.variant_id ?? "-"}`);
        if (row) {
          Object.assign(row, {
            status: "done",
            inputTokens: e.input_tokens,
            outputTokens: e.output_tokens,
            costUsd: e.cost_usd,
            ms: e.ms,
            attempts: e.attempts,
          });
          open.delete(`${e.agent}:${e.variant_id ?? "-"}`);
        }
        totalCostUsd += e.cost_usd;
        break;
      }
      case "review": {
        const v = variant(e.variant_id);
        v.history[e.round] = e.variant;
        v.reviews[e.round] = e.result;
        break;
      }
      case "revision": {
        const v = variant(e.variant_id);
        v.history[e.round - 1] ??= e.before;
        v.history[e.round] = e.after;
        break;
      }
      case "run_end": {
        brief = e.brief;
        finishedMs = e.ms;
        for (const f of e.finals) {
          const v = variant(f.variant.id);
          v.history = f.history;
          v.stage = "done";
        }
        for (const v of variants.values()) if (v.stage !== "done") v.stage = "error";
        break;
      }
      case "error": {
        errors.push(e.message);
        if (e.variant_id) variant(e.variant_id).stage = "error";
        if (e.agent) {
          const row = open.get(`${e.agent}:${e.variant_id ?? "-"}`);
          if (row) row.status = "error";
        }
        break;
      }
    }
  }

  return {
    runId: events[0]?.run_id,
    brief,
    trace,
    variants: [...variants.values()].sort((a, b) => a.id.localeCompare(b.id)),
    totalCostUsd,
    finishedMs,
    errors,
  };
}
