# Big-Spec Architecture Spike — Critical Review

> Kritische Evaluation des Spike-Stands (Draft 0.11) durch Claude Code, 2026-05-05, vor Final-Lock.
> Zweck: blind spots der bisherigen Empirik + Empfehlungen offenlegen, bevor `runAnalysis` migriert wird.
> Status: Diskussions-Input, nicht Spec-Update. User entscheidet welche Punkte das Spike-Doc oder den Foundation-Block beeinflussen.

## Methodische Schwächen

### 1. Reference-Target ist LLM-authored — Coverage-Score ist self-validation

Der Stripe-Reference (29 Findings) ist von Claude Code geschrieben, vom User gehärtet. Das Caveat steht in `specs/big-spec-architecture-spike.md` §"Methodology caveats", aber die Implikation wird nicht durchgezogen: **Findings die LLMs gut surfacen, landen im Reference. Findings die LLMs strukturell verfehlen, landen NICHT im Reference.** Der "66.7% substantive coverage"-Wert misst damit primär ob (C-i) gegen einen LLM-Maßstab konsistent ist — nicht ob er einen echten Stripe-Engineer-Maßstab trifft.

Konkrete Konsequenz: die Pass-Threshold-Schwelle (60%) ist gegen einen biased Reference gemessen. Empirisch belegt ist *"(C-i) bestätigt sich selbst gegen LLM-Reference"*, nicht *"(C-i) findet 66.7% der echten Probleme"*. Der Differentiator-Claim hängt aber genau am zweiten.

→ **Vor Foundation-Block-Lock muss mindestens EIN Reference-Target von einem nicht-LLM-Hardener kommen.** PagerDuty hat keinen Reference (qualitativ-only). Ein 60-Min-Pass über Stripe-Reference durch jemanden mit Stripe-API-Exposure würde substantielle Reframings bringen.

### 2. N=1 pro Architektur × Spec — Run-to-Run-Varianz nicht gemessen

Sonnet bei temperature>0 produziert nicht-deterministisch. Eine zweite (C-i)-Stripe-FULL-Run würde nicht 1423 Findings liefern, sondern wahrscheinlich 1300-1550. Coverage-Werte könnten ±5-8 Prozentpunkte variieren. **Damit wäre die 66.7%-substantive-coverage-Pass durch Run-Varianz potenziell ein 60-72%-Bereich.**

Der Spike behauptet "(C-i) wins on quality dimensions by significant margin". Die Margin gegen (A) ist groß genug dass Varianz das Ranking nicht kippt. Aber für Pass-Threshold-Validierung (60% Schwelle) ist N=1 zu wenig.

→ **Eine zweite Stripe-Run = $5.86 — billiger als die Q1-A/B die vorgeschlagen wird.**

### 3. Prompt-Caching ist nicht implementiert — 40-60% Cost auf dem Tisch

Im `scripts/spike/two-call-dispatcher.ts` gibt's keine `cache_control`-Einträge. Alle 587 Per-Endpoint-Calls schicken den vollen System-Prompt unkachiert. Anthropic-Prompt-Caching gibt 90% Discount auf cached input tokens; bei einem konstanten ~2-3K-Token-System-Prompt × 587 Calls = **~1.5-1.8M cached input tokens, ~$3-4 pro Stripe-Run gespart.**

→ **Die $5.86 sind nicht (C-i)-Cost, sondern (C-i)-without-caching-Cost.** Mit Prompt-Caching wären es realistisch $2-3. Das verändert die Cost-Sustainability-Math signifikant — bear-case wäre weiter self-fundable, base-case grenzwertig statt nicht-fundbar. Die BYOK-as-v1-must-Empfehlung beruht auf einer *unoptimierten* Cost-Baseline.

→ Sollte vor Foundation-Block-Lock empirisch gemessen werden, **weil davon abhängt, wie aggressiv BYOK / Pricing-Tiers im PRD verschoben werden müssen.**

## Architektur-Schwächen

### 4. (B) Naive-Chunking — der "default to v1.1"-Trap

$5 Cost, 30-45 min Engineering. Skip-Empfehlung steht ohne empirische Grundlage. Wenn (B) 70-80% der (C-i)-Quality bei 30-50% des Cost liefert, ist das **die Pro-Tier-Architektur** und (C-i) wandert in Enterprise. Die ganze Pricing-Struktur ändert sich.

Memory-Eintrag *"Don't default to 'defer to v0.2' in recommendations"* trifft hier. Der Doc selbst sagt "Untested in spike" und schiebt es nach v1.1 — ohne Messung.

→ **(B) sollte getestet werden, nicht skipped.** $5 + 45 min vs. potenziell signifikante Pricing-Implikation = klarer Test.

### 5. (C-i) für ALLE Spec-Größen — UX-Risiko unterschätzt (in Web-Tier)

Behauptung im Spike-Doc: dnd5eapi (47 Ops) → 135 Findings unter (C-i) vs. 11 Findings unter (A) Sonnet, "12× mehr Findings bei 3.1× cheaper per-finding-cost". Empfehlung: (C-i) für free-tier auch.

**Das ist eine Cost-Optimierung, keine UX-Optimierung.** 135 Findings auf 47 Endpunkten = ~3 Findings pro Endpunkt. Für einen ersten "Magic Moment"-Web-User der einen kleinen Spec hochlädt, ist 11 Findings (kuratiert) ein besseres Erlebnis als 135 (Spam). Selbst mit Priority-Sort ist die kognitive Last höher.

**Caveat post-User-Discussion 2026-05-05:** der primary use case ist agent / MCP / CLI / GitHub-Action — nicht Web-UI. Für agent-konsumierte Findings ist *mehr* besser, nicht schlechter — der Agent kann filtern, ranken, kontextualisieren. Damit kollabiert dieser Punkt für den primary use case. Bleibt relevant für Web-Free-Tier-Demo (sekundär), wo 10-20 kuratierte Findings das bessere Onboarding liefern.

→ **Für agent-primary-use bleibt (C-i) für alle Spec-Größen richtig.** Für Web-Free-Tier-Demo sollte ein UX-Test mit echtem User entscheiden ob 135 Findings auf 47 Ops aktionierbar wirken — ggf. eigene Tier-A-Pipeline für Web-Free-Tier.

### 6. Modell-Single-Point-of-Failure

Sonnet 4.6 Phase-1 + Sonnet 4.6 Phase-2 = das gesamte v1-Compute hängt an einem Modell. Anthropic deprecated Sonnet 4.5 in Q1 2026 mit ~3 Monaten Vorlauf. Ein Pricing-Bump um 30% (passiert) zerstört Pro-Tier-Marge. Eine Quality-Regression auf Sonnet 4.7 zwingt zu Notfall-Re-Calibration der v6-Prompts.

Der Spike hat Gemini 2.5 Pro auf Stripe gemessen (für (A)). Aber **Gemini Phase-1 unter (C-i)** ist nicht gemessen. Wäre wahrscheinlich vergleichbare Quality bei deutlich niedrigerem Cost; könnte Modell-Lock-In aufbrechen.

→ Mindestens als v1.1-Fallback-Pfad sollte das gemessen sein. Ein einziger PD-FULL (C-i)-Run mit Gemini Phase-1 = $0.60-0.80, 30 min Engineering.

### 7. 34-Min-Latency UX-Implikation für Cold-User

Async-Job-Pattern wird genannt. Email-on-Complete als v1.1. **Caveat post-User-Discussion 2026-05-05:** für agent / CLI / PR-Action ist 34-min-Latency nicht UX-kritisch — CI-Job wartet sowieso async, Agent kann polling laufen lassen, User checkt nicht aktiv mit. Damit kollabiert dieser Punkt für den primary use case.

Bleibt relevant für Web-Demo: ein HN-Frontpage-Visitor der Stripe.json hochlädt und "34 min" sieht, kommt nicht zurück.

→ **HN-Launch-Strategie muss small-spec-flavored sein.** Anonymous-Demo (Epic 19) auf small Specs limitiert + gefakte Pre-Computed-Demos für large-spec-marketing-screenshots. Nicht falsch, aber muss bewusst gestaltet werden — das Spike-Doc beschreibt das technische Problem (§"Long-running-job handling") aber nicht die produkt-strategische Konsequenz.

### 8. 0.7% Hallucination = 10 wrong patches pro Stripe-Run

Klingt klein. Bei "Apply All Critical" auf einem Stripe-FULL-Output werden ~10 Hallucinated Findings als Patches appliziert. **Tier-0 fängt structural broken specs, nicht subtle wrong patches.** Validate-patches hat false-negative rate ungleich null.

Der "Skip-Stale"-UX adressiert Conflicts, nicht "Apply hat einen falschen Pfad geschrieben". Bei Pro-User mit 10 Big-Spec-Analysen/Monat = ~100 wrong-applies/User/Monat im Worst-Case. Trust-Erosion ist real — auch im agent-primary-use, weil Agent ja im Namen des Users patched.

→ **"Apply All Critical"-Feature braucht eine Confidence-Threshold zusätzlich zu Severity** (nur high-confidence-high-severity batchen). Im Spike-Doc nicht explizit. Sollte in Foundation-Block.

## Plan-Schwächen

### 9. Q1-A/B ist Scope-Creep — single run reicht

Q1-Empfehlung im Spike-Doc: A/B = ~$8, ~3h. Misst zwei Dinge gleichzeitig: v6-Prompt-Effekt + Pre/Post-Pipeline-Effekt.

Aber:
- Pre/Post wird in Foundation-Block sowieso gebaut und dort messbar
- v6-Prompt allein ist die spike-relevante Frage (validiert die confidence/impact-Schema-Extension + die 5 missed substantive refs)

→ **Q1 als single v6-only-Run.** $4, 1.5h. Validiert die Schema-Extension. Pre/Post-Layer wandert in Foundation-Block-Engineering wo Messung im echten DB-System sauberer ist.

### 10. PRD-Revision = nicht "1-2 Tage", sondern eigener Foundation-Block

Die Liste in `LAUNCH-PROGRESS.md` (BYOK v1-must, Pricing-Tiers, Async-Pattern in 4 Epics, Workspace-Cap-Increase, Tier-0a/0b correctness, Cost-Per-User-Metric) ist nicht "PRD-Revision". Das ist:

- BYOK-Implementierung = 1-2 Tage Engineering
- Pricing-Tier-Entwurf + Pricing-Page-Design = 0.5-1 Tag
- Async-Job-Pattern als Foundation-Library = 1-2 Tage (über alle Epics geteilt)
- 4 Epic-Specs (14, 17, 20, 21) müssen revidiert werden — mindestens je 0.5 Tag

→ Realistischer: **5-7 Engineering-Tage zusätzlich vor Epic-14-Start.** Nicht in der v1-Launch-Timeline-Math drin.

### 11. Anthropic-Tier-2-Throttling am Launch-Day nicht gelöst

Doc sagt: 2 parallele Pro-User = 1200 RPM = throttled. Tier-3 enrolment "if MAU exceeds Tier-2 capacity". Aber:
- HN-Spike-Day-Szenario: 1000 Anon-User in 24h. Selbst mit 5% concurrent = 50 parallele User = 30000 RPM = total throttled
- Tier-3-Enrolment hat operativ Vorlaufzeit (Anthropic-Account-Review)

**Caveat post-User-Discussion 2026-05-05:** wenn agent-primary-use mit BYOK dominant ist (was die operative Realität bei einem Dev-Tool wahrscheinlich ist), reduziert sich die Anthropic-Direct-Last auf apiq's eigenen Account substantially — agent-user nutzen ihren eigenen Anthropic-Key.

→ **Tier-3 trotzdem vor Launch enrollen** für Web-Tier-Buffer + Pro-Tier-non-BYOK. Nicht reaktiv.

## Empfehlungs-Tabelle (post-User-Discussion 2026-05-05)

| Status-Quo-Empfehlung | Position nach Critical Review |
|---|---|
| Q1 als A/B | **Q1 als single v6-Run** — Pre/Post in Foundation-Block messen |
| Q2 (B) skip | **Q2 (B) testen** — $5 + 45 min, kann Pricing-Math kippen |
| (C-i) für ALLE Specs | **Für agent-primary-use richtig.** Für Web-Free-Tier UX-Test |
| Reference-Target = LLM-authored, Caveat | **Mindestens einen Spec mit human-domain-expert Reference härten** vor Foundation-Lock |
| Coverage 66.7% gegen Pass 60% | **Mit N=1 nicht entscheidbar** — zweite Stripe-Run = Run-Varianz |
| Cost-Baseline $5.86/Stripe-Run | **Prompt-Caching messen** vor BYOK-as-v1-must-Lock — könnte halbieren |
| Sonnet+Sonnet als Architektur | **Gemini-Phase-1-Fallback empirisch validieren** (1 PD-Run = $0.80) |
| PRD-Revision = "1-2 Tage" | **5-7 Engineering-Tage realistisch** — in v1-Launch-Timeline einarbeiten |
| Tier-3 Anthropic "if needed" | **Tier-3 vor Launch enrollen**, nicht reaktiv (auch wenn BYOK das entlastet) |
| Apply-All-Critical UX | **+ Confidence-Threshold-Filter** (nur high-confidence batchen) |

## Konkreter Plan-Vorschlag (post-User-Discussion 2026-05-05)

User-Anmerkung 1: **agent / MCP / CLI / GitHub-Action ist primary use case.** Reduziert UX-Sorgen für (C-i)-Findings-Volumen + Latency-Conversion. Web-UX ist secondary; HN-Demo small-spec-flavored.

User-Anmerkung 2: **v6-Prompt zuerst — kann nicht schlechter sein als jetzt-null-funktioniert auf knowledge-backed-gap-class.** Logisch richtig. Risiken (Hallu-Amplification, Anti-Pattern-D-Regression) sind durch Guardrails managbar. Worst case: v6 löst das Defizit nicht UND verschlechtert andere Dimensionen — Wahrscheinlichkeit ~10-20%. Net-Erwartung deutlich positiv.

Empfohlene Reihenfolge (ersetzt jetzigen Q1/Q2-Plan):

1. **v6-Prompt schreiben** + Schema-Extension (confidence + impact). ~1.5h.
2. **Prompt-Caching im Dispatcher implementieren.** ~30 min.
3. **v6 + Cache: PD-FULL (C-i)-Run.** Misst gleichzeitig: v6-Quality, Caching-Cost-Effekt, confidence/impact-Distribution. Erwartung: ~$1-1.50.
4. **v6 + Cache: zweite PD-FULL-Run** (same config, andere seed). Misst Run-Varianz. ~$1-1.50.
5. **v6 + Cache: Stripe-FULL-Run** für coverage-validation gegen Reference. ~$2-3.
6. *Optional*: **(B) Naive-Chunking-Run mit v6-Prompts.** Pricing-Tier-Empirik. ~$3.
7. *Optional*: **(C-i) mit Gemini Phase-1.** Modell-Fallback. ~$0.80.

Total: ~$10-12. Weniger als jetzige Q1-A/B + Foundation-Block-Discovery-Risiko, aber empirisch deutlich reicher. Lock danach.

Parallel offen (nicht blockierend für Spike-Lock, aber vor Foundation-Block):
- Human-domain-expert pass über mindestens einen Reference (Stripe oder PagerDuty)
- PRD-Revision-Realismus auf 5-7 Tage anpassen
- Anthropic-Tier-3 enrolment-Prozess starten (Vorlaufzeit)

---

## Update 2026-05-05 (Diskussions-Iteration 2): Findings-Inspection + deterministischer Layer

### Findings-Inspection — was wirklich emittiert wird

Direkter qualitativer Pass über die existierenden (C-i)-Outputs (`specs/big-spec-runs/haiku4-5_x_sonnet4-6__two-call__{pagerduty-full,stripe-full}.json`).

**PD FULL — Top-30 most-frequent finding-titles (~230 von 623 Findings = 37%):**
- "Missing 429 response definition" + 6 Title-Variants → **~67 Findings** für einen einzigen Befund
- "Missing 401" Variants → ~30 Findings
- "Missing 404 / 5xx" Variants → ~25 Findings
- "POST returns 200 statt 201", "200 description empty", etc. → kleinere Cluster

**Stripe FULL — Top-15 (~250 von 1423 Findings = 17%):**
- "`limit` parameter missing min/max" + 6 Title-Variants → **~97 Findings** für einen Befund
- "Empty request body on GET" + 5 Variants → ~61 Findings
- "Missing examples on nested body" → ~9 Findings

**Substanz-Check:** die Findings sind inhaltlich nicht trivial — die emittierten Patches (oneOf-Constructs, readOnly-Removals, typed response schemas) sind echte Spec-Improvements. Aber das Volumen ist Artefakt der per-endpoint-Architektur **ohne Rollup-Clustering**.

**Spike-Numbers werden durch Rollup-Clustering korrigiert:**
- "(C-i) emits 119× more findings than (A)" → realistisch ~21× nach dedup
- 1423 Stripe-Findings → ~300-500 unique Befunde nach Rollup
- "Per-finding cost $0.005" → echte unique-finding-cost ~$0.025-0.030

### 12. Deterministischer Layer — die fehlende Architektur-Korrektur

User-Insight 2026-05-05: Wenn 50%+ der Findings deterministisch findbar sind (Spectral-class), warum lassen wir das LLM diese "Repetitions-Arbeit" machen, statt die deterministisch zu erledigen und das LLM nur seine **eigentliche** Differenzierungs-Arbeit (Knowledge-Backed-Gap) machen zu lassen?

**Schätzung deterministisch findbar (gegen die existierenden JSONs klassifiziert):**

| Spec | Top-Range deterministic | Long-Tail deterministic | Gesamt-Schätzung |
|---|---|---|---|
| PD FULL | ~95% der Top-30 | ~30-40% des Long-Tail | **50-65% aller Findings** |
| Stripe FULL | ~95% der Top-15 | ~25-35% des Long-Tail | **40-55% aller Findings** |

Empirisch zu validieren. Schätzung +/-10pp.

**Architektur-Konsequenz: apiq als Hybrid mit klarer Trennung statt LLM-First.**

| Layer | Macht was | Cost | Hallucination | Anteil |
|---|---|---|---|---|
| **Deterministisch** | Spectral-class + erweiterte Custom-Rules | $0 | 0% | 50-65% |
| **LLM** | Knowledge-backed-gap (F21+F22+F23 + die 5 unmatched substantive) | LLM-Cost | 0.7-1.1% | 35-50% |

**Was diese Architektur löst:**

1. **Differentiator-Validierung wird empirisch sauber.** Aktuelle Behauptung "(C-i) findet F21+F22+F23-class systematisch" ist verwässert durch ~50% Repetitions-Findings. **Wenn der deterministische Layer das wegnimmt, sehen wir was das LLM *wirklich* an Knowledge-Asymmetrie liefert.** Das ist die eigentliche Spike-Frage die nie sauber beantwortet wurde.

2. **Cost-Sustainability kollabiert als Sorge.** 50% weniger LLM-Output → ~$1.50-2/Stripe-Run statt $5.86. **Self-fundable bis Bull-Case** ohne BYOK-Notwendigkeit. BYOK kann zurück nach v1.1 als optional comfort-feature, nicht v1-must.

3. **Hallucination-Risiko sinkt strukturell.** Repetitive Findings haben das höchste Hallu-Risiko (LLM rät bei der 44. "missing 429"-Aussage Pfade aus). Deterministische Patterns haben null Hallu.

4. **Marketing-Positioning wird klarer.** Statt "vs. Spectral" → "**apiq = Spectral + Knowledge-Layer**". Spectral-User können dazukommen ohne Tool-Switching. Der LLM-Layer ist eindeutig der zusätzliche Wert.

5. **Apply-Patches-Trust steigt.** Deterministische Patterns haben *standardisierte Patches* (fehlende 429 → bekanntes Schema). Hallucination-Frei. Das löst das Apply-All-Critical-Trust-Problem aus Punkt 8.

**Engineering-Schätzung: 2-4 Tage**
- Spectral-OAS3-Default-Ruleset Integration (oder Spectral als lib direkt einbinden): ~0.5 Tag
- ~15-20 eigene Design-Patterns coden (aus Top-30-Liste extrahiert): ~2-3 Tage
- Apply-Patches-Templates pro Pattern: ~0.5 Tag

### Decision (User, 2026-05-05): Spike pausieren — deterministischen Layer bauen — DANN finale (C-i)-Messung

Der bisherige Plan (v6 + Pre + Post als Optimierungen auf bestehender LLM-Architektur) wird verworfen. Stattdessen:

**Stage 4 des Spikes — deterministischer Layer als Pre-Pass-Filter** (im Spike-Harness, nicht src/lib/, damit Foundation-Block den Code später wie üblich portiert).

### Aktualisierter Plan

**Phase A — Deterministic Layer Bau (~2-4 Tage)**

1. **Pattern-Extraktion aus existierenden JSONs:** systematischer Klassifikations-Pass über top-frequent finding-titles in `pagerduty-full.json` + `stripe-full.json` + `dnd5eapi.json` + `github-rest.json`. Output: Liste der ~15-20 deterministisch findbaren Patterns mit definierten Trigger-Conditions.
2. **Spectral-Integration evaluieren** (lib oder selbst implementieren):
   - Wenn Spectral als npm-lib genutzt wird: ~0.5 Tag Integration + Custom-Ruleset
   - Wenn selbst implementiert: ~1 Tag mehr Engineering, dafür kein Spectral-Dependency
   - User-Entscheidung nach Eval
3. **Custom-Rules implementieren** für die ~15-20 Patterns die Spectral-Default nicht abdeckt: jeder Pattern = Walker-Function + Apply-Patch-Template + Test gegen die JSONs.
4. **Output-Schema vereinheitlichen:** deterministische Findings müssen das gleiche `FindingSchema` produzieren wie LLM-Findings (mit `category: 'correctness'` oder neuer category-Wert), so dass Downstream-Pipeline sie nicht unterscheiden muss.
5. **Validierungs-Pass:** Deterministic-Layer gegen existierende `pagerduty-full.json` + `stripe-full.json` Findings laufen lassen. Erwartung: 50-65% PD / 40-55% Stripe der LLM-Findings werden vom deterministischen Layer "vorweggenommen".

**Phase B — Finale (C-i)-Messung mit deterministisch-vorprozessiertem Spec (~$5-8)**

6. **Deterministic Pre-Pass im Two-Call-Dispatcher:** vor Phase-1 LLM-Call läuft Deterministic-Layer; emittiert Set-A-Findings. Das LLM bekommt im Phase-1-Prompt "diese deterministischen Findings sind bereits identifiziert: [Set-A]; konzentriere dich auf knowledge-backed-gap-class".
7. **v6-Prompt schreiben** mit Wissen über deterministischen Layer (LLM weiß was es NICHT mehr finden muss). ~1h.
8. **Prompt-Caching im Dispatcher.** ~30 min.
9. **PD-FULL (C-i)-Run** mit Pre-Pass + v6 + Cache. Misst: was emittiert das LLM jetzt — ist es überwiegend Knowledge-Backed-Gap-Class? Erwartung: ~$0.80-1.50, ~150-250 LLM-Findings (statt 623), Knowledge-Class-Anteil deutlich höher.
10. **Stripe-FULL (C-i)-Run** mit gleicher Pipeline. Erwartung: ~$2-3, ~600-800 LLM-Findings (statt 1423). Coverage gegen Reference messen — der Test ob die echte Differentiator-Empirik hält.
11. **Run-Varianz:** zweite PD-Run mit gleicher Pipeline für Statistical-Signal.
12. **Optional:** (B) Naive-Chunking + Gemini-Phase-1-Fallback in der gleichen Pipeline.

**Phase C — Spike-Lock**

13. Spike-Doc auf Draft 1.0 updaten mit korrigierten Headline-Numbers + Hybrid-Architecture als Empfehlung.
14. `specs/09-big-spec-architecture-spike-results.md` schreiben.
15. Commit + Push, Epic 09 schließen.
16. Foundation-Block-Engineering kann Deterministic-Layer-Code aus `scripts/spike/` nach `src/lib/analysis/deterministic/` portieren.

**Was nicht mehr in den Spike gehört, sondern Foundation-Block:**
- v6 Pre/Post-Processing-Light (Anti-Pattern-D-FP, Praise-Drop, Severity-Rebalancing) — sind LLM-Output-Cleaner, kommen nach Foundation-Lock
- Tier-0a Fatal-Validity (User-Visible Auto-Recover-UX) — Foundation-Block UX-Work
- Async-Job-Pattern, BYOK, Pricing-Tiers — Foundation-Block

### Status post-Decision

- Epic 09 Spike: **paused, Stage 4 in progress**
- Foundation-Block (Epic 14+): blockiert auf Spike-Lock
- LAUNCH-PROGRESS.md: Setup-Actions-Log Update folgt
- Memory-Handoff-File: Update folgt

---

## Update 2026-05-05 (Diskussions-Iteration 3): Eval-Framework als Phase 0

User-Insight 2026-05-05: Bevor wir Stage 4 starten — brauchen wir nicht ein professionelleres Test/Vergleichs/Evaluierungs-Setup? Aktueller Eval-Stand ist ad-hoc und genau diese Ad-hoc-Natur hat in der bisherigen Spike-Diskussion mehrere impressionistische Schlussfolgerungen produziert die durch die Critical Review revidiert werden mussten ("119× more findings" → realistisch 21× nach dedup).

### 13. Ad-hoc Eval-Setup — strukturelle Lücke vor Stage 4

**Was wir haben:**
- `run-arch.ts` mit CLI-Args (architecture × spec × model)
- `score-coverage.ts` mit token-Jaccard + plural-stemming
- Manual-Coverage-Audit als Freitext-Markdown (`_manual-coverage-audit*.md`)
- N=1 pro Konfiguration
- Reference nur für Stripe (29 findings, LLM-authored), in Markdown
- Cost / latency ad-hoc in JSON

**Was strukturell fehlt:**

| Lücke | Konsequenz |
|---|---|
| Keine Multi-Run-Aggregation (mean/p50/std über N runs) | Run-Varianz nie messbar — direkter Critical-Review-Punkt #2 |
| Reference-Target als Freitext, nicht strukturiert | Human-hardening + Mehrfach-References + automated-scoring schwierig |
| Coverage-Scorer monolithisch (nur Jaccard) | Vocabulary-Drift wird nicht überbrückt — Manual-Audit muss jedes Mal nachgezogen werden |
| Keine Repetition-Cluster-Erkennung | Stage 4 ist genau die Aufgabe Repetition zu klassifizieren — ohne Cluster-Scorer keine Stage-4-Validierung |
| Keine Comparison-Reports zwischen Configs | Δ zwischen v5 vs. v6 vs. v6+pre-pass müsste man von Hand zusammenklauben |
| Keine Regression-Snapshots | Bei 4-5 parallelen Pipeline-Komponenten (Deterministic Layer + v6 + Cache + Pre-Pass) kann eine Änderung eine andere subtil broken — würde unbemerkt bleiben |
| Kein Finding-Classifier (deterministic-class / knowledge-class / repetition-class) | Differentiator-Empirik bleibt impressionistisch |

### Optionen evaluiert

1. **3rd-Party-Framework** (Promptfoo, Inspect, LangSmith): alle haben Drift-Risiko + Wrapper-Komplexität für unseren spezifischen "OpenAPI-Finding-Coverage"-Use-Case. Promptfoo ist eher general-LLM-Output-Quality (LLM-judged scoring). Inspect ist Python — Wrapper um TS-Spike-Code. LangSmith ist hosted. **Verworfen.**

2. **Custom Eval-Framework im `scripts/spike/`-Harness, ~1 Tag Engineering.** Empfohlen.

3. **Code-Discipline ohne Framework**: alle Critical-Review-Punkte (Varianz, Coverage-Bias, Regression) bleiben unmessbar. Memory-Anti-Pattern "default to v1.1" — wir würden im Foundation-Block sowieso bauen müssen (für CI-Tests + Runtime-Monitoring). **Verworfen.**

### Decision (User, 2026-05-05): Phase 0 — Eval-Framework vor Stage 4

**Custom Eval-Framework, ~1 Tag Engineering, im `scripts/spike/`-Harness. Port-Pattern wie üblich nach `src/lib/eval/` im Foundation-Block.**

### Phase 0 Scope (~1 Tag Engineering)

| File | Purpose |
|---|---|
| `scripts/spike/eval/runner.ts` | Multi-Run-Runner mit Config-File-Loader; läuft N runs pro config (N=3 oder N=5 default), aggregiert mean / p50 / p95 / std |
| `scripts/spike/eval/scorers/jaccard.ts` | Bestehender token-Jaccard-Scorer als pluggable scorer-interface |
| `scripts/spike/eval/scorers/repetition-cluster.ts` | Group findings by normalized title — output cluster-size-histogram + unique-count |
| `scripts/spike/eval/scorers/classification.ts` | Klassifiziere findings als deterministic-class / knowledge-class / repetition-class (verfügbar nach Stage 4) |
| `scripts/spike/eval/comparison.ts` | Markdown-Δ-Reporter zwischen zwei configs (vorher / nachher) |
| `scripts/spike/eval/snapshots/` | Regression-Snapshots als JSON; neue run als snapshot-test gegen letzten lock |
| `eval-configs/*.yaml` | Declarative run-configs (architecture × prompt × model × pre/post × spec × runs) |
| `openapi-examples/<spec>/reference/findings.json` | Strukturiertes Reference-Format (migration von `findings-target-big.md`) mit Klassifikations-Tags: `isLintFlavoured`, `isKnowledgeBackedGap`, `isDeterministicallyDetectable`, `severity`, `category`, `narrationKeywords` |

**Day 2 optional (später, nicht Phase 0):**
- Embedding-Similarity-Scorer (für Vocabulary-Drift-Bridging — would replace much of manual-audit)
- LLM-as-judge-Scorer (nuancierte Manual-Audit-Replacement)

### Was Phase 0 für die nachfolgenden Phasen ermöglicht

- **Stage-4-Validation läuft eval-driven**: Repetition-Cluster-Scorer misst direkt was der Deterministic Layer wegnimmt — vor/nach-Vergleich automatisch.
- **Multi-Run-Statistical-Signal**: alle Phase-B-Runs werden N=3-5 mal gefahren — Run-Varianz endlich gemessen, Critical-Review-Punkt #2 erledigt.
- **Strukturiertes Reference erlaubt human-hardening parallel**: User kann reference-findings.json gegen Stripe-API-Knowledge gegenchecken während Phase A läuft.
- **Comparison-Reports automatisch**: jeder Run produziert Δ-Tabellen gegen baseline-Snapshot.
- **Foundation-Block bekommt fertigen Eval-Code**: Port nach `src/lib/eval/` als üblich; CI-Tests + Runtime-Monitoring nutzen denselben Code.

### Aktualisierte Reihenfolge

```
Phase 0 — Eval-Framework (~1 Tag, $0)
   ↓
Phase A — Deterministic Layer Bau (~2-4 Tage, $0, eval-driven validation)
   ↓
Phase B — finale (C-i)-Messung (~$5-8, mit N=3-5 multi-run statistical signal)
   ↓
Phase C — Spike-Lock
```

Total-Verzögerung gegenüber direktem Stage-4-Start: +1 Tag. Empirischer Gewinn signifikant.
