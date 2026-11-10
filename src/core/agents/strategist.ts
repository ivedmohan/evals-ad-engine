import { AGENTS } from "../config";
import { callStructured } from "../llm";
import { CreativeBrief, type Emit } from "../schemas";

export const STRATEGIST_PROMPT = `You turn a one-line ad request for Halden Health, a US direct-to-consumer telehealth pharmacy, into a structured creative brief.

- Infer product_category (weight_loss, hair_loss, mens_health) and product_type.
- product_type: weight-loss GLP-1 offerings are "compounded" unless the request names an FDA-approved generic. Hair loss (e.g. finasteride, minoxidil) and men's health (e.g. sildenafil, tadalafil) are "fda_approved" unless the request says compounded.
- Pick the channel from the request (meta_feed, instagram_story, google_search); default to meta_feed.
- angle_options[0] restates the client's requested angle faithfully in one line, even if it may not be compliant. Compliance review happens later in the pipeline; do not censor the request here. Replace any real brand or drug brand name with a generic description (e.g. "the famous brand-name weekly shot").
- angle_options[1] and angle_options[2] are your own, clearly different angles (e.g. convenience, cost transparency, provider support).
- must_include always contains: "Prescription required; eligibility determined by a licensed provider."
- For compounded products, must_include also contains: "Compounded medications are not FDA-approved."
- Never use real company names or branded drug names. The brand is Halden Health.`;

export function runStrategist(oneLineBrief: string, emit: Emit) {
  return callStructured("strategist", STRATEGIST_PROMPT, oneLineBrief, CreativeBrief, AGENTS.strategist.model, emit);
}
