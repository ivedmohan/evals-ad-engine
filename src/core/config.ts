// The only place model IDs, prices and run limits live.

export const MODELS = {
  haiku: "claude-haiku-5-5",
  sonnet: "claude-sonnet-5-5",
} as const;
export type ModelId = (typeof MODELS)[keyof typeof MODELS];

// USD per million tokens, from the Anthropic pricing table.
// Haiku 5.5 rates apply to prompts up to 100K tokens; ours are a few thousand.
export const PRICES_PER_MTOK: Record<ModelId, { input: number; output: number }> = {
  "claude-haiku-5-5": { input: 0.1, output: 0.5 },
  "claude-sonnet-5-5": { input: 2, output: 10 },
};

export type AgentName = "strategist" | "copywriter" | "reviewer" | "editor";
export type Effort = "low" | "medium" | "high";

// Per-agent model, so one agent can be moved to Sonnet if the evals show Haiku losing quality.
export const AGENTS: Record<AgentName, { model: ModelId; maxTokens: number; effort: Effort }> = {
  strategist: { model: MODELS.haiku, maxTokens: 16000, effort: "medium" },
  copywriter: { model: MODELS.haiku, maxTokens: 16000, effort: "medium" },
  reviewer: { model: MODELS.haiku, maxTokens: 16000, effort: "high" },
  editor: { model: MODELS.haiku, maxTokens: 16000, effort: "medium" },
};

export const LIMITS = {
  maxRevisions: 2,
  runBudgetUsd: 0.5,
  variantsPerRun: 3,
} as const;

export function costUsd(model: ModelId, inputTokens: number, outputTokens: number): number {
  const p = PRICES_PER_MTOK[model];
  return (inputTokens * p.input + outputTokens * p.output) / 1_000_000;
}
