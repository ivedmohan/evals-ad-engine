# Redline — tasks

Work top to bottom, one task at a time. Each task has an acceptance check; it is not done until that check passes and you have shown the output. Stop at every **CHECKPOINT**.

Time budgets are for a live recording. If a task runs over, flag it so the human can decide whether to cut scope.

---

## Phase 0 — Setup (target 4 min)
- [x] **T0.1** Scaffold Next.js (App Router, TypeScript strict, Tailwind) with pnpm. Add `@anthropic-ai/sdk`, `zod`, `tsx`. Add the scripts listed in CLAUDE.md. Gitignore `runs/` and `.env*`.
  - Check: `pnpm typecheck` passes on the empty scaffold.
- [x] **T0.2** Create `.claude/agents/golden-set-writer.md`, a subagent that writes eval examples for `evals/golden.jsonl` following `rules.md`. It must cover every rule, include tricky near-misses and clean ads, and only append to the file.
  - Check: the file exists and its prompt names `rules.md` as the source of truth.

## Phase 1 — Core pipeline (target 17 min)
- [x] **T1.1** `config.ts` and `schemas.ts`.
  - `CreativeBrief`: product_category, product_type, audience, channel (meta_feed | instagram_story | google_search), angle_options[3], must_include[], tone
  - `AdVariant`: id, angle, headline (≤ 40 characters), primary_text (≤ 280 characters), cta
  - `Finding`: rule_id, severity, quote, reason, source (lint | reviewer)
  - `ReviewResult`: variant_id, verdict (pass | warn | block), findings[]
  - `RunEvent`: a discriminated union of run_start, agent_start, agent_end (with tokens and cost), review, revision, run_end, error
  - Check: typecheck passes.
- [x] **T1.2** `llm.ts`: a `callStructured<T>(agentName, systemPrompt, input, zodSchema, model)` function that:
  - forces tool use with a JSON schema derived from the zod schema
  - validates the output and retries once with the validation error on failure
  - returns tokens and cost, and emits events
  - Check: a small script calls it with a toy schema against the real API and prints the parsed result and cost.
- [x] **T1.3** `rules.ts` and `lint.ts` built from `rules.md`. Lint returns findings with character spans and respects `applies_to`.
  - Check: `lint.test.ts` has 6 cases — one hit each for R1, R2 and R3, one `fda_approved` product that should not trigger R1, and one clean ad — and all pass.
- [x] **T1.4** The four agents. Each prompt sits in a `const` at the top of its file. The reviewer receives the lint findings and must confirm or dismiss each one and add any implied violations. Drop any finding whose quote is not in the ad text.
- [x] **T1.5** `orchestrator.ts` and `cli.ts`: strategist → 3 copywriters in parallel → for each variant, lint → reviewer → editor if blocked (at most 2 rounds) → final. Enforce the cost budget from config. Write every event to `runs/<timestamp>.jsonl`.
  - Check: `pnpm run:cli "hair regrowth ad for guys in their late 20s, instagram"` finishes, and prints each variant's final verdict, its revision count, and the total cost.

**CHECKPOINT 1** — Show one full run in the terminal. The human reads the prompts and outputs and corrects course before Phase 2.

## Phase 2 — Eval harness (target 13 min)
- [x] **T2.1** Use the `golden-set-writer` subagent to produce about 24 examples in `evals/golden.jsonl`: at least 2 per rule, 6 clean, and 4 tricky near-misses such as an `fda_approved` product, a quoted testimonial, or "best" used in a non-claim way.
  - **CHECKPOINT 2** — The human audits the labels on screen. Do not proceed until they confirm.
- [x] **T2.2** `evals/run.ts`: run lint + reviewer on each example, score findings by rule ID against the labels, and report per-rule precision and recall, block-level recall, and total cost. Write results to `evals/results/<timestamp>.json` and print a compact table.
- [x] **T2.3** Regression gate: compare against `evals/baseline.json` and exit non-zero if block-level recall drops by more than 0.05 or any rule's recall drops by more than 0.15. If no baseline exists, print the command for the human to save one. Do not save it yourself.
  - Check: run it once, the human saves the baseline, then run it again and it passes.
- [x] **T2.4** `evals/e2e.ts`: run the pipeline on 4 briefs in `evals/briefs.json` (one each for weight loss with a compounded product, hair loss, men's health, and a deliberately sketchy brief like "ad saying it's basically ozempic but cheaper"). Report the share of final variants with no block findings, average revisions, cost, and p50 latency.

**CHECKPOINT 3** — The human weakens the reviewer prompt on purpose, and `pnpm eval` must fail. Then revert.

## Phase 3 — UI (target 10 min)
- [x] **T3.1** `app/api/run/route.ts` streams RunEvents as server-sent events by calling the orchestrator.
- [x] **T3.2** Single page with:
  - a brief input and Run button
  - a live trace on the left: one row per agent step with status, model, tokens, cost and duration
  - the 3 variant cards on the right, showing headline, text and CTA, with findings highlighted inline (hovering shows rule ID and reason)
  - a verdict badge and revision history on each card ("v1 → v2")
  - a footer with total cost and time
  - Follow the design notes in CLAUDE.md, including light and dark mode.
  - Check: run the sketchy brief in the browser. At least one variant shows a highlighted block finding and then a passing revision.

**CHECKPOINT 4** — Final demo run.

## Phase 4 — Watchdog (target 10 min; do not start until Phase 3 is done)
Approval happens once, but approved ads keep getting edited by marketers and agencies. The watchdog notices when a live ad drifts from what was approved and re-reviews it. `live/` stands in for an ad platform; there is no real Meta or Google integration.

- [x] **T4.1** Approval. Add `ApprovedAd` (ad_id, variant, product_type, fingerprint, approved_at) and a `tamper_detected` RunEvent (ad_id, diff, verdict, findings, level: info | warn | alert) to `schemas.ts`. `src/core/approve.ts` normalizes the text (trim, collapse whitespace), computes a sha256 fingerprint, writes `approved/<ad_id>.json`, and writes a copy to `live/<ad_id>.json`. Wire it to an "Approve" button on each final variant card (through an API route) and to `pnpm run:cli --approve`. Gitignore `approved/` and `live/`.
  - Check: `pnpm run:cli --approve "<brief>"` writes matching files to `approved/` and `live/`, and recomputing the fingerprint of the live file gives the stored value.
- [x] **T4.2** `src/core/watchdog.ts` compares every file in `live/` with its approved fingerprint. On a mismatch it computes a word-level diff, re-runs lint and the reviewer on the new text, and emits `tamper_detected`. Level: `info` if the new verdict is pass, `warn` for warn findings, `alert` for block findings. Events are appended to the run JSONL. `pnpm watch` polls every 5 seconds; `pnpm watch --once` checks once and exits.
  - Check: with one approved ad, `pnpm watch --once` reports it in sync. Hand-edit `live/<ad_id>.json` to add "same as Ozempic", run `pnpm watch --once` again, and it prints the diff and level `alert` with an R2 finding.
- [x] **T4.3** UI "Live ads" panel: each approved ad with its status (in sync / edited / edited + violation), the diff with removed words struck through and added words highlighted, and the new findings highlighted inline using the same component as the variant cards.
  - Check: hand-edit a live file while the UI is open; the panel shows the diff and the violation after the next poll.
- [x] **T4.4** Add 3 tamper cases to `evals/e2e.ts`, each starting from a fixed approved compounded-product ad that passes review on its own (includes the prescription and compounded disclosures): (1) a harmless typo fix, expected `info`; (2) a superlative added, expected `warn`; (3) "same as Ozempic" added, expected `alert`. The e2e eval fails if any case gets the wrong level.
  - Check: `pnpm eval:e2e` prints the 3 tamper cases with expected vs actual level and passes; changing an expected level makes it exit non-zero.

**CHECKPOINT 5** — Live demo: approve an ad, hand-edit its file in `live/` to add a banned claim, and show the watchdog raising `alert` with the diff.

## Out of scope (do not build)
Image or video generation, auth, a database, deployment, multiple brands, prompt-tuning UIs. For the watchdog: real ad platform APIs, notifications (Slack, email), user accounts, or audit logs beyond the run JSONL.

## Stretch (only if the human asks)
- Model tiering: try Haiku for the copywriter and keep the change only if `pnpm eval:e2e` holds steady.
- Cache reviewer results by content hash.
- A "why" panel that shows the reviewer's dismissed lint hits.
