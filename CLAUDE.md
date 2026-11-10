# Redline — CLAUDE.md

Redline turns a vague one-line ad brief into compliant ad copy for a telehealth pharmacy, using a small team of agents with typed handoffs, a two-stage compliance review, and an eval harness that catches regressions.

It is a demo built live on camera in under an hour. Scope discipline matters more than features.

## Context
- Domain: US direct-to-consumer telehealth (weight loss, men's health, hair loss). Ads in this space get FDA warning letters for misleading claims. `rules.md` is the source of truth for what counts as a violation. Read it before touching the reviewer, the lint step, or the evals.
- Brand: fictional — **Halden Health**. Never use a real company's name in generated ads. Never put real branded drug names (Ozempic, Wegovy, Mounjaro, Zepbound, etc.) into generated ads; they appear only in lint rules and in eval examples marked as violations.
- No patient data of any kind. Synthetic briefs only.

## Stack
- TypeScript (strict), Node 22, pnpm
- Next.js (App Router) for the UI and one streaming route; Tailwind for styling
- `@anthropic-ai/sdk`, `zod`
- `tsx` to run the CLI and evals
- Models: `claude-haiku-5-5` for strategist, copywriter, reviewer and editor (human decision, 2026-11-09). The model is set per agent in `src/core/config.ts`, so `claude-sonnet-5-5` can be swapped in for one agent if the Phase 2 evals show Haiku losing quality. Model IDs and prices live in `src/core/config.ts`. Do not hardcode them anywhere else.

## Commands
- `pnpm dev` — UI at http://localhost:3000
- `pnpm run:cli "<one-line brief>"` — runs the pipeline in the terminal and writes `runs/<timestamp>.jsonl`
- `pnpm eval` — reviewer eval; exits non-zero on regression versus `evals/baseline.json`
- `pnpm eval:e2e` — runs the full pipeline on `evals/briefs.json`; reports pass rate, cost and latency
- `pnpm watch` / `pnpm watch --once` — watchdog: checks `live/` against approved fingerprints
- `pnpm typecheck && pnpm lint`

## Architecture
```
src/core/
  config.ts        model IDs, prices, limits (max revisions, token and cost budget per run)
  schemas.ts       zod schemas for every agent input and output, plus RunEvent
  llm.ts           the ONLY place that calls the API: native structured outputs (messages.parse +
                   zodOutputFormat; forced tool_choice 400s on Sonnet 5.5),
                   zod validation, one retry on invalid output, token and cost accounting, event emission
  rules.ts         rules from rules.md as typed data (id, severity, applies_to, lint patterns)
  lint.ts          deterministic stage-1 check; returns findings with character spans
  agents/
    strategist.ts  one-line brief -> CreativeBrief
    copywriter.ts  CreativeBrief -> AdVariant (run 3 in parallel with different angles)
    reviewer.ts    AdVariant + lint findings -> ReviewResult (findings quote exact spans)
    editor.ts      AdVariant + findings -> revised AdVariant
  orchestrator.ts  brief -> strategist -> 3x copywriter -> (lint -> reviewer -> editor)* -> final
                   at most 2 revision rounds; emits RunEvents; enforces the budget
  approve.ts       normalize + sha256 fingerprint; writes approved/<ad_id>.json and live/<ad_id>.json
  watchdog.ts      compares live/ with approved fingerprints; word diff, re-lint + re-review,
                   emits tamper_detected (info | warn | alert)
src/cli.ts         also handles --approve
src/watch.ts       `pnpm watch` (polls every 5s) / `pnpm watch --once`
app/               UI: brief input, live agent trace, ad cards with highlighted findings, cost
app/api/run/route.ts  streams RunEvents as server-sent events
app/api/approve/route.ts, app/api/live/route.ts  approve a variant; list live ads + watchdog status
evals/
  golden.jsonl     labelled ad copy: { text, product_type, expected_rule_ids[] }
  briefs.json      end-to-end briefs
  run.ts, e2e.ts, baseline.json
rules.md
runs/              gitignored run logs
approved/, live/   gitignored; approved fingerprints and the stand-in "ad platform" copies
```

## Rules for you (Claude Code)
1. Work from `tasks.md`, one task at a time, in order. Tick the box when a task's acceptance check passes. Stop at every **CHECKPOINT** and summarise what changed so the human can review.
2. Every agent handoff goes through a zod schema. If something is not in a schema, it is not part of the handoff.
3. All model calls go through `llm.ts`. No direct SDK calls anywhere else.
4. Never mock or stub LLM calls outside `*.test.ts`. If something cannot run, say so instead of faking it.
5. Do not add dependencies beyond the stack above without asking.
6. Do not build features that are not in `tasks.md`: no auth, no database, no image generation, no deployment.
7. Reviewer findings must quote the exact offending text so the UI can highlight it. Validate that each quote actually appears in the ad text, and drop findings whose quotes don't.
8. Evals must be able to fail. Never edit `golden.jsonl` labels or `baseline.json` to make a run pass. Updating the baseline is a human decision.
9. Never log or print `ANTHROPIC_API_KEY` or the contents of `.env`.
10. Prefer small, readable files. Keep each prompt in a `const` at the top of its agent file so it can be read on screen.

## Definition of done (per task)
`pnpm typecheck` passes, the task's acceptance check in `tasks.md` passes, and you show the command you ran along with its output.

## Design taste (UI)
Visual style follows `DESIGN.md` (human decision, 2026-11-10): cream canvas, Inter with weight-500 display type and negative tracking, near-black primary buttons, 12/16/24px radii, saturated single-colour cards (one per variant, never the same colour twice in a row), hairline borders, no heavy shadows. Kept from the original brief: monospace for the trace; severity colours block = red, warn = amber, pass = green; light and dark mode (dark uses DESIGN.md's surface-dark tokens); no gradients, no emoji, no marketing copy. No illustrations: we have no licensed assets, and we never copy another company's name or artwork.
