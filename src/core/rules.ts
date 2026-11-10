// The rules from rules.md as typed data. rules.md is the source of truth; keep this in sync with it.
import type { ProductType, RuleId, Severity } from "./schemas";

export type LintPattern = { re: RegExp; severity?: Severity }; // severity overrides the rule default
export type Rule = {
  id: RuleId;
  title: string;
  severity: Severity;
  applies_to: ProductType[];
  patterns: LintPattern[]; // empty = absence check, left to the reviewer
};

const ALL: ProductType[] = ["compounded", "fda_approved"];
const COMPOUNDED: ProductType[] = ["compounded"];

export const RULES: Rule[] = [
  {
    id: "R1",
    title: "No claim that a compounded product is FDA-approved, cleared or reviewed",
    severity: "block",
    applies_to: COMPOUNDED,
    patterns: [{ re: /fda[- ]approved/ }, { re: /fda[- ]cleared/ }, { re: /fda[- ]reviewed/ }],
  },
  {
    id: "R2",
    title: "No sameness or equivalence to branded drugs",
    severity: "block",
    applies_to: COMPOUNDED,
    patterns: [
      { re: /\b(ozempic|wegovy|mounjaro|zepbound|rybelsus|saxenda)\b/ },
      { re: /\bgeneric \w+/ },
      { re: /\bsame as\b/ },
      { re: /\w-like\b/ },
    ],
  },
  {
    id: "R3",
    title: "No unsubstantiated efficacy claims, guarantees, or weight-loss amounts or timelines",
    severity: "block",
    applies_to: ALL,
    patterns: [
      { re: /clinically (proven|shown|studied)/ },
      { re: /guarantee/ },
      { re: /\blose \d+/ },
      { re: /\b\d+ ?(lbs|pounds|kg)\b/ },
    ],
  },
  {
    id: "R4",
    title: "No absolute safety claims (block) or unqualified superlatives (warn)",
    severity: "block",
    applies_to: ALL,
    patterns: [
      { re: /no side effects/ },
      { re: /risk[- ]free/ },
      { re: /100% safe/ },
      { re: /#1/, severity: "warn" },
      { re: /\bbest\b/, severity: "warn" },
    ],
  },
  {
    id: "R5",
    title: "Do not imply Halden makes or compounds the drug",
    severity: "block",
    applies_to: COMPOUNDED,
    patterns: [{ re: /\bour (formula|formulation|medication)\b/ }, { re: /\bmade by\b/ }, { re: /\bwe compound\b/ }],
  },
  {
    id: "R6",
    title: "Prescription required, subject to licensed-provider evaluation (block if contradicted, warn if missing)",
    severity: "block",
    applies_to: ALL,
    patterns: [{ re: /no prescription/ }, { re: /guaranteed approval/ }, { re: /instant approval/ }],
  },
  {
    id: "R7",
    title: "No before-and-after framing or transformation testimonials as typical results",
    severity: "warn",
    applies_to: ALL,
    patterns: [{ re: /before and after/ }, { re: /transformation/ }, { re: /results like/ }],
  },
  {
    id: "R8",
    title: "Compounded products must be disclosed as compounded and not FDA-approved",
    severity: "warn",
    applies_to: COMPOUNDED,
    patterns: [],
  },
];

export const RULES_BY_ID = Object.fromEntries(RULES.map((r) => [r.id, r])) as Record<RuleId, Rule>;
