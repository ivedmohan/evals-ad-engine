// The ONLY file that calls the Anthropic API.
// Native structured outputs + zod validation, one retry on invalid output, token and cost accounting, events.
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";
import { AGENTS, costUsd, type AgentName, type ModelId } from "./config";
import type { Emit } from "./schemas";

let client: Anthropic | null = null;
const getClient = () => (client ??= new Anthropic()); // reads ANTHROPIC_API_KEY from env; never logged

export type LlmResult<T> = {
  data: T;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  attempts: number;
  ms: number;
};

export async function callStructured<S extends z.ZodType>(
  agent: AgentName | string,
  systemPrompt: string,
  input: unknown,
  schema: S,
  model: ModelId,
  emit: Emit,
  opts: { variantId?: string; effort?: "low" | "medium" | "high"; maxTokens?: number } = {},
): Promise<LlmResult<z.infer<S>>> {
  const cfg = AGENTS[agent as AgentName];
  const effort = opts.effort ?? cfg?.effort ?? "medium";
  const maxTokens = opts.maxTokens ?? cfg?.maxTokens ?? 16000;
  const ref = { agent, model, variant_id: opts.variantId };
  const started = Date.now();
  emit({ type: "agent_start", ...ref });

  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: typeof input === "string" ? input : JSON.stringify(input, null, 2) },
  ];
  let inputTokens = 0;
  let outputTokens = 0;
  let lastError = "";

  // messages.create (not .parse): .parse throws on a zod failure and the usage of that attempt is lost.
  for (let attempt = 1; attempt <= 2; attempt++) {
    const res = await getClient().messages.create({
      model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages,
      output_config: { effort, format: zodOutputFormat(schema) },
    });
    inputTokens += res.usage.input_tokens;
    outputTokens += res.usage.output_tokens;

    const text = res.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text;
    if (res.stop_reason === "refusal" || res.stop_reason === "max_tokens" || !text) {
      lastError = `no usable output (stop_reason=${res.stop_reason})`;
    } else {
      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch (e) {
        lastError = `invalid JSON: ${(e as Error).message}`;
      }
      if (json !== undefined) {
        const parsed = schema.safeParse(json);
        if (parsed.success) {
          const cost = costUsd(model, inputTokens, outputTokens);
          const ms = Date.now() - started;
          emit({
            type: "agent_end",
            ...ref,
            input_tokens: inputTokens,
            output_tokens: outputTokens,
            cost_usd: cost,
            ms,
            attempts: attempt,
          });
          return { data: parsed.data, inputTokens, outputTokens, costUsd: cost, attempts: attempt, ms };
        }
        lastError = parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");
      }
    }

    // Retry once: keep the full assistant turn (append-only history), then say what was wrong.
    messages.push({ role: "assistant", content: res.content });
    messages.push({
      role: "user",
      content: `Your output failed validation: ${lastError}. Return a corrected object that satisfies every constraint.`,
    });
  }

  const cost = costUsd(model, inputTokens, outputTokens);
  emit({
    type: "agent_end",
    ...ref,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    cost_usd: cost,
    ms: Date.now() - started,
    attempts: 2,
  });
  emit({ type: "error", agent, variant_id: opts.variantId, message: `invalid output after retry: ${lastError}` });
  throw new LlmOutputError(agent, lastError, cost);
}

export class LlmOutputError extends Error {
  constructor(public agent: string, public detail: string, public costUsd: number) {
    super(`${agent}: invalid output after retry: ${detail}`);
  }
}
