# Eval Test Fixtures

Two RunSummary fixtures used by the comparison-reporter as a demonstration of
its output shape. **Do not confuse them with measured-vs-measured comparisons —
exactly one of them is real.**

## Files

### `baseline-stripe-real-stage-3.json` — REAL (load-bearing)

Numbers extracted verbatim from
`specs/big-spec-runs/haiku4-5_x_sonnet4-6__two-call__stripe-full.json`
(Stage-3 (C-i) Two-Call Sonnet+Sonnet run on Stripe FULL, 2026-05-04).

Reproducible by:

```bash
npx tsx scripts/spike/eval/runner.ts eval-configs/c-i-baseline-stripe.yaml
npx tsx scripts/spike/eval/score-run.ts \
  specs/big-spec-runs/eval/c-i-baseline-stripe__<timestamp>.json
```

This is the **locked Phase 0 baseline** — match against the snapshot at
`scripts/spike/eval/snapshots/c-i-baseline-stripe.json`.

### `candidate-stripe-stage-4-VISION.json` — HYPOTHETICAL (do not trust)

Numbers are **NOT measured**. They represent the Stage-4 vision the team is
aiming for (Deterministic Layer + v6 prompt + prompt-caching + concurrency
tuning). Used solely to:

1. Demonstrate the comparison-reporter's output shape on dramatic deltas
2. Anchor team discussions about "what does Stage 4 success look like"

**Do not use this file for any decision-making.** The real Stage-4 numbers
will be measured in Phase B and may differ substantially. If you find
yourself reading "Stage 4 will reach 65 % knowledge-backed coverage" as a
fact, this file is misleading you — that's a target, not a measurement.

## Usage

```bash
npx tsx scripts/spike/eval/comparison.ts \
  scripts/spike/eval/__test-fixtures__/baseline-stripe-real-stage-3.json \
  scripts/spike/eval/__test-fixtures__/candidate-stripe-stage-4-VISION.json
```

The `_provenance` and `_warning` fields in the candidate JSON are not parsed
by `comparison.ts`; they exist only to make accidental misuse of the file
harder.
