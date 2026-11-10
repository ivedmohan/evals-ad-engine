// brief -> strategist -> 3x copywriter (parallel) -> per variant: (lint -> reviewer -> editor if blocked)* -> final
import { randomUUID } from "node:crypto";
import { runCopywriter } from "./agents/copywriter";
import { runEditor } from "./agents/editor";
import { runReviewer } from "./agents/reviewer";
import { runStrategist } from "./agents/strategist";
import { LIMITS } from "./config";
import { adText, lint } from "./lint";
import type { AdVariant, CreativeBrief, Emit, FinalVariant, RunEvent, RunEventInput } from "./schemas";

export class BudgetExceededError extends Error {}

export type RunSummary = { runId: string; brief?: CreativeBrief; finals: FinalVariant[]; totalCostUsd: number; ms: number };

export async function runPipeline(oneLineBrief: string, onEvent: (e: RunEvent) => void): Promise<RunSummary> {
  const runId = `run_${randomUUID().slice(0, 8)}`; // not Date.now(): concurrent runs started in the same ms collided
  const started = Date.now();
  let totalCost = 0;

  const emit: Emit = (e: RunEventInput) => {
    if (e.type === "agent_end") totalCost += e.cost_usd;
    onEvent({ ...e, run_id: runId, ts: new Date().toISOString() } as RunEvent);
  };
  const checkBudget = () => {
    if (totalCost >= LIMITS.runBudgetUsd)
      throw new BudgetExceededError(`run budget of $${LIMITS.runBudgetUsd} reached ($${totalCost.toFixed(4)} spent)`);
  };

  emit({ type: "run_start", brief: oneLineBrief });

  let brief: CreativeBrief | undefined;
  let finals: FinalVariant[] = [];
  try {
    brief = (await runStrategist(oneLineBrief, emit)).data;
    const b = brief;
    const ids = ["A", "B", "C"].slice(0, LIMITS.variantsPerRun);

    const results = await Promise.allSettled(
      ids.map(async (id, i): Promise<FinalVariant> => {
        checkBudget();
        const copy = await runCopywriter(b, b.angle_options[i], id, emit);
        let v: AdVariant = { ...copy.data, id };
        const history: AdVariant[] = [v];
        let revisions = 0;

        for (let round = 0; ; round++) {
          checkBudget();
          const { result } = await runReviewer(v, b.product_type, lint(adText(v), b.product_type), emit);
          emit({ type: "review", variant_id: id, round, variant: v, result });
          if (result.verdict !== "block" || revisions >= LIMITS.maxRevisions)
            return { variant: v, review: result, revisions, history };

          checkBudget();
          const edited = await runEditor(v, b, result.findings, emit);
          const next: AdVariant = { ...edited.data, id };
          emit({ type: "revision", variant_id: id, round: round + 1, before: v, after: next });
          history.push(next);
          v = next;
          revisions++;
        }
      }),
    );

    finals = results.flatMap((r, i) => {
      if (r.status === "fulfilled") return [r.value];
      emit({ type: "error", variant_id: ids[i], message: errMsg(r.reason) });
      return [];
    });
  } catch (e) {
    emit({ type: "error", message: errMsg(e) });
  }

  const ms = Date.now() - started;
  emit({ type: "run_end", brief, finals, total_cost_usd: totalCost, ms });
  return { runId, brief, finals, totalCostUsd: totalCost, ms };
}

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));
