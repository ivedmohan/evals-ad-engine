import { AGENTS } from "../config";
import { callStructured } from "../llm";
import { AdCopy, type CreativeBrief, type Emit } from "../schemas";

// Role split like an agency: the copywriter writes persuasively to the assigned angle;
// compliance is owned by the reviewer and editor downstream, not policed here.
export const COPYWRITER_PROMPT = `You are a direct-response copywriter writing one ad for Halden Health, a US telehealth pharmacy, from a creative brief and one assigned angle.

- headline: at most 40 characters. primary_text: at most 280 characters, and it must contain every must_include line word for word. cta: 2-4 words.
- Set "angle" to the assigned angle.
- Sell the assigned angle as written, persuasively, for the brief's channel, audience and tone. A separate compliance team reviews every ad after you, so write to the angle rather than second-guessing it.
- Never use real company names or real branded drug names; describe them generically instead. The brand is Halden Health.`;

export function runCopywriter(brief: CreativeBrief, angle: string, variantId: string, emit: Emit) {
  return callStructured("copywriter", COPYWRITER_PROMPT, { brief, angle }, AdCopy, AGENTS.copywriter.model, emit, {
    variantId,
  });
}
