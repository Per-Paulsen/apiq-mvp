# Phase B Architecture Design — LLM Pipeline auf Stage-A-Foundation

> **Zweck:** single source-of-truth für Phase-B-Pipeline-Design. Phase B = LLM v6-Prompt-Test mit Pre-pass via Stage A. Eigentlicher Spike-Lock-Test (Stage A war Vorbereitung). Wird ausgeführt nach Welle E (Stage A komplett).
>
> **Status (2026-05-06):** Design-doc, post-W4. Stage-A-Pipeline gewired (W2 done) + ehrlich gemessen (W4 done — siehe `specs/big-spec-runs/eval/STAGE-A-RESULTS.md`). Erwartete Implementierung: post-Pre-Phase-B-Restpunkte (codegen-aggregation, OPENAI_API_KEY-fix, reference-classify, cross-linter-parity). **Token-Budget-Math in §2 ist nach W4-Measurement neu zu rechnen** — codegen-validation emittiert 9.834 single findings pro Spec, blow-out für naive 3-Layer-Cleanup (siehe neue OQ8 in §8). Cost-Schätzung in §10 unverändert (3-5d + ~$25-40 LLM-Cost) aber Pre-Conditions verschoben.
>
> **Beziehung zu anderen specs:**
> - `big-spec-architecture-spike.md` Draft 0.6+ — original spike-doc mit Two-Call-Architektur und (C-i) Sonnet+Sonnet Decision
> - `big-spec-architecture-spike-stage-a-implementation-priority.md` — Stage-A-Component-Liste die Pre-pass produziert
> - `big-spec-architecture-spike-stage-a-meta-insights.md` — 10-Lens-Framework + Severity-Schema (Lens-3/5/8/9 sind Phase-B-Differentiator-Targets)

---

## 1. Pipeline-Overview

```
                          [User uploads spec]
                                 │
                                 ▼
                    ┌────────────────────────────┐
                    │ Stage A — Deterministic    │
                    │ Pipeline-active: 4 yamls   │
                    │ (110 active rules incl.    │
                    │ W3's 4 threat-p1) + 16     │
                    │ walkers + 15 module-       │
                    │ classes (W2 done; spec-    │
                    │ diff orphan, 2-Spec).      │
                    └────────┬───────────────────┘
                             │ produces
                             ▼
              ┌──────────────────────────────────┐
              │ Stage-A Findings (W4-measured    │
              │ 746-30939 raw per spec; codegen- │
              │ validation = single biggest      │
              │ producer ~9k findings/spec)      │
              └──────┬─────────────────────┬─────┘
                     │                     │
                     ▼                     ▼
          ┌────────────────────┐  ┌──────────────────┐
          │ Auto-Fix-Safe      │  │ Findings-        │
          │ Filter             │  │ Compaction       │
          │ (~15% subset)      │  │ (~30-50 unique   │
          │                    │  │  pattern-cats)   │
          └─────┬──────────────┘  └────────┬─────────┘
                │                           │
                ▼                           │
          ┌────────────────┐                │
          │ Apply Patches  │                │
          │ to spec        │                │
          └─────┬──────────┘                │
                │                           │
                ▼                           ▼
        ┌──────────────────────────────────────────┐
        │ Pre-cleaned Spec  +  Category-Summary    │
        │ (input to LLM)                           │
        └────────┬─────────────────────────────────┘
                 │
                 ▼
       ┌─────────────────────────┐
       │ Phase B Pipeline        │
       │ (Two-Call (C-i)         │
       │  Sonnet+Sonnet)         │
       │                         │
       │ Phase 1: per-endpoint   │
       │   N calls (1 per op)    │
       │ Phase 2: aggregator     │
       │   1 call cross-spec     │
       └────────┬────────────────┘
                │ emits
                ▼
       ┌─────────────────────────┐
       │ LLM-Findings            │
       │ (knowledge-backed-gap   │
       │  Lens-3/5/8/9-class)    │
       └────────┬────────────────┘
                │
                ▼
       ┌─────────────────────────┐
       │ Output-Merger           │
       │ (Stage-A Findings +     │
       │  LLM-Findings, mapped   │
       │  back to ORIGINAL spec) │
       └────────┬────────────────┘
                │
                ▼
          [User sees unified findings list]
```

---

## 2. Stage-A-Findings-Integration (load-bearing)

### Problem
Stage A produziert W4-measured **746-30.939 findings auf real-world specs** (post-W2/W3, full pipeline). codegen-validation allein 9.834 findings auf github-rest, 4.572 pagerduty, 3.430 stripe, 264 dnd5eapi — single biggest producer + per-occurrence-Findings die in much-smaller root-cause-set clustern. Naive 3-Layer-Cleanup würde im Phase-2-Aggregator selbst nach Per-Endpoint-Slicing den 200K-Context sprengen. **Pre-Phase-B-Engineering-Pre-Condition: codegen-validation Output-Aggregation** (1 Category-Row statt 9.834 individual rows; siehe OQ8 in §8).

### Lösung: 3-Layer-Cleanup

#### Layer 1 — Auto-Fix-Safe Apply (~15% der findings)
Subset der findings die **mechanisch-trivial-safe-fixable** sind: 1-zu-1 deterministic correct transformation.

**Kandidaten (Beispiele):**
- Path-Segments lowercase (S1) — trivial transform
- Comma-separated string → array (G7) — spec-violation, fix unique
- `text/x-markdown` → `text/markdown` (RFC errata)
- Add `format: date-time` auf timestamp-named integer fields
- Type coercion `type: number` → `type: integer` für count-Felder
- Default-value-type-correction für primitives
- Markdown-no-html-rule auto-conversion (when text-only)

**Severity-Schema-Erweiterung:** neues meta-flag `autoFixSafe: boolean`. Patterns explicit-tagged.

**Apply-Mechanik:** existing `validate-patches` pipeline + RFC 6902 patches. Patches werden auf spec-clone appliziert → "pre-cleaned spec".

**User-UX-Constraint:** auto-applied patches müssen im Output sichtbar sein als "Stage A auto-applied N patches" — User behält Review-Power, sieht nur was geändert wurde.

#### Layer 2 — Findings-Compaction zu Category-Summary
Mehrheit der findings (~85%) wird NICHT applied, sondern dedupiert zu Pattern-Categories für system-prompt-context.

**Compaction-Schritte:**
1. Group raw findings by `detectorId` / `patternId`
2. Each unique pattern → 1 category-line "PatternId: short-description (N occurrences)"
3. Result: ~30-50 category-lines, ~5KB tokens overhead

**Output-Beispiel:**
```
Stage A detected the following pattern-categories (don't duplicate):
- TM-A50: webhook-signature-missing (2 occurrences)
- EV-11: inconsistent-error-shape (17 distinct shapes)
- CL-1: multi-lang-reserved-keyword (551 occurrences)
- L9-2: operationId-not-tool-name-compatible (1145 ops affected)
- ...
```

#### Layer 3 — Per-Endpoint Findings-Slicing für Phase-1
Phase-1-calls sind per-endpoint. Pro call braucht LLM nur die Stage-A-findings die DIESE Operation betreffen, nicht die gesamte Liste.

**Mechanik:** für jede Phase-1-call:
1. Extract operation-level findings die `path` + `method` matchen
2. Inject als "Stage A flagged on this op: [3-5 findings]" in den prompt
3. Token-overhead pro call: ~1-3K (klein)

### Token-Budget-Math (mit 3-Layer-Cleanup)

| Spec | Pre-cleaned spec | Category-Summary | Phase-1-call (per op) | Phase-2 input |
|---|---|---|---|---|
| pagerduty-full | ~140K | ~5K | ~10K (op-slice + system) | ~250K (cleaned + cats + filtered phase-1 outputs) |
| github-rest | ~180K | ~5K | ~12K | ~280K — ⚠️ noch overflow |
| stripe-full | ~150K | ~3K | ~10K | ~220K — ⚠️ noch overflow |
| dnd5eapi | ~30K | ~2K | ~5K | ~80K — fine |

**W4-measured Token-Budget-Math (post-W2/W3):**

| Spec | Findings (raw) | Codegen-share | Other-share | Per-Endpoint-Slice viable? | Phase-2-aggregator viable? |
|---|---:|---:|---:|---|---|
| dnd5eapi | 746 | 264 (35%) | 482 | ✓ small | ✓ |
| pagerduty-full | 8.467 | 4.572 (54%) | 3.895 | ⚠ (~14 findings/op) | ⚠ overflow ohne map-reduce + codegen-aggregation |
| stripe-full | 12.947 | 3.430 (26%) | 9.517 | ⚠ | ✗ overflow ohne aggregation |
| github-rest | 30.939 | 9.834 (32%) | 21.105 | ✗ floods | ✗ overflow definitiv |

**Implication:** Phase-B Engineering kann **erst nach codegen-validation Output-Aggregation** starten. Naive Token-Budget mit 30.939 individual codegen findings sprengt jede Phase-2-Strategie.

**Implication:** Phase-2 aggregator-call braucht **map-reduce** für große Specs:
- Phase-2 wird in chunks gemacht (z.B. groupiere phase-1-outputs zu 10er-chunks)
- Pro chunk emittiert phase-2-mini cross-cutting-findings für diese 10 ops
- Final merge step kombiniert chunk-outputs

Alternative: phase-2 nutzt extended-context-Modelle (Sonnet 4.6 hat 200K, hypothetisches "Sonnet 4.7 1M" wäre ideal aber nicht GA für Phase-B).

---

## 3. v6-Prompt Design

### Prompt-Structure (Skeleton)

```markdown
# System Prompt — apiq Phase B v6

You are an expert API-design reviewer with deep training-knowledge of:
- Stripe API conventions (idempotency-keys, expandable refs, rate-limit headers)
- GitHub REST API conventions (X-GitHub-Api-Version, Link-header-pagination)
- PagerDuty API conventions (From-header on writes, X-EARLY-ACCESS markers)
- Standards: RFC 9110, RFC 9457, RFC 7807, RFC 9700, RFC 8725

## Stage A has already detected these pattern-categories (DO NOT duplicate):
{category-summary}

## Your task: find what Stage A CANNOT detect — focus on these 4 lenses:

### Lens 3 — Evolution-Friction
Future-breaking-change-prediction. Patterns that look fine today but will break clients on next API-version. E.g.: required-field on growing-resource looks stable but will need to become optional.

### Lens 5 — Style-Coherence
Cross-spec API-style consistency. E.g.: most endpoints REST-Level-2 but 3 endpoints RPC-style with custom-method-suffix — design-drift.

### Lens 8 — Internal-Consistency
Cross-operation invariants Stage A's per-rule scope can't see. E.g.: operation-X returns ResourceA but operation-Y references resource as ResourceB-Summary — schema-drift.

### Lens 9 — AI-Agent-Consumability
LLM-tool-call-readiness. E.g.: descriptions that confuse function-calling, polymorphic responses without discriminator, examples that contradict schema.

## Output format
Emit findings as structured JSON matching apiq's FindingSchema. Each finding MUST have:
- patternId: novel pattern not in stage-a-categories
- severity: error|warn|hint|info
- lens: one of [evolution-friction, style-coherence, internal-consistency, ai-agent-consumability]
- explanation: WHY this is a finding (knowledge-backed-rationale)
- patchOps: RFC-6902 patch if you can suggest a fix; null if subjective

## Constraints
- DO NOT emit findings that match stage-a-category-IDs
- DO NOT hallucinate patterns that don't apply (lower confidence > false positives)
- DO NOT emit findings on things you're not certain about — emit fewer high-quality findings
```

### Per-Phase-1-Call Augmentation

```markdown
# Operation Context
Endpoint: POST /v1/charges
Operation-spec: {operation-block}

## Stage A detected on this op:
- CL-1 (multi-lang-keyword): operationId "createCharge" valid in all targets ✓
- TM-A22 (list-pagination): N/A (not list-endpoint)

## Your turn: find knowledge-backed-gap on THIS endpoint
{operation-specific instructions}
```

### Per-Phase-2-Call Augmentation

```markdown
# Cross-Spec Aggregator Pass

## Pre-cleaned spec summary:
{spec-overview}

## Phase-1-output-summary:
{phase-1-findings count by lens, top-3 patterns}

## Look for:
- Cross-operation inconsistencies (Lens 8)
- Style-coherence patterns (Lens 5)
- Evolution-risk-cascades (Lens 3)
```

---

## 4. Multi-Run-Plan (Critical-Review-#2 endlich erledigt)

### N=3 auf 1 well-instrumentierten Spec
- **Spec:** pagerduty-full (~600 ops, complete API, gut-bekannt)
- **Runs:** N=3 mit identischem prompt + temperature
- **Cost:** ~$3-5 per run × 3 = ~$10-15
- **Goal:** Run-Varianz-Signal — coverage-Werte ±5-8 percentage points expected

### Plus N=1 auf 3 weiteren Specs für Coverage
- **Specs:** stripe-full, github-rest, dnd5eapi
- **Runs:** 1 each
- **Cost:** ~$5-8 each × 3 = ~$15-24
- **Goal:** spec-diversity-signal

**Total Phase-B-Cost-Estimate: ~$25-40 für full empirical pass.**

---

## 5. Output-Merging zur Original-Spec

### Problem
LLM emittiert findings auf "pre-cleaned spec" mit cleaned-Pfaden. User sieht ORIGINAL spec. Path-Mapping ist non-trivial wenn auto-applied patches Felder hinzugefügt/entfernt haben.

### Lösung
**Auto-fix-safe patches sind reversibel/trackbar.** Beim Apply:
1. Speichere `applyTrace`: `{originalPointer, patchOp, newPointer}` für jeden auto-applied finding
2. Beim Output-Merge:
   - LLM-finding-pointer in cleaned-spec → original-spec via inverse-applyTrace
   - Wenn pointer in autopatched-region: map zum nearest original-ancestor
3. User-UI zeigt: "Stage A auto-applied: [N findings] | Stage A flagged for review: [M findings] | LLM additional: [K findings]" — alle pointers gegen ORIGINAL spec

---

## 6. Two-Call-Architecture (C-i) — Existing aus Spike-Doc

(C-i) Sonnet 4.6 Phase-1 + Sonnet 4.6 Phase-2 ist die Architektur per Stage 3 measurements. Phase-B nutzt diese unverändert. Plus prompt-caching für system-prompt + category-summary (90% discount auf cached input tokens).

**Erwartete Cost-Reduction durch caching:**
- System-prompt: ~3K tokens, used in 600+ phase-1-calls = ~1.8M cached tokens
- Discount: 90% → ~$3-4 saved per pagerduty-run

---

## 7. Phase-B Success-Criteria

### Quantitative
- Coverage gegen Stage-A-references-set: ≥60% substantive (Critical-Review pass-threshold)
- Hallu-rate: ≤2% (false-positives in stripe-reference)
- Run-variance: ±10pp on coverage-pass
- Cost per pagerduty-run: ≤$5

### Qualitative
- LLM-findings emittieren CLEARLY Lens-3/5/8/9-class patterns die Stage A nicht catched
- Apply-patches haben semantic correctness on subjective patterns (~70% user-acceptance)
- Per-endpoint slicing reduziert irrelevant LLM-output (no flooding)

### Pass/Fail
- **Pass:** alle quantitative-Criteria + 2/3 qualitative → Phase-C Spike-Lock + Foundation-Block-Plan
- **Partial:** quantitative-pass aber qualitative-mixed → v7-Prompt-Iteration (additional cost)
- **Fail:** quantitative-fail → strategische Re-Evaluation (Differentiator-Claim wackelt; Stage A allein als Lens-9-positioning ship-bar)

---

## 8. Open Questions

1. **`autoFixSafe`-tagging:** ist das Tagging als rule-metadata genug, oder braucht jeder Pattern eine apply-test (idempotent test on real specs)?
2. **Map-reduce für Phase-2:** wie chunk-en (operation-groupings? path-prefix-groupings?), und wie merge-mini-aggregator-outputs zu finaler aggregator?
3. **Auto-Fix-Safe Coverage:** schätzungsweise 15% der ~290 patterns. Reicht das für token-budget? Oder brauchen wir mehr aggressive auto-fixing?
4. **N=3 statistical-power:** ist N=3 genug für ±5pp variance-confidence? Oder N=5 für tighter signal?
5. **Stripe-quirk-handling:** Stripe-spec hat 262 GET-with-body (RFC-violation aber Stripe-design). Wie pre-clean — auto-fix wäre breaking-change. Sollten Stripe-quirks in stage-a-skip-list?
6. **Prompt-caching-stability:** ändert sich category-summary zwischen Phase-1-calls (sollte nicht), oder muss pro call neu computed werden?
7. **Stage-A pipeline-wiring (W2):** ✓ RESOLVED 2026-05-06. 15 of 17 module-classes wired in `scripts/spike/deterministic/modules/index.ts` (spec-diff stays orphan, 2-Spec). All 5 custom-functions referenced by active rules. 110 total active spectral rules.

8. **codegen-validation Output-Aggregation (NEW post-W4):** das Modul emittiert per-occurrence findings (9.834 für ein Root-Problem auf github-rest). Phase-B-Token-Budget kann das nicht in 200K-Context stuffen. Optionen: (a) module-side: codegen-validation aggregiert intern + emittiert 1 Finding mit `{occurrences: 9834, locations: [...]}`; (b) output-mapper-side: collapse all `codegen:*` findings zu 1 category-row vor LLM-prompt; (c) findings-compaction: pattern-id-based grouping schon im Compaction-Layer-2. Decision: pragmatisch (b) zuerst — 1-2h work, kein Modul-Code-Change. Pre-Condition für Phase-B-Engineering-Start.

9. **Reference-Findings Authenticity (NEW):** alle 4 Reference-Sets sind LLM-authored, never human-hardened (per `humanHardenedDate: null` in JSON). Coverage-Messung gegen LLM-References ist meta-circular. Empfehlung: dedicated Re-Classification Subagent-Task vor Phase-B (~2-3h) — `isPureSpectralDetectable` ehrlich tagger.

10. **Cross-Linter-Parity Smoke (NEW):** Vacuum/Redocly/Spectral-OWASP comparison nie ausgeführt (siehe `critical-review.md:528`). "Konkurrenz-Pari"-Claims sind un-tested. Smoke-Test (~1h) — wenn Stage-A wirklich Pari erreicht, supports "best-in-class deterministic linter"-Positioning für PRD; wenn nicht, dann positioning braucht Reframe.

---

## 9. Verbindung zu anderen specs

- Wenn Welle E (T24 Putz-Niveau-Benchmark) abgeschlossen ist, kann Phase B starten.
- `autoFixSafe` braucht Severity-Schema-Erweiterung (T23 update — kleiner Patch-Commit).
- Findings-Compaction-Module + Auto-Apply-Module sind neue Komponenten in `scripts/spike/deterministic/` (oder `scripts/spike/phase-b/`).
- Phase-B-Cost-Schätzung ($25-40) muss in PRD-Revision (BYOK-decision) einfließen.

---

## 10. Implementation-Plan-Estimate

| Step | Effort |
|---|---|
| Severity-Schema `autoFixSafe`-flag-extension + tag ~30-50 patterns | 0.5 d |
| Findings-Compaction-Module (~30-50 lines + tests) | 0.5 d |
| Per-Endpoint Findings-Slicer | 0.5 d |
| Auto-Apply-Patcher (`apply-safe-only.ts`) | 0.5 d |
| v6-Prompt-Engineering + iteration | 0.5-1 d |
| Two-Call-Dispatcher integration mit pre-pass | 0.5-1 d |
| Map-reduce für Phase-2 (only if needed for github-rest/stripe-full) | 1 d |
| Output-Merger + apply-trace tracking | 0.5 d |
| N=3 multi-run + analysis | 0.5 d (mostly wallclock) |
| **Total Phase-B Engineering vor erstem Run** | **~3-5 days** |
| **Phase-B Run-Cost** | **~$25-40 LLM-cost** |

(Ursprünglich hatte ich Phase B mit "1 Tag" geschätzt — das war falsch. Realistic mit Stage-A-Integration ist 3-5 Tage Engineering plus Cost.)

**Pre-condition:** Phase B Engineering kann nicht starten bevor (alle DONE 2026-05-06):
- W1 doc-honesty sync ✓
- W2 module-wiring (15 modules in `modules/index.ts`) ✓
- W3 4 threat-p1 YAML-Rules ausgeschrieben ✓
- W4 stage-a-validation re-run auf 4 Specs ✓

Plus zusätzliche Pre-Conditions aufgrund W4-Findings:
- **codegen-validation Output-Aggregation** (OQ8 ~1-2h) — Pre-Condition für Token-Budget-Math
- **OPENAI_API_KEY env-loading fix** (~10min) — Embedding-Scorer für ehrliche Coverage
- **Reference-Findings Re-Classification** (OQ9 ~2-3h)
- **Cross-Linter-Parity Smoke** (OQ10 ~1h, optional aber wertvoll für Positioning-Claims)

Total Pre-Phase-B-Restwork: **~5-7h Engineering**. Phase-B-Engineering selbst danach unverändert ~3-5d + ~$25-40 LLM-Cost.
