// T1.2 acceptance: one real API call through llm.ts with a toy schema.
import { z } from "zod";
import { MODELS } from "../src/core/config";
import { callStructured } from "../src/core/llm";
import type { RunEventInput } from "../src/core/schemas";

const Toy = z.object({
  color: z.string(),
  hex: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  warm: z.boolean(),
});

async function main() {
  const events: RunEventInput[] = [];
  const res = await callStructured(
    "smoke",
    "Name one colour and give its hex code and whether it is a warm colour.",
    "Pick a colour.",
    Toy,
    MODELS.haiku,
    (e) => events.push(e),
    { effort: "low", maxTokens: 2000 },
  );

  console.log("parsed:", res.data);
  console.log(
    `tokens: in=${res.inputTokens} out=${res.outputTokens}  cost=$${res.costUsd.toFixed(6)}  attempts=${res.attempts}  ${res.ms}ms`,
  );
  console.log("events:", events.map((e) => e.type).join(", "));
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
