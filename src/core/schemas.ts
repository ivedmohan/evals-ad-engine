import { z } from "zod";

// Every agent handoff goes through one of these. If it is not in a schema, it is not part of the handoff.

export const ProductType = z.enum(["compounded", "fda_approved"]);
export const Severity = z.enum(["block", "warn"]);
export const Verdict = z.enum(["pass", "warn", "block"]);
export const RuleId = z.enum(["R1", "R2", "R3", "R4", "R5", "R6", "R7", "R8"]);

export const CreativeBrief = z.object({
  product_category: z.enum(["weight_loss", "hair_loss", "mens_health"]),
  product_type: ProductType,
  audience: z.string(),
  channel: z.enum(["meta_feed", "instagram_story", "google_search"]),
  angle_options: z.array(z.string()).length(3),
  must_include: z.array(z.string()),
  tone: z.string(),
});

// What the copywriter and editor models return; code assigns the id.
export const AdCopy = z.object({
  angle: z.string(),
  headline: z.string().max(40),
  primary_text: z.string().max(280),
  cta: z.string(),
});
export const AdVariant = AdCopy.extend({ id: z.string() });

export const Span = z.object({ start: z.number().int(), end: z.number().int() });

export const Finding = z.object({
  rule_id: RuleId,
  severity: Severity,
  quote: z.string(),
  reason: z.string(),
  source: z.enum(["lint", "reviewer"]),
  span: Span.optional(),
});

export const ReviewResult = z.object({
  variant_id: z.string(),
  verdict: Verdict,
  findings: z.array(Finding),
});

// What the reviewer model returns. Code adds source/span, drops quotes not in the ad, and computes the verdict.
export const ReviewerOutput = z.object({
  findings: z.array(
    z.object({ rule_id: RuleId, severity: Severity, quote: z.string(), reason: z.string() }),
  ),
  dismissed_lint: z.array(z.object({ rule_id: RuleId, quote: z.string(), reason: z.string() })),
});

export const FinalVariant = z.object({
  variant: AdVariant,
  review: ReviewResult,
  revisions: z.number().int(),
  history: z.array(AdVariant), // v1, v2, ... ending with the final variant
});

// Watchdog (Phase 4)
export const DiffOp = z.object({ op: z.enum(["eq", "add", "del"]), text: z.string() });
export const AlertLevel = z.enum(["info", "warn", "alert"]);
export const ApprovedAd = z.object({
  ad_id: z.string(),
  run_id: z.string(),
  variant: AdVariant,
  product_type: ProductType,
  fingerprint: z.string(), // sha256 of the normalized ad text (trimmed, whitespace collapsed)
  approved_at: z.string(),
});
// The copy on the stand-in "ad platform" (live/<ad_id>.json). Humans edit this file; no length limits enforced.
export const LiveAd = z.object({ ad_id: z.string(), headline: z.string(), primary_text: z.string(), cta: z.string() });

const base = { run_id: z.string(), ts: z.string() };
const agentRef = { agent: z.string(), model: z.string(), variant_id: z.string().optional() };

export const RunEvent = z.discriminatedUnion("type", [
  z.object({ ...base, type: z.literal("run_start"), brief: z.string() }),
  z.object({ ...base, type: z.literal("agent_start"), ...agentRef }),
  z.object({
    ...base,
    type: z.literal("agent_end"),
    ...agentRef,
    input_tokens: z.number(),
    output_tokens: z.number(),
    cost_usd: z.number(),
    ms: z.number(),
    attempts: z.number(),
  }),
  z.object({
    ...base,
    type: z.literal("review"),
    variant_id: z.string(),
    round: z.number(),
    variant: AdVariant, // the exact text that was reviewed, so the UI can show v1 before any revision
    result: ReviewResult,
  }),
  z.object({
    ...base,
    type: z.literal("revision"),
    variant_id: z.string(),
    round: z.number(),
    before: AdVariant,
    after: AdVariant,
  }),
  z.object({
    ...base,
    type: z.literal("run_end"),
    brief: CreativeBrief.optional(),
    finals: z.array(FinalVariant),
    total_cost_usd: z.number(),
    ms: z.number(),
  }),
  z.object({
    ...base,
    type: z.literal("tamper_detected"),
    ad_id: z.string(),
    diff: z.array(DiffOp),
    verdict: Verdict,
    findings: z.array(Finding),
    level: AlertLevel,
  }),
  z.object({
    ...base,
    type: z.literal("error"),
    agent: z.string().optional(),
    variant_id: z.string().optional(),
    message: z.string(),
  }),
]);

export type ProductType = z.infer<typeof ProductType>;
export type Severity = z.infer<typeof Severity>;
export type Verdict = z.infer<typeof Verdict>;
export type RuleId = z.infer<typeof RuleId>;
export type CreativeBrief = z.infer<typeof CreativeBrief>;
export type AdCopy = z.infer<typeof AdCopy>;
export type AdVariant = z.infer<typeof AdVariant>;
export type Finding = z.infer<typeof Finding>;
export type ReviewResult = z.infer<typeof ReviewResult>;
export type ReviewerOutput = z.infer<typeof ReviewerOutput>;
export type FinalVariant = z.infer<typeof FinalVariant>;
export type RunEvent = z.infer<typeof RunEvent>;
export type DiffOp = z.infer<typeof DiffOp>;
export type AlertLevel = z.infer<typeof AlertLevel>;
export type ApprovedAd = z.infer<typeof ApprovedAd>;
export type LiveAd = z.infer<typeof LiveAd>;

// Distributive Omit so each union member keeps its own fields.
type DistOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
export type RunEventInput = DistOmit<RunEvent, "run_id" | "ts">;
export type Emit = (e: RunEventInput) => void;
