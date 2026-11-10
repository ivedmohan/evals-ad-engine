# Redline compliance rules (demo)

These rules are built from the themes in FDA's 2025–2026 warning letters to telehealth companies about compounded GLP-1 marketing. They are a demo rule set, not legal advice.

`product_type` is one of:
- `compounded` — a compounded medication, which is not FDA-approved
- `fda_approved` — an FDA-approved branded or generic drug, e.g. finasteride or sildenafil

Severities:
- **block** — the ad must be revised before it can ship
- **warn** — the ad ships with the issue flagged for human review

| ID | Rule | Applies to | Severity | Lint hints (stage 1) |
|----|------|-----------|----------|----------------------|
| R1 | No claim or implication that a compounded product is FDA-approved, FDA-reviewed, or made from "FDA-approved ingredients" | compounded | block | `fda[- ]approved`, `fda[- ]cleared`, `fda[- ]reviewed` |
| R2 | No sameness or equivalence to branded drugs: no brand names, "generic X", "same as", "X-like", "same active ingredient as X" | compounded | block | ozempic, wegovy, mounjaro, zepbound, rybelsus, saxenda, `generic \w+`, `same as`, `-like\b` |
| R3 | No unsubstantiated efficacy claims: "clinically proven", "clinically studied and shown", guaranteed results, specific weight-loss amounts or timelines | all | block | `clinically (proven\|shown\|studied)`, `guarantee`, `lose \d+`, `\d+ ?(lbs\|pounds\|kg)` |
| R4 | No absolute safety claims or unqualified superlatives ("safe", "no side effects", "risk-free", "#1", "best") | all | block for safety claims, warn for superlatives | `no side effects`, `risk[- ]free`, `100% safe`, `#1`, `\bbest\b` |
| R5 | Do not imply the telehealth brand makes or compounds the drug ("our formula", "made by Halden") | compounded | block | `our (formula\|formulation\|medication)`, `made by`, `we compound` |
| R6 | State that a prescription is required and depends on evaluation by a licensed provider; never "no prescription needed" or "approval guaranteed" | all | block if contradicted, warn if missing | `no prescription`, `guaranteed approval`, `instant approval` |
| R7 | No before-and-after framing or transformation testimonials presented as typical results | all | warn | `before and after`, `transformation`, `results like` |
| R8 | Compounded products must be disclosed as compounded and not FDA-approved | compounded | warn if missing | (absence check, needs LLM judgment) |

## Notes for the reviewer agent
- Lint hits are candidates, not verdicts. "Our providers are the best part of my week" from a patient is not the same as "the best treatment". Confirm or dismiss each lint hit, and catch the implied violations that lint cannot see (paraphrased equivalence, implied approval, implied guarantees).
- Every finding needs `rule_id`, `severity`, an exact `quote` from the ad text, and a one-line `reason`.
- An `fda_approved` product can truthfully be called FDA-approved. R1, R2 and R5 do not apply to it.
