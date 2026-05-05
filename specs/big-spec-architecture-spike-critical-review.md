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

---

## Update 2026-05-05 (Diskussions-Iteration 4): Refs als Living-Artefakt + Stage-A-Tooling-Map

User-Insight 2026-05-05 (post-Phase-0 hardening): "Glaubst du Stage A wird einen Einfluss auf die Refs haben?" Antwort: ja, mit hoher Wahrscheinlichkeit. References sind Phase-0-Best-Effort, nicht frozen. Plus: "machen wir in Stage A nur Spectral oder auch andere Tools?" — Stage A ist mehrschichtig, nicht monolithisch.

### 14. Refs als Living-Artefakt — nicht frozen-on-Phase-0

Phase 0 hat 4 References authored (Stripe 29 + PD 23 + dnd5eapi 14 + GitHub 31 = 97 findings, 4 zod-validierte JSONs). **Stage A wird diese Refs mit hoher Wahrscheinlichkeit beeinflussen** auf vier Wegen:

**a) Klassifikations-Re-Tagging (~5-15% der Tags wahrscheinlich falsch).** Beim Bau der Detection-Mechaniken werden Klassifikations-Annahmen empirisch validiert oder falsifiziert. Beispiele:
- F23 (cross-resource refs) als pure-spectral getaggt mit `*_id`-Heuristik. Aber GitHub hat tausende korrekt-typed `*_id`-Felder → Heuristik wird noisy → eher domain-knowledge oder LLM-only.
- F11 (unix-time format) als pure-spectral getaggt, aber Walker braucht Field-Naming-Catalog (`_at`, `_timestamp`, ...) → eher domain-knowledge.
- Umgekehrt: F28 (rate-limit headers) als domain-knowledge getaggt, aber generischer Walker "spec hat 429-response → erwarte Retry-After/X-RateLimit-*" könnte pure-spectral reichen.

**b) Neue Refs entdecken.** Beim Pattern-Engineering werden Patterns auf den Tisch kommen die in Phase-0-Authoring vergessen wurden:
- OperationId-Uniqueness-Check (Spectral OAS3 default, nicht in Refs)
- `required` referenziert nicht-existierende property (0/97 Refs)
- `discriminator` referenziert ungültiges `oneOf`-Subschema (0/97)
- Cross-cutting statistical patterns (z.B. "spec-wide >70% empty-description" als single rolled-up finding)

**c) Recall-Annahmen empirisch falsifizieren.** STAGE-A-PREDICTIONS.md geht von 95% pure-spectral / 75% domain-knowledge recall aus. Diese Werte sind plausible Schätzungen, keine Messungen. Stage A misst sie real:
- Pure-spectral 95% könnte 100% sein (mechanical, no false negatives)
- Pure-spectral könnte 60% sein (Custom-Rules schwerer als gedacht)
- Domain-knowledge 75% könnte 30-90% sein (pattern-library-coverage-abhängig)
- ±15-30pp Auswirkung auf alle Phase-A-Predicted-Coverage-Numbers

**d) Patch-Konsistenz.** Refs haben händisch-authored RFC-6902-Patches. Stage-A-Patches sind template-generated. Wenn die Shapes divergieren, schlagen Patch-Equality-Tests fehl auch bei semantischer Korrektheit → Refs müssen ggf. angeglichen oder Test-Logik aufgeweicht werden.

**Konsequenz:** Refs + Predictions + Snapshots sind versioniertes Living-Artefakt. Stage A's Output ist nicht nur Code, sondern **ein Ref-Update-Diff**:
- N Tags umgetaggt mit Begründung
- M neue Refs hinzugefügt
- K Refs als deprecated markiert
- Echte Recall-Zahlen ersetzen die 95%/75% Hypothesen

Eval-Framework-Erweiterung (Tier-2-Optional): Snapshots sollten ref-hash-aware sein, sodass alte Snapshots nicht plötzlich "drift" zeigen wenn Refs sich ändern. Aktuell speichern Snapshots keinen ref-hash. Beim ersten Stage-A-Ref-Update werden die alten Snapshots logisch invalid; pragmatisch: Snapshots beim Stage-A-Lock zusammen mit Refs neu erzeugen.

### 15. Stage-A-Tooling-Map — nicht nur Spectral

Stage A's "Deterministic Layer" ist mehrschichtig, nicht monolithisch. Tooling-Aufteilung:

**Tier 1 (must-have für Stage A):**

| Tool | Rolle | Effort | Was es catched |
|---|---|---|---|
| `@apidevtools/swagger-parser` | Strukturelle Validität (Tier-0a) | 30min Integration (bereits im spike) | Invalid OpenAPI · dangling $refs · operationId duplicates · path-template-mismatches |
| `@stoplight/spectral-core` mit OAS3-default-ruleset | Pure-Spectral-Layer Kern | 0.5-1 Tag | ~10-15 von 73 pure-spectral refs nativ |
| Spectral Custom-Ruleset (eigenes) | Pure-Spectral-Layer Erweiterung | 2-3 Tage | Die ~50-60 verbleibenden pure-spectral refs |
| Custom TS-Walkers | Cross-cutting statistical checks die Spectral schwer ausdrücken kann | 1-2 Tage | Spec-wide aggregates (>70% empty-description), Pattern-Matching mit Catalog-Lookups |
| Domain-Knowledge-Layer (eigenes Engineering pro API-family) | Stripe/PD/GitHub-spezifische Pattern-Libraries | 1-2 Tage pro family | Idempotency-Key (Stripe), From-Header (PD), X-RateLimit-* (GitHub), etc. |

**Tier 2 (überlegen, wahrscheinlich skip):**
- **Vacuum** (Go) — Spectral-kompatibel, 100× schneller. Nur relevant bei Spectral-perf-Issues auf 1145-op-Specs. Spectral schafft das vermutlich.
- **Redocly CLI** — alternative Linter. Wenig Mehrwert wenn Spectral steht.
- **AJV** — schon in spike für Patch-Validation, nicht für Spec-Linting.

**Tier 3 (out-of-scope für Stage A):**
- **oasdiff** — breaking-change-detection, anderer Feature-Bereich, v1.1+
- **OpenAPI Generator / Mocking-Tools** — codegen / runtime mocking sind separate Epics (Epic 18 Live-Preview)

### Anti-NIH-Pattern + Open-Source-Marketing-Win

Spectral hat etabliertes Custom-Ruleset-Format (YAML/JSON) + Custom-Rules-API + JS-functions als Code-Rules. **Wir sollten nutzen, nicht nachbauen.** Wenn wir unsere Custom-Rules als Spectral-Ruleset publishen, kann die OpenAPI-Community sie nutzen → Open-Source-Marketing-Win für apiq (publish "apiq-spectral-ruleset", treibt Awareness, established Tooling-Standard).

**Was wir selbst bauen müssen:**
- Domain-Knowledge-Layer (keine Library macht "PD-From-Header-detection")
- Bridge zwischen Spectral-Output und unserem `Finding`-Schema (Spectral hat eigene Result-Shape)
- Cross-cutting Statistical-Walkers (Spectral ist per-node-rule-orientiert, nicht aggregations-orientiert)

### Stage-A-Phase-Aufteilung

| Phase | Scope | Effort | Predicted Coverage-Lift |
|---|---|---|---|
| **A1: Pure-Spectral-Layer** | Swagger-Parser + Spectral (OAS3-default + ~50 custom rules) + cross-cutting walkers | 3-4 Tage | Catched pure-spectral refs (73 total) → bei 95% recall: +69pp coverage cross-spec |
| **A2: Domain-Knowledge Stripe-only** | Pattern-Library für die 4 Stripe-domain-refs | 1-2 Tage | +10pp Stripe-coverage |
| **A3 (post-Stripe-validation, optional)** | Pattern-Libraries PD + GitHub + dnd5eapi | 3-5 Tage | Generalisiert Stage A auf 4 specs |

**Strategie-Empfehlung:** **A1 + A2 für v1-launch, A3 als post-launch / Stage-B-Iterations-Loop.** Total Stage-A für v1: ~5-7 Tage Engineering. A3 ist optional + iterativ — Pattern-Libraries pro API-family wachsen mit jedem zusätzlich-supported Use-Case.

### Aktualisierte Reihenfolge (post-Phase-0)

```
Phase 0 ✓ (DONE 2026-05-05) — Eval-Framework + 4 References + Stage-A-Predictions
   ↓
Phase A — Deterministic Layer (mehrschichtig)
  A1: Pure-Spectral-Layer       (3-4 Tage) — Spectral + Custom-Rules + Walkers
  A2: Domain-Knowledge Stripe   (1-2 Tage) — Pattern-Library Stripe-edition
  A3 (post-launch optional):     (3-5 Tage) — PD/GitHub/dnd5eapi pattern-libraries
   ↓
Phase B — finale (C-i)-Messung (~$5-8, multi-run mit Pre-Pass + v6 + Cache)
   ↓
Phase C — Spike-Lock + Ref-Update-Diff aus Stage A
```

Stage-A Output umfasst:
1. **Code:** `scripts/spike/deterministic/{spectral-runner,custom-walkers,domain-knowledge}.ts`
2. **Custom Spectral-Ruleset:** `scripts/spike/deterministic/apiq-ruleset.yaml` (publishable als community OSS)
3. **Ref-Update-Diff:** umgetaggte Klassifikationen + neue Refs + kalibrierte Recall-Zahlen
4. **Updated `STAGE-A-PREDICTIONS.md`:** echte Recall-Zahlen ersetzen 95%/75% Hypothesen
5. **Re-locked Snapshots:** alle 13 Stage-3-Snapshots werden mit Stage-A-pre-pass-output neu gemessen

---

## Update 2026-05-05 (Diskussions-Iteration 5): Cross-Layer Findings-Deduplication als Production-Feature

User-Insight 2026-05-05 (mid-Phase-A Vocabulary-Mismatch-Diskussion): "ist [embedding-similarity-scorer] nicht selbst schon ein apiq Feature an sich?"

### 16. Vocabulary-Bridging IS ein Production-Feature, nicht nur Eval-Tool

Was Phase 0 / Phase A als "Coverage-Scorer" baut (Token-Jaccard + Rollup-Clustering + narrationKeywords-aware-Matching + Embedding-Similarity) ist **mechanisch identisch zu einem load-bearing v1-Production-Feature: Cross-Layer Findings-Deduplication.**

**Die Production-Realität in v1:**

Eine Analyse-Run produziert findings aus 5 Layern:
1. **Spectral findings** (per-occurrence) — z.B. 47× "Operation should have operationId"
2. **Walker findings** (aggregated) — "All 47 ops missing operationId"
3. **Domain-Knowledge findings** — z.B. F7 Idempotency-Key
4. **LLM Phase-1 findings** (per-endpoint) — "Charge missing rate-limit declaration"
5. **LLM Phase-2 / Aggregator findings** (spec-level) — "Rate-limit headers undocumented across spec"

Dasselbe Issue wird häufig von 3+ Layern parallel emittiert. Der User darf in der Findings-Tab nicht 5× das gleiche sehen — er muss EIN finding mit gemerged `affectedEndpoints` + reconciled `patchOps` sehen.

**Konkrete Manifestationen in unserer Phase-A-Empirik:**

- Spectral emittiert 582× "HTML markup found in description" auf Stripe; Walker emittiert 1× "Operation descriptions use HTML markup" mit `affectedEndpoints: [582 Pfade]`. Beide sind dasselbe Issue. Aktuell würden beide getrennt im Output landen.
- Spectral 1096× "stub-only schema description" auf Stripe; Walker 1× "Component schemas carry empty descriptions (80.7%)"; Phase-2-LLM emittiert wahrscheinlich auch eine spec-level-Variante.
- F28 (rate-limit-headers): Domain-Knowledge-Layer emittiert + LLM-Phase-1 hat Chance es per-endpoint zu finden + LLM-Phase-2 hat Chance es spec-level zu finden. Drei findings, ein Issue.

### Implikation für v1 Foundation-Block

**Neuer load-bearing Engineering-Task:** "Cross-Layer Findings-Deduplication" (~2-3 Tage Engineering, derzeit nicht in `prd-launch.md` §3 Foundation-Block gelistet).

Mechanik:
1. **Token-basierte Cluster-Equivalence:** Rollup-Clustering der Findings über alle Layer hinweg via Repetition-Cluster-Scorer-Mechanik (existing in eval/).
2. **narrationKeywords-aware-Match:** für High-Confidence-Cluster-Merges leveraged human-curated keywords aus Reference-Catalog (oder LLM-emitted narrationKeywords im LLM-output).
3. **Embedding-Similarity** für Hard-Vocabulary-Bridge-Cases (Day-2 von eval/, portable in Production).
4. **Patch-Reconciliation:** wenn 3 Layer den gleichen Findings-Cluster emittieren, welche `patchOps` werden für den User serviert? Heuristik: Domain-Knowledge > Walker > Spectral > LLM (umgekehrte Reihenfolge wenn Patches widersprechen).

### Reuse-Pattern: Spike → Foundation-Block

Genau wie Epic 04's `scripts/spike/run-prompt.ts` → `src/lib/analysis/runAnalysis.ts` Port-Pattern:
- Eval-Scorer-Mechanik in `scripts/spike/eval/scorers/{jaccard,repetition-cluster,embedding-similarity}.ts` ist bereits modular gebaut
- Foundation-Block portiert diese nach `src/lib/analysis/dedup/` und ruft sie als Pipeline-Step nach allen Layer-Outputs auf
- Code-Duplikation = null; Test-Suites mit-portiert via vitest
- Geschätzter Foundation-Block-Port-Aufwand: ~0.5 Tag pro Scorer = ~1.5 Tage total

### Konsequenzen für PRD-Revision-Liste

`LAUNCH-PROGRESS.md` "Pre-Foundation-Block follow-ups" → ein Eintrag dazufügen:

> Add **Cross-Layer Findings-Deduplication** as Foundation-Block engineering task (~2-3 Tage). Required because Stage-A pre-pass + LLM Phase-1+2 emit overlapping findings across layers; without dedup the user sees 5×-duplicates per spec issue. Mechanik bereits modular im Spike-Harness gebaut (Phase-0 + Phase-A); port nach `src/lib/analysis/dedup/`.

### Nicht-Konsequenz: Phase-A-Refactoring

Der Embedding-Agent (Task #25) und A+B-Implementation (Task #24) bauen den Code in `scripts/spike/eval/scorers/`. Das ist **richtig so** — Spike-Harness-Convention. Foundation-Block-Port verschiebt die Files; aktuelle Lokation ist nicht zu ändern.

---

## Update 2026-05-05 (Diskussions-Iteration 6): Architektur-Korrektur — Putz-First, A2/A3 falsch

User-Insight 2026-05-05 (end of Phase A): zwei load-bearing Korrekturen die alle Phase-A-Empirik neu rahmen.

### 17. A2 (Stripe-Domain-Knowledge) ist Architektur-Verirrung — A3 NICHT bauen

User-Push-Back: "das soll doch genau die aufgabe des llms sein und nicht deterministisch oder?"

**Stimmt.** Apiq's Differentiator-Claim ist "AI knows what your spec should say". Das LLM hat Stripe-Docs, GitHub-Docs, PD-Docs in seinen Training-Daten. Wenn wir Stripe-spezifisches Wissen ("erwarte Idempotency-Key auf POST") in Detector-Code hardcoden, konkurrieren wir mit Spectral-Custom-Rulesets — exakt das Gegenteil von dem was apiq vom Linter-Pack abhebt.

**Stage-A war ursprünglich klar gedacht:**
- **Deterministischer Layer (A1):** strukturelle, repetitive Patterns ohne Domain-Wissen — Spectral-class.
- **LLM-Layer (Phase B mit v6-Prompt):** Domain-Wissen anwenden — apiq's eigentlicher Differentiator.

**Was schiefgegangen ist:** Stage-A2 hat vier Stripe-Domain-Patterns als Detector-Code hardcoded (F7, F9, F12, F28). Das ist die Verirrung — diese Patterns gehören dem LLM. Stage-A3 (analoge Detectors für PD/GitHub/dnd5eapi mit 13 weiteren Patterns) wäre noch mehr Verirrung.

**Konsequenz:**
- **A3 NICHT bauen** — kategorisch.
- **A2 reframen** als defensive fallback, nicht als primary Detector. Stripe-Domain-Layer feuert nur als Backup falls LLM unter v6 fehlschlägt.
- **Refs (`findings.json` Files) bleiben unangetastet** — sie sind der Goldstandard gegen den sowohl deterministische als auch LLM outputs gemessen werden. Domain-Knowledge-Class-Refs (17 total über 4 specs) bleiben drin.

### 18. Reputations-Limit: Putz-Schritt muss BEST-IN-CLASS sein bevor LLM-Differentiator zählt

User-Push-Back: "was nutzt uns 'advanced' llm insight, wenn wir vor der eigenen haustür nicht richtig putzen. angenommen ein user verlässt sich komplett auf uns zur evaluierung seiner openapi spec, aber wir finden den 'offensichtlichen müll' nicht, was hilft ihm dann llm 'hallucination'?"

**Reputations-Logik:** apiq verkauft sich als "ich prüfe deine Spec". User erwartet *zuerst* dass alles was ein normaler Linter findet, auch apiq findet. Plus dann den AI-Bonus. **LLM-Insights sind Add-On — der Putz ist Pflicht.**

**Wo wir tatsächlich stehen:**
- Spectral-Standard-Niveau: ✓ (wir nutzen Spectral-Engine)
- "Best-in-class-Linter"-Niveau (Vacuum-Tools + Community-Rulesets + tuned Custom-Rules): **✗ wahrscheinlich nicht**
- LLM-Differentiator-Niveau: **✗ nicht getestet**

**Was wir nicht gemacht haben (aber müssen):** den Spec einfach durch **Vacuum** (Spectral-kompatibler kommerzieller Linter), durch **Redocly CLI**, durch ein paar bekannte Community-Spectral-Rulesets jagen. Schauen was die finden. Dann: findet apiq mindestens das? Wenn nein → wir haben echte Lücken im Putz-Schritt die wir schließen müssen, **bevor** wir den LLM-Differentiator polieren.

Self-measurement gegen unsere eigene Reference-Liste hat den Bias zu sehr in die andere Richtung — sind wir ehrlich dass wir Sachen verfehlen die andere mature Tools zuverlässig finden?

### 19. Korrekte Reihenfolge — Re-Plan post-iteration-6

**Falsch gemacht heute:**
1. Phase 0 Eval-Framework (richtig — Werkzeug zur Messung)
2. Stage-A1 Spectral + Walker + Custom-Ruleset (richtig — Putz-Schritt aufgesetzt)
3. **Stage-A2 Stripe-Domain-Detectors (falsch — gehört LLM)**
4. **Sprung zu LLM-Test übersprungen, stattdessen Vocabulary-Mismatch-Mitigation auf eigene Refs (zu narzisstisch)**

**Richtige Reihenfolge ab jetzt:**

1. **Stage-A polieren auf "Best-in-class-Linter"-Niveau** (~2-4 Tage)
   - Externe Reality-Check: Vacuum + Redocly CLI + Community-Spectral-Rulesets gegen unsere 4 Specs
   - Lücke schließen: Custom-Rules schreiben für alles was externe Tools finden aber wir verfehlen
   - Tier-0a (Fatal-Validity: spec-parse, dangling-$ref, missing-required-fields) absolut bombenfest
   - Tier-0b (Non-Fatal-Validity: operationId-uniqueness, type-format-mismatch) absolut bombenfest
   - Custom-Spectral-Ruleset von 27 → 50-100 Rules
   - Community-Publishability als Open-Source-Ruleset (Differentiator-extender, Marketing-Win)
   - Refs-Klassifikation ehrlich überarbeiten (Phase-0 war zu optimistisch)

2. **A2 reframen als defensive-fallback, nicht primary** (~30 min Doc-Änderung)
   - Stripe-Domain-Layer bleibt im Repo, aber als Backup gekennzeichnet
   - Tasks #22-Code bleibt, Architektur-Rolle ändert sich

3. **A3 explizit als "do not build"** (~10 min in PRD/Memory)
   - LLM mit v6-Prompt soll diese Patterns finden
   - Wenn LLM-v6-Test fehlschlägt → strategische Entscheidung (Differentiator revidieren oder Krücke akzeptieren)

4. **DANN erst Phase B: LLM mit v6-Prompt** (~$5, 30 min Wall-Clock pro Run)
   - v6 mit explizitem "apply your training knowledge of Stripe/GitHub/PagerDuty/etc API conventions"
   - Misst ob Differentiator-Claim hält
   - **Das ist der eigentliche Spike-Lock-Test** — alle anderen Sachen davor sind Vorbereitung

5. **Phase C: Spike-Lock**
   - Dokumentation der finalen Empirik
   - Foundation-Block-Plan basierend auf Real-Empirik (nicht Predictions)

### 20. Was bleibt vom heutigen Tag

**Wertvoll und behalten:**
- Phase 0 Eval-Framework (kompletter Stack: Runner, Scorer-Suite, Snapshot-System, Comparison-Reporter, Bulk-Sweep)
- 4 Reference-Targets (`openapi-examples/<spec>/reference/findings.json`) — Klassifikations-Tags müssen ehrlicher werden, aber Body-Content bleibt
- Spectral-Runner (A1) — Engine korrekt integriert, OAS3-default + Custom-Ruleset funktioniert
- 12 Walkers (A1) — statistische Aggregations, korrekt
- 27 Custom-Spectral-Rules (A1) — Basis, muss erweitert werden
- Embedding-Similarity-Scorer (mit OpenAI text-embedding-3-small, OPENAI_API_KEY in scripts/spike/.env)
- Stripe-Domain-Layer (A2) als defensive-fallback
- Vitest-Tests für die kritischen Scorer

**Nicht wertvoll (Korrekturen):**
- Predicted-vs-measured-Vergleich aus Phase-0 — Predictions waren zu optimistisch (95% pure-spectral / 75% domain-knowledge). Bei ehrlicher Refs-Klassifikation realistische Predicted-Werte: 50-65%.
- Stage-A-Validation-Rate von 30-50% — gemessen gegen too-narzisstische eigene Refs. Echter Reality-Check (gegen externe Linter) noch ausstehend.

**Architektur-Lehren:**
- Putz-Schritt-First ist load-bearing für Reputation
- Differentiator (LLM-Domain-Knowledge) ist Add-On, nicht Substitute
- Don't hardcode what the LLM should know
- Self-measurement biased — externe Reality-Checks sind Pflicht

