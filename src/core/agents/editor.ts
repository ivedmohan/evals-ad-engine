import { AGENTS } from "../config";
import { callStructured } from "../llm";
import { AdCopy, type AdVariant, type CreativeBrief, type Emit, type Finding } from "../schemas";

export const EDITOR_PROMPT = `You revise a Halden Health ad so it passes compliance review.

- Resolve every finding. Each one quotes the exact offending text and gives the rule and reason.
- Change as little as possible. Keep the angle, the voice and the channel fit.
- Keep headline at most 40 characters and primary_text at most 280 characters.
- primary_text must still contain every must_include line word for word.
- Do not add new claims of any kind. Removing a claim is usually the right fix.
- Never use real company names or branded drug names.`;

export function runEditor(variant: AdVariant, brief: CreativeBrief, findings: Finding[], emit: Emit) {
  const { id, ...ad } = variant;
  const input = {
    ad,
    product_type: brief.product_type,
    must_include: brief.must_include,
    findings: findings.map(({ rule_id, severity, quote, reason }) => ({ rule_id, severity, quote, reason })),
  };
  return callStructured("editor", EDITOR_PROMPT, input, AdCopy, AGENTS.editor.model, emit, { variantId: id });
}
