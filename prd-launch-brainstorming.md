# Launch PRD — Brainstorming

> File-based discussion for the upcoming `prd-launch.md`. The original `prd.md` stays as the v0.1 vision document; this file is the strategic re-visit done after Epic 08 closes the v0.1 implementation sequence.
> Workflow: user writes questions / concerns, Claude answers inline. When answers stabilise, distil into `prd-launch.md`.

## Context (2026-05-03)

- v0.1 implementation closed (Epics 00–08). 298 tests green, lint + build clean. End-to-end-verified against real Supabase + real OpenRouter.
- User explored a public-launch path in `specs/08-export-polish-results.md` Rounds 1–5. Strategic discussion lives there for archival.
- **Decision (2026-05-03):** stop tactical implementation. Write a Launch PRD before the next code change. Big-spec spike + naming + UI re-think come first; implementation epics are derived from the new PRD.

---

## User's concerns (raw dump, to be expanded)

1. **New Launch PRD instead of next-tactical-epic.** Without re-planning at PRD level, no further coding makes sense.
2. **Big-spec spike before any architecture decision.** Two-call vs. bigger-context vs. chunking is open — must be calibrated empirically before committing.
3. **Name "apiq" is genuinely taken / verwechselbar.** Need a fresh naming exercise. apiq.ai exists; APIQ Corp exists in finance.
4. **UI doesn't satisfy.** Example named: sidebar menu = two narrow stacked cards (Specs / Settings) — feels unfinished. Likely more issues across screens.
5. **Launch-strategy still open** — public vs friends, monetisation, what genuinely tempts users (Round 3–5 discussion in Epic 08 results).

(More points coming from user — TBD.)

---

## Sanity-check — what current apiq needs that it doesn't have

Claude's quick pass over the codebase + workflow against best-practices. Not exhaustive. Grouped by severity. Each item: what's missing, why it matters, rough effort.

### Critical (Launch-blocker — fix before any public access)

1. **No CI/CD.** Tests + lint + build only run manually on the dev machine. A regression can land on main and ship to prod undetected. → GitHub Actions: run `npm test && npm run lint && npm run build` on every push and PR. ~2 hours.

2. **No error monitoring.** Server errors print to stdout; client errors disappear silently. Production deploy without Sentry-class tracking = you find out from frustrated users. → Sentry / Highlight / similar. ~2 hours.

3. **No email infrastructure.** No signup verification → anyone can sign up with `someone-else@gmail.com`. No forgot-password → users locked out forever. → Resend (or Postmark / SendGrid) + Auth.js Email provider. ~1-2 days.

4. **Privacy policy + ToS pages absent.** Legal blocker for accounts in EU + most jurisdictions. → Two static pages, ~half a day with templated content.

5. **No login rate-limit.** Signup has IP rate-limit + Turnstile; login has neither. Brute-force unmitigated. → Same `IpActionLog` infra + per-email lockout after N failed attempts. ~half a day.

6. **`INTERNAL_API_SECRET` route bypasses Auth.js.** If secret leaks (accidental log, env var dump), anyone can trigger analysis on arbitrary specs without an account. The current secret has been a dev placeholder all along. → Either rotate aggressively + add rate-limit, or remove the route entirely now that the trigger is in-process (Epic 04 ship). ~1 hour.

### High (UX / cost-impact within 4 weeks of launch)

7. **No analytics / telemetry beyond `LLMCall`.** You don't know signup-rate, conversion, drop-off, retention. Flying blind on every product decision. → PostHog / Plausible / Umami. Self-hostable; ~half a day.

8. **No prompt caching on Sonnet calls.** Anthropic supports prompt caching that cuts both cost and latency by ~50% on repeated system prompts. Today: every analysis re-pays the 6193-char system prompt cost. → OpenRouter passes through cache_control headers; needs a small change in `callLLM`. ~half a day. Cost saving compounds with usage.

9. **No analysis result caching.** Same spec content (by hash) → re-analyzes from scratch. → SHA-256 of `currentJson` → cache key → 1-day TTL. Skips repeat Sonnet calls. ~half a day.

10. **No streaming LLM output.** User stares at a 60-second spinner, then everything appears at once. Streaming would let findings render as they arrive. → `openai` SDK supports streaming; needs frontend re-architecture (server action → API route + SSE). ~2 days. Big perceived-speed win.

11. **No fallback model.** OpenRouter / Anthropic outage = analysis pipeline dies. → Try Sonnet, fall back to GPT-4o-mini or similar on 503. ~half a day.

12. **No prompt-injection guardrails on user input.** Specs contain free-text descriptions / examples that get forwarded verbatim to the LLM. An adversarial spec can hijack the system prompt. → Sanitise / wrap user-content sections in clear delimiters; document the threat model. ~half a day.

### Medium (UX polish, security hardening — should do, not blocker)

13. **Bcrypt cost factor unspecified.** Auth.js + bcrypt default = 10. For 2026, 12+ recommended. → One-line change in signup flow + plan migration for existing hashes. ~1 hour.

14. **No CSP headers.** Standard XSS hardening missing. → `next.config.js` headers config. ~1 hour.

15. **Server-action error messages leak internals.** `error.message` from Prisma / fetch can include schema names, internal URLs. → Whitelist known kinds; everything else → generic "unexpected" to client, full message → Sentry. ~half a day.

16. **`LLMCall` table grows unbounded.** No archival policy. After 12 months at 1000 analyses/day, ~365k rows. → Monthly partition or 6-month retention policy. Defer until rows > ~100k.

17. **No keyboard shortcuts.** Engineer tools win on `cmd+k` palette / `g-s` (go to specs) / `j-k` navigation. → cmdk library + a small palette. ~1-2 days. Worth it for the audience.

18. **No global search.** Once a workspace has 30+ specs, finding one becomes annoying. → Search input in the workspace header, fuzzy-match `Spec.name`. ~half a day.

19. **Specs list table is mobile-unusable.** Even with the (B) overflow band-aid, scrolling a 7-column table on a phone is dismal. → Switch to card-layout below `md:` breakpoint (each spec = card with name + score + status, no columns). ~1 day.

20. **No undo for delete.** Click → confirm → gone. → Soft-delete with 7-day retention + "Trash" view in Settings. ~1-2 days.

21. **Polling-based UI updates.** Spec Detail polls every 3 s, Specs List every 5 s. Wasteful when idle, slow when busy. → Server-Sent Events on a single `/api/events` endpoint that pushes status flips. ~1-2 days infra; cleaner UX.

### Low (nice to have)

22. **No social proof on landing.** Cold visitors have nothing to anchor on. → "Built by ${you}, used by N teams" — even N=0 with "in private beta" works honestly.

23. **Sample-spec catalog is just OpenWeatherMap.** Petstore + Stripe + dnd5eapi exist in `openapi-examples/` but aren't wired. → Extend `SAMPLE_ALLOW_LIST` + multi-button empty state. ~30 min (already discussed in Round 3).

24. **No exported `/api/specs/[id]/export.json` GET route.** Engineers love `curl`. Today only the server action works. ~half a day. v0.2 territory.

25. **Diff-viewer bundle weight.** `react-diff-viewer-continued` is ~50 KB gzipped, renders synchronously. → Lazy-import it (only loaded when "Show diff" is clicked). ~1 hour. Free perf win.

### Branding / product

26. **Name "apiq" — confirmed taken.** `apiq.ai` (API-knowledge platform), APIQ Corp (public, finance), `apiq.com` redirects. Naming exercise required. Constraints: short, available domain, ideally 4-7 letters, evokes "deep API understanding" without saying "API" twice. → Brainstorm separately; that's its own session.

27. **No real logo.** `prd-decisions.md` open-followups says lucide `Webhook` placeholder. → Logo workshop. Defer to after rename (logo follows name).

28. **No tagline beyond "Understand your APIs like the LLM does."** Working but generic. → Tagline workshop after rename.

29. **No public docs / FAQ / "how it works" page.** Cold visitor has nothing to read before signup. → Docusaurus / Mintlify or just an `/about` route + 5-10 FAQ entries. ~1-2 days.

30. **Pricing page absent.** Even "free during beta" needs a stated stance. → Static `/pricing` page with the current $10/24h-per-workspace cap stated honestly. ~2 hours.

### LLM-pipeline-specific

31. **Prompt + model + version are hardcoded.** Iterating on prompts requires code deploy. → Prompt-versioning table or just env-var-driven prompt selection + an experiment-tracking row in `LLMCall`. ~1 day. Enables safe iteration.

32. **No prompt A/B testing infra.** Tied to (31). When you want to try a v5 prompt, you can't safely route 10% of traffic to it. → Workspace-level (or random-bucket) prompt assignment. ~1 day on top of (31).

33. **No data-export / account-deletion (GDPR).** "Delete my account" + "Export my data as ZIP" buttons. Required for EU users; nice for everyone. → ~1 day combined.

34. **Workspace-level usage meter absent in UI.** When a user hits the $10/24h cap, they see the toast — but have no in-UI affordance to see "$X of $10 used today" beforehand. → Settings page widget. ~half a day.

---

## Effort summary

If you wanted the *minimum-viable Public-Launch-ready* baseline (Critical-only): **items 1-6 = ~3-4 days.**

If you wanted Critical + High (real-product-quality launch): **items 1-12 = ~8-12 days.**

Plus the strategic items (rename, UI redesign, big-spec spike) which aren't on this list — those are PRD-level, not best-practice-checklist.

---

## Open questions for the user

- Does this list cover what you noticed, or are there specific other things bugging you? (Especially UI — you flagged the menu but I suspect there's more.)
- For the rename: any constraints / direction in mind, or full open canvas?
- For the UI: do you want to do a wholesale redesign, or surgical fixes per screen?
- Is there an inspiration / reference product whose UX you want apiq to feel like?
- What's the target launch audience again — refined since Round 4? (Backend engineers building public APIs at startups? API-design students? API-platform teams at mid-market companies?) Different audience = different best-practice-priorities.

---

## Strategic gut-check (2026-05-03) — value prop, user, mechanism, differentiation

User: *"was für eine value proposition liefert apiq gerade? und für welchen user? und wie macht apiq das momentan? und wie unterscheidet sich apiq dadurch von bestehenden lösungen? weil wenn das alles nicht klar und optimal umgesetzt bzw beantwortet ist, dann lohnt sich vielleicht weitermachen gar nicht."*

Kritische Antwort, ohne Schönfärberei. Das hier ist die Kill-or-Commit-Frage vor dem Launch-Investment.

### 1. Welche Value Proposition liefert apiq aktuell?

**In einem Satz:** *"Eine LLM-narrationierte Review deines OpenAPI-Specs mit ein-Klick-anwendbaren Patches und Quality-Score, ohne dass du den Spec Zeile für Zeile durchgehen musst."*

Konkret was der User in v0.1 bekommt:
- Spec hochladen (URL) → in <5 s validiert + dereferenziert
- Single-Call zu Claude Sonnet → 5-20 Findings in ~60 s
- Jeder Finding: engineering-grade Narration (~3-5 Sätze, geerdet in REST/OWASP/RFC 7807/Pagination-Patterns), Rationale, JSON Patch Ops, Diff Preview
- Apply / Reject / Undo mit linearer Versionshistorie
- Quality Score 0-100, deterministisch berechnet aus Severity-Gewichten (15/7/3/1)
- Export als JSON/YAML

Wo liefert das echten Wert? **Wenn der User dabei lernt** — das Narration-Format ("warum matters this") ist eine Teaching-Moment-Maschine, kein bloßer Lint-Output. Das ist der eigentliche Hook bei dem aktuellen Design.

### 2. Für welchen User?

PRD sagt: "technical individual contributor on the API side — backend engineer, API platform engineer, integration architect, OpenAPI maintainer at a startup or scale-up."

**Spezifischer als der PRD-Text:** der User, für den apiq heute am meisten Sinn macht, ist der **Solo / Lead Engineer an einem Startup oder Scale-up, der einen public-facing OpenAPI-Spec besitzt und niemanden mit mehr API-Design-Erfahrung im Team hat, der ihn reviewen kann.** Das ist die "knowledgeable second opinion"-Situation.

Sekundäre Audiences:
- **API-Design-Studenten / Bootcamp-Lehrer** — das Narration-Format ist Lernhilfe
- **Backend-Hobbyisten** — eigene Side-Project-APIs aufpolieren
- **Internal-Spec-Maintainer in mittelgroßen Firmen** — Spec-Konsistenz prüfen vor Major-Release

Wer ist *nicht* die Zielgruppe (heute):
- Enterprise mit Senior-API-Teams (haben eigene Architektur-Reviews)
- Security-fokussierte Use Cases (apiq macht pattern-level, kein BOLA-Exploit-Scanning)
- Spec-Authoring (wir mutieren nur, keine Greenfield-Erstellung)

### 3. Wie macht apiq das aktuell?

Mechanismus:
- **Single-Call-Pipeline:** ein Sonnet-Call mit hand-tuned 6193-Zeichen-System-Prompt (Epic 00 Spike v4), zod-validierter Output-Schema, retry-once bei Schema-Failure, $10/24h-Workspace-Budget-Cap
- **Patch-Validierung:** server-side `validatePatchOps` (RFC 6902-Konformität, hallucination-Check) gates jeden Apply
- **Versionierung:** linearer SpecVersion-Graph; jedes Apply / Undo Apply erzeugt eine neue Version
- **Quality-Score:** deterministische Formel `100 - (15·critical + 7·high + 3·medium + 1·low)` über offene Findings
- **UI:** Desktop-only Next.js-Dashboard (Specs List + Spec Detail + Settings)

Was *gut funktioniert* heute:
- Narration-Qualität auf 1-50-Endpoint-Specs ist genuinely besser als Spectral / 42Crunch
- Apply-Patch-Flow funktioniert (Browser-verifiziert auf Petstore: 14/14 Findings hatten Patch-Ops, die clean appliziert haben)
- Quality-Score-Mechanik gibt klare Priorisierung
- 60-Sekunden-Analyse-Zeit ist akzeptabel für einen Single-Spec-Review

Was *nicht gut funktioniert* heute:
- >200-Endpoint-Specs werden hart abgelehnt (deshalb der Big-Spec-Spike-Bedarf)
- Keine Persistenz von "user lernt was über Zeit" (kein Lerntagebuch, kein Trend)
- Single-User-Workflow (kein Team-Kollab)
- One-Shot — User kommt nicht zurück nach Apply-und-Export

### 4. Wie unterscheidet sich apiq von bestehenden Lösungen?

Die Wettbewerbslandschaft heute (Nov 2025 / Mai 2026 Stand):

| Tool | Was es macht | Wo's gut ist | Wo's apiq schlägt |
|---|---|---|---|
| **Spectral** (Stoplight, OSS) | Rule-based linter | Free, integriert überall (CLI, GitHub Action, IDE), Spec-Fehler in Sekunden | apiq narriert 10× tiefer, fixt patches, hat Quality-Score |
| **Vacuum** (Rust, OSS) | Wie Spectral, schneller | Performance | Gleiche Story wie Spectral |
| **42Crunch** | Security-Audit + API-Conformance | Enterprise-grade Security-Tiefe, SOC2-friendly | apiq ist pattern-level (apiq ist *nicht* security-deep — explicit out of scope per PRD) |
| **Stoplight Studio** | GUI-Editor + Linter | Visuelles Authoring | apiq ist read-then-mutate, nicht Greenfield-Editor |
| **Postman** | Workspace + Lint + Test + Monitor | Massive Footprint, lifecycle-coverage | apiq ist design-only, deeper LLM-narration |
| **Optic** | API-Drift-Detection across deploys | Spezifisch CI-pipeline-integriert | apiq macht das nicht (v0.4 Roadmap) |
| **Bump.sh** | Spec-Hosting + Diff + Changelog | Diff-Visualisierung | apiq narriert, Bump zeigt nur Diff |

**Was apiq UNIKAT macht (heute, Mai 2026):**

1. **Engineering-grade LLM-Narration als *primäres* Output-Format.** Spectral sagt `error: no-pagination`. apiq sagt: *"Reporting consumers paging through this list will see duplicate or missed records when orders are created mid-iteration, because there's no stable cursor. Cursor-based pagination on `created_at` plus a strict tie-breaker on `id` would fix this."* — das ist genuine Differentiation.

2. **One-Click-Patches, die wirklich applizieren.** Andere Tools schlagen vor; apiq mutiert. RFC 6902 JSON Patch ops, validator-gated, mit Versions-History und Undo. Das ist nicht symbolisch — das ist Code, der wirklich rennt.

3. **LLM-grounded Quality Score.** Nicht "Anzahl Rule-Violations" wie bei Spectral, sondern "wie viele und wie schwere LLM-bewertete Issues hat dein Spec".

**Was apiq *nicht* unique macht:**

- Validation, Dereferenzierung, Endpoint-Listing — das machen alle Tools.
- Spec-Hosting — Bump.sh / Stoplight machen es professioneller.
- CI-Integration — Spectral hat 50× mehr Distribution.
- Security-Audit-Tiefe — 42Crunch ist 10× spezifischer.

### Kritische Bewertung: ist die Differentiation tragfähig?

**Stärken der aktuellen Position:**
- LLM-Narration ist 2025-2026 erst möglich geworden. Dieser Vorteil ist real.
- One-Click-Patch ist genuine Engineering-Arbeit, nicht UI-Trick.
- Engineering-Tone der Narration trifft genau den Audience-Geschmack (kein Marketing-Sprech).

**Schwächen / Existenzbedrohungen:**

1. **Schmale Differentiation.** Der Moat ist im Wesentlichen "wir haben das Narration-Format gut hinbekommen". Das ist 1-2 Wochen Engineering-Arbeit für ein motiviertes Konkurrenzteam zu replizieren. Kein nachhaltiger Moat.

2. **Big-AI-Threat.** Anthropic / OpenAI / Google können *morgen* "review my OpenAPI spec" als Feature in ihren Chat-Produkten launchen. ChatGPT mit GPTs, Claude mit Projects, Gemini mit Gems — alle drei können das. Wenn sie es tun, hat apiq ein Distributions-Problem (sie haben 100M+ User, du hast 0).

3. **One-Shot-Use-Case.** Heute kommt ein User, analysiert seinen Spec, applied Findings, exportiert. Was bringt ihn nächste Woche zurück? Nichts. Das ist gefährlich für Retention. v0.4 Drift-Detection wäre der erste echte Recurring-Hook.

4. **TAM ist eng.** Backend-Engineers, die proaktiv die Qualität ihres OpenAPI-Specs verbessern wollen, sind eine echte aber kleine Zielgruppe. Schätzung: 10-50K global, davon vielleicht 1-5% reachable über typische Channels (HN, Reddit, DevTwitter).

5. **Pricing-Model unklar.** Heute zahlst du LLM-Calls. Bei 100 aktiven Usern × $10/Tag-Cap = bis zu $30k/Monat OpenRouter-Cost. Das ist nicht trivial, und Stripe-metered ist 2 Wochen Engineering, das wir noch nicht gemacht haben.

### Lohnt sich Weitermachen?

Ehrliche Bewertung in vier Szenarien:

**(α) Als kommerzielles SaaS-Geschäft.** Antwort: **wahrscheinlich nicht**, ohne starkes Reframing. Der TAM ist zu schmal, der Moat zu dünn gegen Big-AI-Labs, das Recurring-Use-Case-Problem ungelöst. Du würdest ~6-12 Monate investieren, um vielleicht 50-200 zahlende User zu erreichen, die dir $5-50/Monat zahlen → $300-10k MRR. Das ist nicht Salary-Replacement.

**(β) Als Open-Source-Tool für Engineer-Community.** Antwort: **lohnt sich**, anders ausgelegt. apiq als OSS-CLI / GitHub-Action mit "bring your own OpenRouter key", kostenfrei, hervorragende Narration → kommt potentiell in jedes API-Repo wie Spectral heute. Distribution über GitHub-Action-Marketplace + npm. Kein Revenue, aber Brand + Portfolio + community.

**(γ) Als Lerne-und-zeige-Projekt.** Antwort: **lohnt sich**, niedrigste Schwelle. Du hast in 8 Epics ein voll-funktionsfähiges, getestetes Next-Gen LLM-augmented Engineering-Tool gebaut. Public-Launch als Demo (HN-Show, Tweet-Thread, Blog-Post) bringt dir Reputation, auch wenn niemand long-term User wird. Sehr realistisches Outcome bei 2-3 Wochen Arbeit Investment.

**(δ) Mit signifikantem Re-Pivot.** Antwort: **wenn du committen willst**, das Re-Pivot ist nötig. Optionen:

- **Pivot zu Drift-Detection / Governance** (v0.4 vorziehen): "apiq überwacht deine API kontinuierlich, alarmiert bei Breaking Changes." Real Recurring-Use-Case, schwerer durch Big-AI-Lab-Feature ersetzbar.
- **Pivot zu Cross-Spec / Landscape** (v0.2 vorziehen + tiefer): "apiq versteht dein API-Portfolio, findet Inconsistencies und Gaps zwischen 5+ Specs." Stickiness-Hook + LLM-defensible.
- **Pivot zu Generation** (v0.3 vorziehen): "Beschreibe was du brauchst, apiq generiert OpenAPI + erste Implementation-Stubs." Heißt aber, mit Cursor / GitHub Copilot zu konkurrieren — nicht trivial.

### Empfehlung — meine ehrliche Meinung

**Wenn du das Geld / die Zeit für ein echtes SaaS hast:** Pivot zu Drift-Detection (δ). Apiq als "Spec-Drift-Monitoring-Service" ist ein anderes, aber klareres Geschäftsmodell. Recurring-Use-Case, klares Pricing, echter Moat (historische Daten + Pattern-Detection).

**Wenn du Brand + Portfolio + Community willst:** Open-Source-Pivot (β). Pack apiq als CLI + GitHub-Action + Web-Dashboard, OpenRouter-BYOK, OSS auf GitHub. Hat realistische Adoptions-Chance, bringt Reputation.

**Wenn du einfach mal etwas Cooles veröffentlichen willst:** Show-Project (γ). 2-3 Wochen Polish + Launch-Prep, Hacker News + Tweet-Thread, akzeptier dass es ein One-Shot wird.

**Wenn du SaaS gewinnen willst ohne Pivot:** ehrlich gesagt **lohnt sich's wahrscheinlich nicht.** Die Differentiation ist zu schmal, der TAM zu eng, der Wettbewerb zu schnell mit AI-Generationen.

### Frage zurück an dich

- Welches Szenario (α/β/γ/δ) ist dein eigentliches Ziel? Das hatten wir bisher nicht klar — Round 1-5 hat implizit zwischen γ und α-Light geschwankt.
- Wenn δ: welcher der drei Pivots fühlt sich am richtigsten an?
- Wenn γ: dann ist die "Launch PRD" schmaler als bisher gedacht — wir polishen + launchen + dokumentieren + lernen, ohne große Re-Architektur.
- Wenn β: dann verschiebt sich alles. CLI + GitHub-Action wird Tag 1; Web-Dashboard wird sekundär; Build-System + npm-Publishing rücken ins Zentrum.

Sag mir welches Szenario du eigentlich willst — die ganze Launch-PRD hängt davon ab.

(More questions to be added once user adds more concerns.)

---

## Workflow-Frage: was macht der User mit dem geänderten Spec? (2026-05-03)

User: *"also der user gibt seine openapi spec ein? via url? dann reviewev apiq diese und liefert ergebnisse? dann kann der user von apiq noch eine angepasste spec bekommen? aber was macht er dann damit? die spec beschreibt ja seine api oder? geht es hier nur um verbesserte api doku oder um verbesserte api? sollten wir villeicht sogar doch einen spec import button haben?"*

Das ist die zentrale produktstrategische Frage, die der ursprüngliche PRD nicht sauber beantwortet hat. Die Antwort entscheidet, *wer* überhaupt apiq sinnvoll nutzen kann.

### Die zwei API-Welten — und warum apiq heute beide implizit gleich behandelt

Es gibt zwei grundlegend verschiedene Workflows, wie ein OpenAPI-Spec im Engineering-Lifecycle existiert:

**(A) Spec-First / Design-First.**
- Der Spec **ist** die Source-of-Truth.
- Code wird aus dem Spec generiert: Server-Stubs, Client-SDKs, Mocks, Tests, API-Gateways.
- Tools im Stack: Stoplight Studio, Prism, OpenAPI Generator, Swagger Codegen, Connexion (Python), Microsoft TypeSpec.
- Beispiel-Workflow: Engineer ändert Spec → CI regeneriert Server-Stubs + Client-SDKs → deployed.
- Eine "verbesserte Spec" → eine **verbesserte API**, weil der Code nachzieht.
- Marktanteil global: ~20-30% der Engineering-Teams (typischerweise große Enterprises, API-Platform-Teams, B2B-Plattform-APIs).

**(B) Code-First.**
- Der **Code** ist die Source-of-Truth (Route-Handler, Decorators, Annotationen).
- Spec wird automatisch aus dem Code generiert: FastAPI's `/openapi.json`, Spring Doc, NestJS Swagger, ASP.NET Core OpenAPI.
- Wenn man den Spec ändert, ändert sich nichts — der Code regeneriert ihn beim nächsten Deploy.
- Eine "verbesserte Spec" ist dann eine **To-do-Liste manueller Code-Änderungen** für den User.
- Marktanteil global: ~70%+ der Engineering-Teams (typische Backend-Stacks: FastAPI, Spring Boot, NestJS, ASP.NET, Express + decorators).

### Was bedeutet das für apiq heute?

**Aktueller Zustand:** apiq mutiert den Spec via JSON Patch + bietet Export. Implizit nimmt apiq Workflow (A) Spec-First an. Aber die Mehrheit der Zielgruppe ist (B) Code-First.

Konkret: ein FastAPI-Engineer importiert seinen Spec in apiq → bekommt 14 Findings → applied 5 Patches → exportiert die geänderte Spec als JSON. Was er damit macht?

- *Nicht* deployen — beim nächsten Deploy regeneriert FastAPI den Spec aus den Code-Annotationen → apiq's Änderungen sind weg.
- *Nicht* committen — würde den nächsten Deploy nur frustrieren.
- *Vielleicht* als Diff anschauen + manuell die Code-Änderungen machen — also hat der User effektiv einen "Review-Report" bekommen, aber die Apply-Buttons waren irreführend (er kann nichts wirklich applizieren).

**Das ist der Kern des Problems.** Apiq vermarktet "one-click patches that mutate the spec" — aber für 70%+ der User mutiert das nichts Echtes. Die Apply-Mechanik ist Theater für sie.

### Was die User in beiden Welten *wirklich* brauchen

| Workflow | Was der User braucht | Was apiq heute liefert | Lücke |
|---|---|---|---|
| **(A) Spec-First** | Geänderter Spec, fertig zum Code-Regenerate-Pipeline | ✓ Genau das | Keine. Aktueller Apply-Flow ist korrekt. |
| **(B) Code-First** | Strukturierte Vorschläge, die er manuell in seinen Code einarbeitet | Geänderter Spec + Diff-Preview | Großer Gap. Die "Apply"-Buttons sind irreführend; der User braucht eher *Code-Patches für FastAPI / Spring / NestJS*, nicht JSON Patches für die Spec. |

### Drei mögliche Reaktionen auf diesen Gap

**(I) Apiq als Spec-First-Tool positionieren — kommunikativ ehrlich sein.**

- Alles bleibt wie es ist.
- Marketing + Onboarding + Empty-State sagen klar: "apiq is for spec-first / design-first API teams. If you generate your spec from code (FastAPI, Spring, NestJS), you'll still get useful narrated findings, but the patches are a *to-do list*, not a deploy artifact."
- Audience schrumpft auf die ~20-30% Spec-First-Teams.
- Aufwand: ~null Code, ein paar Texte ändern.
- Konsequenz: TAM ist deutlich kleiner. Aber das aktuelle Produkt ist für *diese* Audience genau richtig gebaut.

**(II) Apiq für Code-First erweitern — Output-Modus pro Stack.**

- User markiert seinen Stack (FastAPI / Spring / NestJS / ASP.NET / etc.) im Onboarding oder pro Spec.
- LLM-Pipeline produziert *zusätzlich* zur JSON-Patch-Spec-Mutation auch **Code-Patches** für den jeweiligen Stack.
- Z. B. statt `"add /paths/~1users/get/parameters" mit cursor-Schema` → `"in your FastAPI route, add: cursor: Optional[str] = Query(None, description='Pagination cursor')"`.
- Aufwand: signifikant. Das ist *eigene Spike-Arbeit* (kann der LLM zuverlässig Stack-spezifische Code-Patches generieren?), plus ~2-4 Wochen Engineering pro Stack.
- Risiko: Stack-spezifische Code-Patches sind mindestens 5× komplexer als JSON Patches; Hallucination-Risiko hoch; Validierung viel schwerer.
- Konsequenz: ein deutlich besseres Produkt für die größere Audience. Aber Plattform statt MVP.

**(III) Apiq als Read-Only-Audit-Tool reframen — keine Apply-Mechanik mehr.**

- Apiq liefert nur den Findings-Report mit Narration + Rationale.
- Apply / Reject / Versions / Export entfallen.
- Output: PDF-Report / Markdown-Report / GitHub-PR-Comment, je nach Distribution.
- Aufwand: viel Code wird obsolet (~30% von v0.1), aber kein neues Big-Spec-Spike, kein Patch-Validator-Maintenance.
- Konsequenz: schmaleres Produkt, aber funktioniert für *beide* Welten. Verliert den "one-click design partner"-Differentiator zugunsten von "best-narrated linter".

### Sollten wir einen Spec-Import-Button (File Upload / Paste) haben?

**Ja, wahrscheinlich.** URL-only ist heute eine echte Hürde:

- Viele Engineers haben Specs in ihrem Repo (`./openapi.json`), nie public deployed.
- Internal / private APIs haben oft keinen public-zugänglichen URL → User müsste den Spec erst irgendwo hochladen, bevor er apiq nutzt.
- Engineers mit lokal-CI-generierten Specs müssten den Spec zuerst exposen.
- Paste-as-Text wäre die niedrigste Friction überhaupt — Textarea mit "paste your OpenAPI spec here", auto-detect JSON/YAML, fertig.

**Aufwand:** Paste-Mode ~2-3 h, File-Upload-Mode ~half day. Beide sind technisch fast identisch zur aktuellen URL-Pull-Pipeline (parse → validate → dereference → persist).

**Empfehlung:** ja, beide einbauen. Paste-Mode primär, File-Upload als Convenience. URL bleibt für "Pull from public URL" mit Re-Pull-Capability.

Per `prd.md` v0.1 war URL-only eine bewusste Scope-Limitation, aber rückblickend wirkt das wie ein Premature-Constraint. Für jeden ernst gemeinten Launch sollte File/Paste rein.

### Zusammengefasst: was ist der eigentliche Wert?

Wenn du ehrlich beantwortest "wer ist apiq's Audience und was passiert mit dem Output?", dann:

- **Wenn Spec-First-Teams (Pfad I):** apiq ist ein "design partner" — Apply-Mechanik macht Sinn — aber die Audience ist 20-30% des Marktes, also schon eng.
- **Wenn Code-First-Teams (Pfad II):** apiq müsste deutlich erweitert werden, um echten Wert zu liefern (Code-Patches statt nur JSON-Patches).
- **Wenn beide (Pfad III):** apiq ist ein "audit tool" — Apply entfällt — und konkurriert dann *direkter* mit Spectral et al.

Das ist der Trade-off. Bisher hat apiq implizit Pfad I + ein bisschen Pfad III gemacht — ohne klar zu kommunizieren *welcher* der beiden es ist. Das verwirrt User in der Audience.

### Konkrete Frage zurück

1. Welche Audience hast du im Kopf — Spec-First (Minderheit, aber für sie ist das aktuelle Produkt richtig) oder Code-First (Mehrheit, aber braucht ein anderes Produkt)?
2. Wenn Spec-First: bleiben wir bei Apply-Mechanik, fokussieren das Marketing engerer.
3. Wenn Code-First: wir brauchen eine Spike-Phase ("kann der LLM zuverlässig Stack-spezifische Code-Patches generieren?") *vor* dem Big-Spec-Spike. Höchstwahrscheinlich Pivot zu (III) Audit-Tool statt (II) Code-Patcher.
4. Spec-Import-Button: paste + file-upload als Default? URL bleibt nur als optionale "pull from public URL" für Public-API-Owner?

Diese Antworten beeinflussen *jede* andere Entscheidung in der Launch-PRD — Audience-Sprache, Naming, UI-Redesign, sogar das Pricing-Modell. Lass uns die nicht überspringen.

---

## Spec-First-Niche-Validation — produzieren wir wirklich deploybaren Output? (2026-05-03)

**User-Entscheidung:** "Spec-First-Audience reicht für den ersten Launch. Aber funktioniert das wirklich?"

Tight, konkret, technisch ehrlich.

### Frage 1: Produzieren wir wirklich valide OpenAPI 3.x Specs?

**Größtenteils ja, mit zwei dokumentierten Edge-Cases.**

Was funktioniert:
- Beim Import: `@apidevtools/swagger-parser` validiert OpenAPI 3.x strikt → invalide Specs werden abgelehnt vor der LLM-Analyse
- Beim Apply: `validatePatchOps` (Epic 06) gated jeden Patch — nur RFC-6902-konforme Operations dürfen durch; Patches die "von der Luft greifen" (z. B. Pfade die nicht existieren) markieren das Finding als `stale` statt zu applizieren
- Beim Apply selbst: `fast-json-patch.applyPatch(..., validate: true)` validiert die JSON-Patch-Syntax noch einmal beim Anwenden
- LLM-Output: das Sonnet-Modell wurde in Epic 00 gegen 4 reale Specs (OpenWeatherMap, Stripe, PagerDuty, dnd5eapi) kalibriert; Epic 04 verifizierte 14/14 Findings auf Petstore mit clean-applyibaren Patches

Was *nicht* validiert wird:
1. **Kein OpenAPI-3.x-Re-Validation nach Apply.** Wir applizieren JSON-Patches und vertrauen darauf, dass die LLM-Patches semantisch valide OpenAPI sind — wir laufen nicht erneut `swagger-parser` über das Ergebnis. Theoretisch könnte ein Patch RFC-6902 valide sein aber OpenAPI-invalid (z. B. Hinzufügen eines `parameters`-Eintrags ohne `name`-Feld). **Das ist ein Bug für Spec-First-Users**, weil ihr CI dann beim Codegen-Step fehlschlägt.

2. **Cycle Markers im Export.** Per Epic 03's `cycleStripSpec` werden rekursive `$ref`s mit `{"$ref": "#cyclic"}`-Markern ersetzt. Das ist *nicht* gültiges OpenAPI — diese Marker brechen in Tools wie Swagger Editor / OpenAPI Generator als ungültige Pfade. Für Specs ohne rekursive Schemas (OpenWeatherMap, Petstore, Stripe, viele andere) ist der Export sauber. Für Specs mit rekursiven Schemas (Tree-Strukturen, self-referential Models) ist der Export kaputt.

3. **Dereferenzierter Export ohne Re-Bundling.** Heute wird der Export als komplett-dereferenzierter Spec ausgegeben — alle `$ref`s sind inlined. Das ist gültiges OpenAPI, aber idiomatisch unschön: original-modulare Specs mit `components/schemas/User`-References werden zu inlined Schemas everywhere. Größer, schwerer zu mergen, weniger lesbar. Spec-First-Teams pflegen ihre Specs in der Regel modular.

**Honest verdict:** für ~80% der real-world Specs (keine rekursiven Schemas, einfache LLM-Patches) produziert apiq deploybaren Output. Für die anderen 20% gibt's offene Edge Cases.

### Frage 2: Wie verwandelt man eine OpenAPI-Spec wirklich in eine API?

Das Spec-First-Toolchain ist real und ausgereift. Konkrete Workflows:

#### (a) Server-Stub-Generierung mit OpenAPI Generator

[OpenAPI Generator](https://openapi-generator.tech/) — OSS, 50+ Sprach-Support, der De-facto-Standard:

```bash
# TypeScript / NestJS-Server-Stubs
openapi-generator-cli generate \
  -i ./apiq-improved.yaml \
  -g typescript-nestjs \
  -o ./generated/server

# Python / FastAPI-Server-Stubs
openapi-generator-cli generate \
  -i ./apiq-improved.yaml \
  -g python-fastapi \
  -o ./generated/server

# Go / Echo-Server-Stubs
openapi-generator-cli generate \
  -i ./apiq-improved.yaml \
  -g go-echo-server \
  -o ./generated/server
```

Output: Route-Handler-Skelette mit korrekten Type-Signaturen, automatische Request/Response-Validierung, OpenAPI-Doc-Endpoint. Engineer füllt nur die Business-Logic-Bodies aus. Re-Generation behält Custom-Code via `.openapi-generator-ignore`-Pattern.

#### (b) Client-SDK-Generierung

```bash
# TypeScript-Client mit Fetch
openapi-generator-cli generate \
  -i ./apiq-improved.yaml \
  -g typescript-fetch \
  -o ./generated/client

# Lightweight: nur TypeScript-Types
npx openapi-typescript ./apiq-improved.yaml -o ./types.ts
```

#### (c) API-Gateway-Konfiguration

AWS API Gateway, Kong, Tyk, Apigee — alle importieren OpenAPI 3.x direkt:

```bash
aws apigateway import-rest-api --body fileb://apiq-improved.yaml
```

#### (d) Mock-Server / Contract-Tests

```bash
# Prism — Mock-Server, der die Spec live serviert
prism mock ./apiq-improved.yaml

# Schemathesis — Contract-Test gegen laufenden Server
schemathesis run ./apiq-improved.yaml --base-url http://localhost:3000
```

#### (e) Höhere Abstraktion: TypeSpec (Microsoft)

Microsoft TypeSpec ist eine DSL, die zu OpenAPI kompiliert. Spec-First-Teams die TypeSpec verwenden, können apiq-improved Specs als *Diff-Reference* nutzen, müssten die Verbesserungen aber in TypeSpec rückportieren.

### Frage 3: Welche bestehenden Tools tun Ähnliches wie apiq?

Wettbewerber-Sicht aus Spec-First-Brille:

| Tool | Lizenz | Output-Format | LLM-Narration | Patches | Spec-Mutation |
|---|---|---|---|---|---|
| **Spectral** (Stoplight, OSS) | MIT | "Rule X violated" | Nein | Manche Auto-Fixes für triviale Regeln | Limited |
| **Vacuum** (OSS) | MIT | Wie Spectral, schneller | Nein | Nein | Nein |
| **42Crunch** (Commercial) | Closed | Audit-Report (Security-Fokus) | Programmatisch | Remediation-Vorschläge | Begrenzt |
| **Stoplight Studio** | Freemium | Lint + GUI-Editor | Nein | Manuell (User editiert) | Manuell |
| **OpenAPI Auditor** (z. B. Apicurio) | OSS | Quality-Score | Nein | Nein | Nein |
| **Speakeasy** (Commercial) | Closed | SDK-Generation, kein Quality-Audit | Limited | Nein | Nein |
| **apiq** (this) | TBD | Engineering-grade Narration + JSON Patch + Quality Score | **Ja** | **Ja, applyiert** | **Ja, mit Versionierung** |

Die **uniqe Position** im Spec-First-Markt ist die Kombination aus:
1. LLM-narrationierte Findings (Spectral et al. produzieren keine Narration)
2. Ready-to-apply JSON Patches (andere Tools produzieren Vorschläge in Prosa)
3. Quality-Score mit Severity-Gewichtung (manche Tools haben einen Score, aber nicht so transparent)

### Frage 4: Wie sieht der reale Spec-First-Workflow mit apiq aus?

**Idealer User-Flow:**

```
1. Engineer hat ./openapi.yaml im Git-Repo (hand-edited oder via Stoplight gepflegt)
2. Engineer öffnet apiq, paste/upload den Spec
3. apiq analysiert ~60s → 14 Findings mit Narration + Patches
4. Engineer reviewt jeden Finding, applied 5 (rejected 9 als "intentional design choices")
5. Engineer exportiert den improved Spec als YAML
6. Engineer committet ./openapi-improved.yaml in den Repo
7. CI: openapi-generator-cli generate -i ./openapi-improved.yaml -g python-fastapi
8. Generierte Server-Stubs werden überschrieben; Custom-Business-Logic via .openapi-generator-ignore preserved
9. Engineer adjustiert Business-Logic in den neuen Stubs falls Signaturen sich änderten
10. Deploy
```

**Friction-Points im aktuellen Stand:**

- Schritt 5: Export ist dereferenziert (nicht modular mit `$ref`s) → Engineer muss manuell back-refactoren oder modular re-bundle. **Annoying, nicht blockierend.**
- Schritt 5: bei rekursiven Schemas brechen Cycle-Marker downstream → Engineer hits `swagger-parser` errors beim Codegen. **Blockierend für ~20% der Specs.**
- Schritt 7: keine GitHub-PR-Integration → Engineer muss manuell den Export downloaden und committen. **Annoying, nicht blockierend.**
- Schritt 7-9: kein Re-Validation in apiq → Engineer findet erst im CI-Codegen-Step heraus, wenn Patches OpenAPI-invalide produziert haben. **Mittelmäßig blockierend** (frustrierend, aber catched in CI).

### Was muss vor dem Launch geschlossen werden?

Reihenfolge nach Impact:

**Critical für Spec-First-Launch:**

1. **Re-validate-after-apply.** Nach jedem `applyPatch` einmal `swagger-parser.validate()` über das Resultat laufen. Wenn invalid → Apply rückabwickeln + dem User sagen "dieser Patch produziert ein invalides OpenAPI; Finding wird `stale` markiert." Aufwand: ~half day. **Definitiv vor Launch fixen.**

2. **Re-bundling im Export.** Statt dereferenziert: detect-original-`$ref`s + bundle-back. swagger-parser hat eine `bundle()`-Methode, die genau das macht. Aufwand: ~1 Tag. **Sehr empfohlen vor Launch** — sonst frustrieren die Spec-First-Engineers, deren `$ref`-Struktur du zerstörst.

3. **Cycle-Marker-Handling im Export.** Wenn der originale Spec rekursive `$ref`s hatte, dann müssen die Cycle-Marker im Export *korrekt* zu echten `$ref`s zurückkonvertiert werden. Sonst brechen rekursive Schemas. Aufwand: ~half day, wenn Re-Bundling steht. **Sehr empfohlen.**

**Nice-to-have aber nicht blockierend:**

4. **GitHub-Repo-Integration.** Statt Export-und-manuell-committen: "Open PR with improvements" Button → erzeugt Pull-Request im verbundenen Repo. Aufwand: ~3-5 Tage (GitHub OAuth + Repo-Permissions + PR-API). **Post-Launch v1.1 Material.**

5. **CLI-Mode.** `npx apiq-cli analyze ./openapi.yaml` produziert Markdown-Report + applied-improvements. Aufwand: ~1-2 Tage. **Post-Launch.**

6. **OpenAPI-Generator-Sample-Workflow im Onboarding.** Empty-State / Docs zeigt: "Hier ist ein Beispiel-Workflow: Apply Findings → Export → Run codegen." Aufwand: ~half day Docs. **Post-Launch.**

### Honest verdict

**Ja, apiq produziert für Spec-First-Users heute meistens deploybaren Output. Aber es gibt drei Gaps, die echte Spec-First-Engineers ärgern werden:**

1. Keine post-apply OpenAPI-Re-Validation → CI-Fail-Risiko
2. Dereferenzierter Export → Modularitäts-Verlust
3. Cycle-Marker brechen rekursive Schemas → ~20% der Specs broken

Alle drei sind **fixbar in 1-2 Tagen Engineering** (zusammen). Das sollte die erste Welle nach der Launch-PRD-Entscheidung sein, *bevor* wir Naming/UI/Marketing angehen.

**Wettbewerbsdifferenzierung im Spec-First-Markt ist real:** Spectral et al. haben keine LLM-Narration, keine ready-to-apply Patches. apiq hat einen genuinen Vorteil hier.

**TAM-Realität:** Spec-First-Teams sind ~20-30% des API-Marktes. Bei einer Schätzung von 50-100k API-Engineering-Teams global → 10-30k addressable. Davon vielleicht 1-3% reachable über typische Channels (HN, OpenAPI-Communities, dev.to) → 100-1000 als realistische erste-Year-Audience.

### Frage zurück

- OK mit den 1-2 Tagen Pre-Launch-Engineering, um die drei Gaps (Re-Validate / Re-Bundle / Cycle-Marker) zu schließen?
- Soll der Naming + UI-Redesign + Big-Spec-Spike *nach* diesen Gaps kommen, oder parallelisieren wir?
- Spec-First-Positioning explizit kommunizieren ("apiq is for spec-first / design-first API teams") oder breit lassen und die Audience implizit selbst-selektieren lassen?

---

## Scope-Eröffnung: was heißt "verbessern" — wie weit kann apiq gehen? (2026-05-03)

User: *"momentan braucht der user ja schon specs um apiq überhaupt nutzen zu können oder? und dann 'verbessert' apiq diese specs per knopfdruck, gibt es auch zb einen knopf für alle endpoints verbessern und oder direkt umsetzen?, aber was heißt verbessern hier genau? sowohl die funktionalität, also technisch?, als auch die doku? aber kann apiq sogar noch weiter gehen und das 'business' der api endpoints verbessern? vielleicht potentiell ungenutzte oder noch nicht implementierte aber nützliche endpoints 'erzeugen' ... usw?"*

Vier Fragen in einer. Geh ich der Reihe nach durch.

### Frage 1: User braucht heute eine Spec, um apiq zu nutzen — bleibt das so?

**Heute: ja, harte Voraussetzung.** Apiq's gesamter Workflow startet mit "import OpenAPI 3.x".

**Mögliche Erweiterungen (sortiert nach Aufwand):**

| Pfad | Was | Aufwand | Wert |
|---|---|---|---|
| **Paste/Upload** statt URL-only | Spec-Input ohne Public-Hosting | ~3 h | Hoch — Friction-Reducer |
| **Multi-File-Upload** (modulare Specs mit `$ref`s) | User uploadet `openapi.yaml` + alle `components/*.yaml` als ZIP | ~1 Tag | Mittel — Spec-First-Teams arbeiten oft modular |
| **Generation aus Beschreibung** | "Beschreibe deine API in Prosa, apiq generiert OpenAPI" — LLM-driven Greenfield | ~2-3 Wochen | Hoch — aber komplett anderes Produkt (= TypeSpec-ähnlich, konkurriert mit Cursor) |
| **Generation aus Code** | Apiq scannt Code-Repo (FastAPI/Spring-Decorators), extrahiert Spec + reviewt | ~3-5 Wochen | Sehr hoch — würde Code-First-Audience erschließen |

**Empfehlung für ersten Launch:** Paste/Upload ja (low-hanging-fruit), Multi-File optional. Greenfield-Generation aus Beschreibung ist ein anderes Produkt und gehört nicht in den Launch-Scope.

### Frage 2: Bulk-Apply / "Verbessere alle Endpoints"-Knopf

**Heute: nein.** Jedes Finding wird einzeln reviewt + Apply/Reject. Bewusste Entscheidung der v0.1-PRD weil "manche Findings könnten intentional design choices sein, die der User rejecten muss."

**Realistische Bulk-Optionen:**

| UX-Pattern | Was | Risiko | Aufwand |
|---|---|---|---|
| **"Apply all critical"** | Severity-`critical`-Bucket auf einmal applien | Niedrig — kritische Findings sind selten "intentional" | ~1 Tag |
| **"Apply all clarity"** | Documentation-Improvements gesamtbatch | Niedrig — kosmetisch, nicht-breaking | ~1 Tag |
| **"Apply all"** | Wirklich alle Findings | Hoch — Konflikt-Risiko zwischen Patches; manche Findings sollte User explicit reviewen | ~3-5 Tage (mit Konflikt-Detection) |
| **"Apply per Endpoint"** | "Verbessere alles unter `/orders/*` auf einmal" | Mittel | ~2 Tage |
| **"Auto-apply on import"** | Findings nicht zeigen, sofort applien, Output ist die improved Spec | Sehr hoch — User verliert Lerneffekt + Kontrolle | ~half day technisch, aber kannibalisiert das aktuelle Produkt |

**Engineering-Komplikation bei Bulk:** Patches sind state-dependent. Finding A's Patch ändert die Spec; danach sind manche Findings stale (ihre Patches greifen nicht mehr). Bulk-Apply muss in einer korrekten Reihenfolge applien + zwischendurch re-validieren + skipped-due-to-stale-Reporting machen.

**Empfehlung:** "Apply all critical" als ersten Bulk-Knopf. Cheap, low-risk, hochwertvoll für Engineers mit 14+ Findings, die nicht jeden einzeln reviewen wollen. **"Apply all" generell** ist gefährlicher und sollte v0.2+ sein.

### Frage 3: Was heißt "verbessern" konkret? Technisch + Doku + ...?

Apiq's heutige drei Finding-Kategorien (per Epic 00 Spike kalibriert):

**(a) Clarity — Dokumentations-Qualität**
- Beispiele: missing `description` Felder, fehlende `operationId`, inkonsistente Naming-Konventionen, fehlende `examples` in Schemas, unklare Parameter-Descriptions
- Output: Doc-Patches, keine semantischen API-Änderungen
- Risiko: niedrig (kosmetisch, nicht-breaking)
- Anteil typischer Findings: ~40%

**(b) Design — Technische / Architektur-Qualität**
- Beispiele: Pagination-Pattern fehlt, inkonsistente Error-Schemas, nicht-RESTful Verbs, fehlende Idempotency, falsche Status-Codes, inkonsistente Response-Envelope
- Output: API-strukturändernde Patches (oft breaking changes)
- Risiko: mittel (breaking changes wenn Endpoint schon im Production)
- Anteil typischer Findings: ~40%

**(c) Risk — Pattern-Level Sicherheit/Governance**
- Beispiele: sensitive Felder ohne Auth-Schema, BOLA-shape (Object-Level-Authz fehlt), missing Rate-Limit-Hints, zu permissive Schemas
- Output: Schema-Härtungen, Security-Schema-Additions
- Risiko: niedrig-mittel
- Anteil typischer Findings: ~20%

**Was apiq heute *nicht* abdeckt:**

- ❌ **Performance-Optimierung:** keine Analyse von "Response-Shape ist gross / N+1-Query-anfällig / unnötig nested"
- ❌ **Versionierung / Migration:** keine Vorschläge "diese 5 Endpoints solltest du in v2 deprecaten"
- ❌ **Cross-Endpoint-Konsistenz:** Pagination-Mismatch zwischen `/users` und `/orders` wird heute *nur* bemerkt, wenn beide im selben Single-Call-Spec sind und das LLM es zufällig sieht (v0.2 Cross-Spec-Findings würde das systematisch lösen)
- ❌ **Business-Logik / Use-Case-Vollständigkeit:** "deine API macht X, aber typische User wollen auch Y machen — fehlender Endpoint" → das ist die "Generation"-Frage in (4)
- ❌ **Implementation-Empfehlungen:** "für diese Pagination empfehle ich Cursor + tie-breaker, hier ist die Server-Code-Skizze" — das ist kein Spec-Edit, sondern Solution-Architect-Arbeit
- ❌ **API-Lifecycle-Strategie:** "wann solltest du v2 launchen, wie deprecaten, wie communicaten" — würde Marketing-Layer-Wissen brauchen

### Frage 4: Kann apiq weiter gehen — Business-Improvements + Endpoint-Generation?

Die "wie weit kann apiq gehen?"-Frage. Hier wird's interessant — und riskanter.

#### (i) Endpoint-Generation aus Capability-Gaps

**Konzept:** apiq schaut den Spec an, erkennt Domain-Pattern (e-commerce, CRM, payment, …), und sagt:

- *"Du hast `/orders` mit GET/POST, aber kein DELETE — intentional?"*
- *"Subscription-APIs haben typischerweise `/customers/{id}/payment_methods`. Deins fehlt — Customers können Billing nicht updaten ohne Re-Auth."*
- *"Du exposierst `/products` aber kein `/products/{id}/recommendations`. Standard-E-Commerce-Pattern."*

**Implementation:** Neue Finding-Klasse `kind: 'gap_suggestion'`, anderer Prompt-Fokus ("look for capability gaps, not bugs"), Patch-Operations sind `add` für ganze neue Pfade.

**Realistisches Quality-Risk:** **hoch.** "Suggested endpoint" ist *kreative* LLM-Arbeit — das Modell könnte Endpoints vorschlagen, die für dieses spezifische Business keinen Sinn machen. Z. B. "/users/{id}/social-graph"-Vorschlag bei einer Banking-API. Calibration deutlich schwerer als der aktuelle Review-Mode.

**Aufwand:** ~2-3 Wochen incl. Spike-Phase (kann der LLM zuverlässig Domain-Patterns erkennen + Lücken identifizieren?).

**Wert:** sehr hoch wenn's funktioniert. Das ist Solution-Architect-Arbeit, die normalerweise $300/h kostet.

#### (ii) Business-Level-Improvements

**Konzept:** apiq versteht die Business-Domäne und kommentiert auf strategischer Ebene:

- *"Bulk-create fehlt für `/orders`. B2B-Integrationen werden das innerhalb von 6 Monaten brauchen."*
- *"Pricing-Modell-Alignment: deine `/usage`-Endpoints exposen per-Call-Daten, aber wenn du monatlich abrechnen willst, brauchst du Aggregation-Endpoints."*
- *"Webhooks haben `order.created` aber kein `order.status_changed`. Customers werden polling, was teuer und schlechte UX ist."*

**Voraussetzung:** Business-Domain-Context. Heute kennt apiq nur den Spec. Für Business-Findings müsste der User Domain-Info inputen (per Onboarding-Frage: "What does your business do?").

**Implementation:** Optional `Spec.businessContext` Feld + Domain-aware Prompt + neue Finding-Kategorie `business`.

**Realistisches Quality-Risk:** **mittel-hoch.** Business-Context-Suggestions können hochwertvoll oder komplett-irrelevant sein. Ohne Calibration-Spike unmöglich vorherzusagen.

**Aufwand:** ~1-2 Wochen incl. Spike (welche Business-Patterns kann das LLM zuverlässig erkennen?).

**Wert:** *enormous* wenn's funktioniert. Das wäre eine genuine *AI-Consultant*-Position — von "Linter mit Narration" zu "Senior-API-Architekt-on-demand".

**Risiko:** *enormous* wenn's nicht funktioniert. Falsche Business-Empfehlungen kosten Engineers echtes Geld in Form von gebauten-aber-unbrauchten Endpoints.

#### (iii) Implementation-Hints (Solution-Architect-Mode)

**Konzept:** apiq geht über den Spec hinaus und schlägt Implementation-Approaches vor:

- *"Für `/orders/bulk-create` empfehle ich transaktionales Batching mit partial-success-Response. Hier ist die Response-Shape ..."*
- *"Für `/products/recommendations` ist Collaborative Filtering der typische Ansatz. Implementation-Aufwand: ..."*

**Realistisches Risk:** **sehr hoch.** Implementation-Vorschläge können in subtilen Wegen falsch sein, die echtes Geld kosten. Hier ist apiq sehr nahe an "Halluzinationen mit Konsequenzen."

**Empfehlung:** **nicht für Launch.** Vielleicht v0.4+ wenn das Trust-Niveau in apiq's Output established ist.

#### (iv) Versionierung / Refactoring-Strategie

**Konzept:** apiq macht v1→v2-Migration-Vorschläge:

- *"5 Deprecation-Kandidaten in `/paths/*` für v2-Removal."*
- *"Inkonsistente Error-Schemas — hier ist ein v2-Clean-Error-Schema + Migration-Patches."*

**Realistisches Quality-Risk:** **niedrig-mittel.** Strukturell ähnlich wie aktuelle Design-Findings, nur breiter.

**Aufwand:** ~1 Woche.

**Wert:** mittel — nützlich für Mature-API-Teams, weniger für Greenfield-APIs.

### Strategische Implikation

Hier ist die wichtige Beobachtung: jede dieser Erweiterungen verändert apiq's *Kategorie*:

- **Heute:** "Linter mit LLM-Narration" → konkurriert mit Spectral, schmaler Moat
- **+ Bulk-Apply:** "Productive Linter" → marginales Upgrade
- **+ Endpoint-Generation:** "AI-API-Architect" → neues Kategorie, höherer TAM, Solution-Architect-Adjacent
- **+ Business-Improvements:** "AI-API-Consultant" → genuine Consulting-Disruption, hoher Value, hohes Halluzinations-Risiko
- **+ Implementation-Hints:** "AI-Solution-Architect" → konkurriert mit GitHub Copilot + Claude Code, gefährliches Territorium

**Die Spec-First-Niche-Entscheidung von oben** kombiniert mit "wie weit gehen wir?" ist die wichtige Strategieentscheidung. Mögliche Kombinationen:

| Apiq-Definition | Audience | Differentiator | Risiko |
|---|---|---|---|
| Spec-First-Linter mit Narration (heute) | 10-30k addressable | LLM-narration, Apply-Loop | Schmaler Moat |
| + Capability-Gap-Generation | 10-30k mit deutlich höherem Engagement | Echte AI-Architect-Funktionalität | LLM-Quality-Risk hoch |
| + Business-Context-Improvements | gleiches Audience-Volumen, deutlich höheres Pricing-Potential | AI-Consultant-Funktionalität | Quality + Pricing-Komplexität |
| Full AI-API-Architect | weiter, aber unklar wie weit | Komplette Consulting-Disruption | Implementation-Halluzinations-Konsequenzen |

### Empfehlung für die Launch-PRD

**Pragmatisch:** für den ersten Launch bleibt apiq beim aktuellen Scope (Linter+Narration+Apply-Loop) plus *einer* Erweiterung als Differentiator-Multiplikator:

**Best Pick: (i) Endpoint-Generation aus Capability-Gaps.**

Warum:
- Konkrete Erweiterung der bestehenden Pipeline (neuer Finding-Type, neuer Prompt-Section)
- Spielt die "AI-Architect"-Differenzierung aus, ohne zu Implementation-Suggestions zu kippen
- Demoable: in der Spec-Gallery aus Round 5 könnte man zeigen "Look at apiq's gap-suggestions for Stripe's API: <unexpected-gap>" — Tweet-bait
- Quality-Risk handhabbar, weil's noch im Spec-Domain bleibt

Aufwand: ~2-3 Wochen (incl. Spike). Würde den Launch-Plan auf ~5-6 Wochen total verschieben (vs. 3 Wochen ohne).

**Alternative wenn Risiko-tolerant:** (i) + (ii) Business-Improvements.

Aufwand dann ~4-5 Wochen extra. Würde apiq als "AI-API-Consultant" positionieren — sehr different als "Linter+". Wenn das funktioniert, ist der Markt 10× größer als der Spec-First-Linter-Markt.

**Conservative Pick:** kein v0.2-Add, nur Spec-First-Niche mit der bestehenden Funktionalität + Pre-Launch-Fixes (Re-Validate / Re-Bundle / Cycle-Marker).

### Frage zurück

1. Bulk-Apply: starten wir mit "Apply all critical" als low-risk-Quick-Win? Oder skippen wir Bulk komplett?
2. Capability-Gap-Generation (i): bauen wir die für den Launch ein? Wenn ja, brauchen wir den Spike *vor* dem Big-Spec-Spike (zwei separate Calibrations).
3. Business-Improvements (ii): zu viel auf einmal für den ersten Launch, oder genau die Kategorie-Definition, die du willst?
4. Wo zieht ihr die Grenze zwischen "noch apiq" und "neues Produkt" — wenn apiq Implementation-Hints gibt, ist es noch dasselbe Tool oder geht's in Cursor-Territorium?

---

## "Try It Out"-Funktionalität + alle drei Spike-Dimensionen testen? (2026-05-03)

User: *"ein user soll apiq wirklich cool nutzen können. einloggen, spec importieren, apply all, und verbesserte spec exportieren! super workflow! das kann man usern zum ausprobieren verkaufen oder? können wir nicht selbst so eine art 'try out your new specs' funktionalität zur verfügung stellen? vielleicht mit irgendeiner integration oder so?"* + *"angenommen wir machen jetzt unseren research spike, sollen wir nicht einfach i) bis iii) mittesten? was ist wenn die ergebnisse gut sind? dann ist das doch gar kein wirklicher mehraufwand aber 100x höherer Wert für den user oder nicht?!"*

Zwei Punkte. Geh sie der Reihe nach an.

### Q1: "Try out your new specs" — Mock-Server / Interactive-Preview / Codegen integriert?

**Du hast eine sehr gute Intuition.** Das ist potentiell DAS killer-Feature für den Spec-First-Launch. Wenn der User-Flow nicht endet bei "Export-Datei landet auf Festplatte", sondern bei "klick → siehe deine improved API live, klick → download server stubs", dann hat apiq einen geschlossenen Wert-Loop, den Spectral / 42Crunch / Stoplight (separat) nicht haben.

#### Drei Integrations-Optionen, sortiert nach Aufwand/Wert

**(a) Stoplight Elements als embedded Interactive-Preview** — *cheap, hoher Wert*

[Stoplight Elements](https://github.com/stoplightio/elements) ist eine OSS-Web-Component (`<elements-api>`), die eine OpenAPI-Spec interaktiv rendert: Endpoint-Browser links, Request/Response-Schemas + Try-It-Out-Buttons rechts. Wie Swagger UI, aber moderner gestaltet, MIT-lizenziert, 1-Tag-Integration in eine bestehende Next-App.

User-Flow: nach Apply All → "Preview improved spec" Tab → embedded Elements-Component rendert die Spec → User browst seine API live, klickt "Try It" auf einem Endpoint → sieht Sample-Response (initial faked aus Schema-Examples).

Aufwand: ~half day für die Integration als Drittes Tab im Spec-Detail (neben "Findings" und "Versions").
Wert: hoch — selbst ohne echten Mock-Backend ist das ein deutlicher UX-Gewinn. Spec-First-Engineers wollen ihre Spec sehen + drücken, nicht nur als JSON exportieren.

**(b) Prism Mock-Server für echte Try-It-Out Calls** — *mittel-hoch, sehr hoher Wert*

[Prism](https://github.com/stoplightio/prism) ist Stoplights OSS-Mock-Server: nimmt eine OpenAPI-Spec, serviert echte HTTP-Responses basierend auf Schema-`example`s + Faker-Patterns. Engineers können `curl` gegen den Mock laufen lassen.

Integration: pro Spec ein ephemeral Prism-Instance (Docker oder Vercel-Function), mit URL wie `https://mock.apiq.dev/<specId>/<endpoint>`. Auto-Cleanup nach 24 h. Combined mit (a): die Try-It-Out-Buttons im Stoplight-Elements-Preview rufen den echten Prism-Mock.

Aufwand: ~3-5 Tage für Prism-Containerization + Routing + Rate-Limit + Lifecycle-Management.
Wert: sehr hoch — das ist real-feel-good. User schickt einen `curl` an seine improved API, sieht die Response, glaubt das Tool. **Das ist Demo-Magic, das niemand sonst hat.** (Stoplight selbst hat Prism + Elements separat zum kombinieren; apiq würde sie als One-Click-Experience anbieten.)

**(c) Server-Stub-Codegen on-demand** — *mittel, mittel-hoher Wert*

Auf Knopfdruck "Download server stubs (FastAPI / NestJS / Spring / ...)" → server-seitig wird `openapi-generator-cli generate` ausgeführt → ZIP-Download.

Aufwand: ~2 Tage. OpenAPI Generator als Subprocess oder Docker-Image; Templates für ~5 Top-Sprachen.
Wert: mittel. Engineers könnten das auch lokal machen (`openapi-generator-cli` ist frei verfügbar) — aber die Convenience ist real.

**Empfehlung — alle drei einbauen, in dieser Reihenfolge:**

| Phase | Was | Aufwand | Wert-Multiplikator |
|---|---|---|---|
| Pre-Launch must | (a) Stoplight Elements Preview | half day | macht Export greifbar |
| Pre-Launch optional | (b) Prism Mock | 3-5 Tage | Demo-Killer-Feature |
| Post-Launch v1.1 | (c) Server-Stub-Download | 2 Tage | Convenience |

(a) ist no-brainer. (b) ist die Frage: lohnt sich 3-5 Tage extra für ein echtes Demo-Wow? Mein Bauch: **ja**, weil es eine genuine Differenzierung schafft, die niemand sonst integriert anbietet. (c) kann post-Launch.

#### Bonus-Idee: User-Workflow als nahtlose Demo-Loop

Mit (a)+(b) wird der User-Flow:

```
1. Login
2. Paste Spec (Paste-Mode aus dem File-Upload-Bullet oben)
3. ~60s Analyse → 14 Findings
4. "Apply all critical" Button → 2 Patches sofort applied
5. Preview-Tab öffnen → Stoplight Elements rendert die improved Spec live
6. Engineer browst Endpoints, klickt "Try It Out" auf POST /orders
7. Prism-Mock antwortet mit gefakter Response basierend auf der improved Schema
8. Engineer ist überzeugt → Export improved Spec → committet im Repo
9. (Post-Launch) "Download server stubs" → ZIP
```

Das ist ein vollständiger Funnel von "ich verstehe nichts" zu "ich habe deploybare Code-Stubs" in **5 Minuten**. Das ist der Pitch.

### Q2: Sollten wir (i)+(ii)+(iii) parallel im Spike testen?

**Deine Intuition ist gut, aber die Mathematik stimmt nicht ganz.** Lass mich kritisch sein.

#### Was ein Spike kostet

Ein Spike ist nicht "ein bisschen Prompt schreiben". Pro getestete Dimension brauchst du:

1. **Test-Spec-Curation** — welche Specs zeigen das gewünschte Pattern? Für (i) brauchst du Specs mit erkennbar fehlenden Endpoints (mehrere Beispiele aus verschiedenen Domänen). Für (ii) brauchst du Specs *mit Business-Context-Annotation* — die hast du nicht; muss man erst zusammenstellen oder synthetisch erzeugen.
2. **Prompt-Iteration** — pro Dimension mehrere Prompt-Versionen testen, Output-Qualität bewerten.
3. **Evaluation-Kriterien** — wer entscheidet, ob ein Output "gut" ist? Für (i) "Capability-Gap": ist `/users/{id}/social-graph`-Vorschlag bei Banking-API gut oder nicht? Subjektiv. Für (iii) "Implementation-Hint": ist der vorgeschlagene Code-Skeleton korrekt? Kann nur durch Code-Review verifiziert werden.
4. **Iterations-Zyklen** — wenn die erste Version nicht funktioniert, neu kalibrieren.

**Geschätzte Kosten pro Dimension:**

- (i) Capability-Gap-Generation: 4-7 Tage Spike
- (ii) Business-Improvements: 5-10 Tage Spike (komplizierter wegen Business-Context-Anforderung)
- (iii) Implementation-Hints: 7-15 Tage Spike (extrem schwer zu evaluieren; Hallucination-Konsequenzen real)
- Big-Spec-Architecture-Spike (sowieso gebraucht): 3-5 Tage

**Sequenziell:** 19-37 Tage = ~4-7 Wochen pure Spike-Phase.
**Parallel:** ~10-15 Tage wenn alle gleichzeitig laufen mit Prompt-Engineering-Aufwand-Sharing — aber Evaluation-Aufwand bleibt linear (jede Dimension muss separat bewertet werden).

#### Wahrscheinlichkeiten der "guten Ergebnisse"

Hier wird's hart. Die Frage ist: wie wahrscheinlich ist es, dass JEDE der drei Dimensionen Ergebnisse liefert, die in v0.1 shippable sind?

Honest probabilities (basierend auf LLM-Track-Record für ähnliche Tasks 2025-26):

- **(i) Capability-Gap-Generation:** **60-70% Erfolg.** LLM kann Domain-Patterns aus Spec-Inhalt erkennen, wenn Beispiele gut sind. Aber Hallucination-Risk real (irrelevante Endpoint-Vorschläge).
- **(ii) Business-Improvements:** **30-40% Erfolg.** Zu vage ohne starkes Business-Context-Input vom User. Evaluation-Subjektivität hoch. "Ist dieses Endpoint-Vorschlag businessrelevant?" hängt davon ab, was du nicht weißt.
- **(iii) Implementation-Hints:** **15-25% Erfolg in shippable Quality.** LLM-Code-Generation ist 2026 gut genug für Boilerplate, aber Architektur-Empfehlungen ("verwende Saga statt Choreography") sind notoriously fragil. Evaluator brauchst Senior-Engineers, nicht skalierbar.

**Multiplikative Wahrscheinlichkeit, dass *alle drei* shippable sind:** ~3-7%.

**Wahrscheinlichkeit, dass *mindestens eine* shippable ist:** ~80-90% (additiv).

**Wichtigste Konsequenz:** "100x Wert wenn alles funktioniert" stimmt mathematisch. Aber die Wahrscheinlichkeit dafür ist <10%. Du würdest 4-7 Wochen investieren, um eine 7%-Chance zu spielen.

#### Smart Play: Staged Spike

Statt parallel: **sequenziell, aber mit hartem Budget pro Dimension und Cancel-bei-Misserfolg.**

```
Phase 0 (sowieso): Big-Spec-Architecture-Spike — 3-5 Tage
  → entscheidet über Bigger-Context vs. Chunking vs. Two-Call
  → MUSS klappen, sonst hast du keinen Build-Ground

Phase 1: (i) Capability-Gap-Generation Spike — Budget 5 Tage
  → Wenn nach 5 Tagen "good enough" → in Launch-Scope rein
  → Wenn nach 5 Tagen "nicht überzeugend" → nach v0.2 verschieben, weiter zu Phase 2 oder Launch

Phase 2 (NUR wenn Phase 1 erfolgreich): (ii) Business-Improvements Spike — Budget 5 Tage
  → Gleiche Cancel-Bedingung
  → Aufbauend auf Phase-1-Findings (Business-Context kann an Capability-Gap-Findings anknüpfen)

Phase 3 (NUR wenn Phase 1 + 2 erfolgreich): (iii) Implementation-Hints Spike — Budget 7 Tage
  → Sehr hohe Skepsis; nur wenn die anderen zwei stark sind
  → Eher ein Stretch-Goal als Launch-Feature
```

**Erwartungswert dieser Strategie:**

- ~70% Wahrscheinlichkeit (i) shippt → +1 Differenziator zum Launch
- ~25% Wahrscheinlichkeit (i)+(ii) shipping → repositioniert apiq als "AI-API-Consultant"
- ~5% Wahrscheinlichkeit alle drei shipping → komplett-andere Produkt-Kategorie

**Aufwand:** 3-5 Tage Phase 0 + 5 Tage Phase 1 + 0-12 Tage Phase 2-3 = **8-22 Tage gesamt**, je nachdem wo wir stoppen.

**Vs. der Parallel-Variante:** ~10-15 Tage egal was rauskommt. Du sparst 0-7 Tage gegenüber sequenziell, aber riskierst 2-7 Tage in Dimensionen, die nicht funktionieren werden.

#### Empfehlung: Staged Spike

**Mache (i) + (ii) auf jeden Fall, (iii) nur wenn die ersten zwei stark genug sind.**

Begründung:
- (i) ist hochwahrscheinlich erfolgreich + bringt klare Differentiation. Worth spike-investment.
- (ii) ist ~30-40% — aber wenn's klappt, transformiert es das Produkt komplett. Worth conditional spike-investment.
- (iii) ist ~15-25% + hoher Schaden bei falschen Outputs (User baut dann basierend auf Halluzinationen) → eher Skepsis-Modus.

**Konkret im Launch-Plan:**

| Phase | Was | Aufwand |
|---|---|---|
| Pre-Launch Phase 0 | Big-Spec-Architecture-Spike | 3-5 Tage |
| Pre-Launch Phase 1 | (i) Capability-Gap Spike | 5 Tage |
| Pre-Launch Phase 2 (conditional) | (ii) Business-Improvements Spike | 5 Tage if Phase 1 erfolgreich, sonst 0 |
| Pre-Launch Phase 3 (conditional) | (iii) Implementation-Hints Spike | 7 Tage if Phase 2 erfolgreich, sonst 0 |
| Pre-Launch Engineering | (a)+(b) Try-It-Out + 1-2 Tage Spec-Fixes + Naming + UI | 7-10 Tage |
| Launch-Prep | Vercel/Supabase/Privacy/etc. | 3-5 Tage |

**Total: ~21-37 Tage = 4-7 Wochen.** Range hängt davon ab, wie viele der Spike-Phasen erfolgreich sind und wie viel UI-Redesign du willst.

### Frage zurück

1. OK mit der Staged-Spike-Strategie statt parallelem all-three-Spike?
2. Stoplight Elements Preview (a) als Pre-Launch must, Prism Mock-Server (b) als Pre-Launch nice-to-have? Oder beide Pflicht?
3. Apply-all-critical: definitely Pre-Launch (du hast oben gesagt "selbstverständlich"). Bestätigt.
4. Bei Phase 1-3 Spike: was ist dein Cancel-Schwellwert? "Wenn nach 5 Tagen die Hälfte der Outputs Schrott ist, abbrechen" oder "wenn 80% gut sind, in Launch rein"? Wir brauchen klare Kriterien vor Spike-Start.

---

## Reality-Check 2026: OpenAPI-Spec-User — noch ein lebender Markt oder 2017-Legacy? (2026-05-03)

User: *"gibt es wirklich noch diesen openapi spec user, für die der von dir oben beschriebene user-workflow mit a+b wirklich immer noch einen mehrwert bringt? oder ist das eigentlich 2017 legacy?"*

Echte Recherche, keine Bauchgefühl-Antwort. Daten aus 2025-2026 Quellen.

### Datenlage 2025-26

**Postman State of API 2025 Report:**
- **82% der Organisationen** verfolgen einen "API-first"-Ansatz auf irgendeinem Level (vs. ~70% in 2024)
- **25% der Organisationen** sind "fully API-first" — **+12 Prozentpunkte gegenüber 2024**
- "The shift from code-first to API-first is not just happening, it's accelerating."
- 93% aller APIs sind REST (also OpenAPI-applicable)
- 60% der Teams versionieren ihre APIs explizit
- 54% nutzen GitHub Actions in der API-Pipeline

**OpenAPI-Generator Adoption (Hard-Data):**
- **600.000 Downloads pro Woche** über das NPM-CLI-Wrapper
- **30 Millionen Docker-Pulls** auf openapi-generator-cli image
- Aktiv-maintained, supportiert >50 Sprachen + Frameworks (FastAPI, Spring, NestJS, Echo, ASP.NET, etc.)
- Letzte Major-Updates regelmäßig in 2025

**OpenAPI-Spec-Format selbst:**
- **OpenAPI 3.2.0** released im **September 2025** — aktive Spec-Evolution, nicht stagnierend
- 3.1 (Juli 2021) → 3.2 (Sept 2025): JSON Schema Draft 2020-12 alignment, neue Konstrukte für AI-Agent-Konsumption

**TypeSpec Adoption (Microsoft):**
- **TypeSpec 1.0 GA im Mai 2025** — mit explizitem **OpenApiMigration Tool**, um existierende OpenAPI-Specs nach TypeSpec zu konvertieren
- TypeSpec-Positionierung von Microsoft selbst: *"complementary, high-level abstraction that can make OpenAPI better"* — **nicht Replacement**
- TypeSpec emittiert OpenAPI als primäres Output-Format

**AWS Smithy:**
- Public-availability der AWS-eigenen Smithy-API-Models 2025 — inklusive Daily-Updates der Maven-Central-Veröffentlichung
- AWS nutzt Smithy intern seit 2018, exportiert zu OpenAPI für externes Consumption
- Smithy + TypeSpec + OpenAPI v3 alle als gleichberechtigte Inputs in AWS PDK

**AI-Coding-Assistants + OpenAPI:**
- Spec-Driven-Development-Workflows treat specs als "executable blueprints that continuously regenerate implementation"
- **GitHub Spec Kit** (2025) läuft agent-agnostisch über Copilot, Claude Code, Gemini CLI, Cursor, Windsurf
- AI-Agents lesen OpenAPI-Specs, um Client-Code in Stunden statt Wochen zu generieren
- StackHawk's "Code → OpenAPI"-Pipeline produziert Specs aus existierendem Code für AI-Agent-Konsumption

### Was die Daten *wirklich* sagen

**OpenAPI ist nicht 2017-Legacy. Es ist 2026 zentraler als jemals zuvor.** Drei Trends machen das aus:

1. **API-First-Adoption wächst schneller als jemals**, getrieben von der Erkenntnis, dass Specs als Contract zwischen Frontend/Backend/Mobile/Partner-Integration wertvoller sind als jemals.
2. **AI-Coding-Assistants brauchen machine-readable Specs.** Eine schlechte oder fehlende OpenAPI-Spec = AI-Agent kann keinen sauberen Client/Server-Code generieren. Spec-Qualität wurde zum AI-Agent-Productivity-Multiplier.
3. **Higher-Level-DSLs (TypeSpec, Smithy) verstärken OpenAPI**, statt es zu ersetzen — sie compileen alle zu OpenAPI als Lingua Franca.

**ABER — und hier ist der ehrliche Reality-Check für apiq:**

Der **Workflow-Archetyp**, der aus 2017 stammt — *"Engineer hand-editiert openapi.yaml in VSCode"* — **ist tatsächlich am schrumpfen.** Was ihn ablöst:

| Workflow-Archetyp 2026 | Marktanteil-Schätzung | Was bedeutet das für apiq |
|---|---|---|
| **(I)** Hand-edited OpenAPI YAML/JSON (klassisches Spec-First, 2017-Style) | ~5-15% (schrumpfend) | apiq's "Try It Out + Apply All"-Flow paßt direkt rein |
| **(II)** TypeSpec / Smithy → emittierte OpenAPI (modernes Spec-First) | ~10-20% (wachsend) | apiq analysiert die emittierte OpenAPI, aber Round-Trip zurück nach TypeSpec ist offen |
| **(III)** Auto-generierte OpenAPI aus Code (FastAPI, Spring Boot, NestJS) | ~50-60% (dominant) | apiq's Output ist eine To-Do-Liste manueller Code-Änderungen — der Code-First-Gap, den wir oben diskutiert haben |
| **(IV)** AI-Agent generiert OpenAPI aus Anforderungen (neu, wachsend) | ~5-10% (rapidly growing) | apiq als Quality-Gate nach AI-Generation — neue Niche! |
| **(V)** Spec-Less / GraphQL / gRPC | ~10-15% | nicht apiq's Markt |

### Was bedeutet das konkret für die Apply-All-Critical + Try-It-Out-Workflow-Idee?

**Die gute Nachricht:** der Workflow ist **2026 relevanter, nicht weniger relevant** als 2017 — aber für eine etwas andere Audience als der naive Spec-First-User.

**Die kritische Nachricht:** der primäre Markt ist nicht mehr Workflow (I) "engineer hand-edits YAML." Das ist heute eine schrumpfende Niche. Der primäre Markt für apiq's Wert-Loop ist:

- **(II) TypeSpec/Smithy-Users**, die ihre emittierte OpenAPI-Spec quality-checken wollen, bevor sie Client-SDKs / API-Gateways daraus generieren. Apiq's Apply-Flow funktioniert hier zu 80% — die letzten 20% (Round-Trip nach TypeSpec) bleiben offen, aber für viele User reicht der Spec-Diff als Reference-Dokument für ihre TypeSpec-Anpassungen.

- **(IV) AI-Generated-Specs**, die User vom Cursor/Claude-Code/Spec-Kit bekommen und vor dem Deploy validieren wollen. *"AI generated this OpenAPI for me, ist es gut genug zum Deploy?"* Apiq als post-AI-Quality-Gate ist eine genuin neue Kategorie. Apply-All-Critical macht hier perfekt Sinn — User vertraut dem AI-Agent nicht zu 100%, will manuell die kritischen Findings reviewen.

- **(III) Code-First-Users mit auto-generierter Spec**, die apiq als Read-Only-Audit-Tool nutzen — nicht den Apply-Flow, sondern den Findings-Report als Code-Review-Hilfe. Hier ist apiq's aktueller Apply-Mechanik *Theater* (wir hatten den Riss oben), aber der Findings-Report ist trotzdem wertvoll.

### Implikationen für die Launch-Positionierung

Die Spec-First-Niche-Entscheidung von oben war richtig in der Richtung — aber die Audience-Beschreibung muss präziser werden:

**Falsch (2017-Framing):** *"apiq is for engineers who hand-write OpenAPI YAML and want a design partner."*  
**Schrumpfender Markt, Audience-Beschreibung wirkt veraltet.**

**Besser (2026-Framing):** *"apiq is the quality-gate for OpenAPI specs in the AI age — whether you wrote it by hand, generated it from TypeSpec, or got it from your AI coding agent. Apply critical fixes in one click; preview the result; ship to codegen."*  
**Wachsender Markt, AI-Trend reitend, Workflow-agnostisch.**

Das ist gut für apiq:
- **Audience-TAM ist deutlich größer** als pure-Spec-First (sagen wir 30-40% des API-Marktes statt 5-15%)
- **AI-Wave ist Tailwind, nicht Headwind** — apiq ist genau das Tool, das User brauchen, wenn sie AI-Agents zur Spec-Generation nutzen
- **Differentiation ist klarer**: Spectral linted Hand-Specs gut, aber niemand hat ein Quality-Gate für AI-generierte Specs gebaut. Das ist eine erkennbar offene Lücke.

### Drei kritische Risiken bleiben

1. **Big-AI-Lab-Threat verstärkt sich.** Wenn Anthropic / OpenAI / Google ein "review my OpenAPI spec" als Feature in Claude Projects / Custom GPTs / Gemini Gems launchen, ist apiq's Differentiation halbiert. Heute existiert das nicht; in 6-12 Monaten könnte es. Distribution + Brand-Building ist Time-Critical.

2. **TypeSpec-Roundtrip ist offen.** Für die ~10-20% TypeSpec-User ist apiq's Output eine Diff, die sie manuell zu TypeSpec rückportieren müssen. Das ist Reibung, aber gleicher Reibung wie heute zu OpenAPI-Generator. Nicht-blockierend, aber ein offener Polish-Punkt.

3. **Audience erkennen "Quality-Gate-for-AI-Generated-Specs" als ihren Pain.** Today (Mai 2026) sind viele Engineers noch nicht bei dem Workflow angekommen — sie nutzen AI-Agents in der Codebase, aber AI-Agent-zu-OpenAPI ist noch selteneres Pattern. apiq's Marketing müsste die Pain explicit machen, bevor User sich angesprochen fühlen.

### Verdict

**Markt ist real, größer als 2017, im Wandel.** Apiq's Workflow (Apply All Critical → Try It Out → Export) hat in 2026 mehr Relevanz, nicht weniger — aber die Audience-Sprache muss vom "Hand-YAML-Editor"-Framing zum "Spec-Quality-Gate-im-AI-Age"-Framing wechseln.

**Empfehlung für die Launch-PRD:**

- **Positioning:** "*Quality-Gate für OpenAPI-Specs im AI-Zeitalter. Apply critical fixes in one click, preview live, ship to codegen — egal ob deine Spec hand-edited, TypeSpec-generated oder AI-generiert ist.*"
- **Primäre Audience:** TypeSpec/Smithy-Users + AI-Agent-Spec-Generators + sophisticated Spec-First-Engineers — kombiniert ~25-40% des API-Marktes statt 5-15% pure-classical-Spec-First.
- **Demo-Story:** Zeige, wie apiq die Specs hochwertiger Public-APIs (Stripe, GitHub) verbessern könnte — das adressiert sowohl Hand-Editing-Users (klassischer Demo) als auch AI-Generation-Users (Implication: "wenn so professionelle APIs Findings haben, hat deine AI-generierte Spec auch welche").
- **Try-It-Out-Feature** macht 100% Sinn für alle drei Primär-Audience-Subsegmente. Stoplight Elements + Prism als Pre-Launch-Investment lohnt sich.

### Frage zurück

1. OK mit dem Reframing: "Quality-Gate für OpenAPI-Specs im AI-Zeitalter" statt "Linter für Spec-First-Engineers"?
2. Soll die Marketing-Story den AI-Aspekt explicit machen ("review your AI-generated specs") oder agnostisch bleiben?
3. TypeSpec-Roundtrip-Polish: Pre-Launch oder Post-Launch?

Sources:
- [2025 State of the API Report | Postman](https://www.postman.com/state-of-api/2025/)
- [Overview of TypeSpec - Microsoft Learn](https://learn.microsoft.com/en-us/azure/developer/typespec/overview)
- [TypeSpec 1.0 Release Notes (May 2025)](https://typespec.io/docs/release-notes/release-2025-05-06/)
- [OpenAPI Generator (GitHub)](https://github.com/OpenAPITools/openapi-generator)
- [API-First Development 2026 Guide](https://www.programming-helper.com/tech/api-first-development-2026-rest-openapi-developer-experience-python)
- [AWS Open-Sources Smithy API Models (InfoQ, 2025)](https://www.infoq.com/news/2025/06/aws-smithy-api-models-opensource/)
- [Spec-Driven Development with AI Coding Assistants (arXiv)](https://arxiv.org/html/2602.00180v1)
- [What Is the OpenAPI Specification? OAS 3.1 Guide (2026) - API7.ai](https://api7.ai/learning-center/api-101/openapi-specification)

---

## Lock-In: Positionierung als AI-Age-Quality-Gate (2026-05-03)

User-Entscheidung:
1. ✅ Reframing zu "Quality-Gate für OpenAPI-Specs im AI-Zeitalter" angenommen
2. ✅ AI-Aspekt sollte selbstverständlich sein — wir adressieren "händisch" / Hand-Editing **gar nicht**, weil das den Punkt verwässert
3. ✅ TypeSpec-Roundtrip raus — nicht relevant wenn der Fokus AI-generierte Specs ist

Klares Commitment. Implikationen ziehen.

### Die neue Positionierung in einem Satz

> **apiq — Your AI-generated OpenAPI specs, quality-gated.**

Tagline-Variationen für unterschiedliche Surfaces:
- **Landing-Page:** *"AI generates your OpenAPI spec in 30 seconds. apiq makes sure it's production-ready in 60."*
- **Empty-State:** *"Paste your AI-generated spec. We'll find what your AI missed."*
- **Tweet-Bait:** *"I asked Claude to write me an OpenAPI spec. Then I asked apiq if it was any good. Spoiler: 14 findings."*
- **HN-Title:** *"Show HN: apiq — Quality-gate for AI-generated OpenAPI specs"*

### Was wir explizit NICHT mehr ansprechen

Die Audience-Sprache wird **single-minded:**

❌ "Linter for engineers who write OpenAPI YAML by hand" → kommunizieren wir nicht.  
❌ "Works great with TypeSpec / Smithy / Stoplight Studio output too" → kommunizieren wir nicht.  
❌ "Compatible with auto-generated specs from FastAPI / Spring / NestJS" → kommunizieren wir nicht.

Diese User-Subsegmente werden apiq trotzdem nutzen können (das Tool ist Workflow-agnostisch — es nimmt jeden valid OpenAPI 3.x-Input). Aber sie sind **nicht der Pitch.** Marketing, Empty-State-Copy, Demo-Story, Onboarding adressieren ausschließlich den AI-Workflow.

Begründung: 
- **Schärfere Positionierung verkauft besser** als Multi-Audience-Marketing
- **AI-Wave ist der Wachstumsvektor** — TAM wird in den nächsten 12 Monaten verdoppeln
- **Selbstselektion funktioniert** — Engineers in anderen Workflows finden apiq trotzdem, wenn sie suchen ("OpenAPI quality tool")
- **Authentic AI-Positioning beats hype** — die Workflow ist real, nicht erfunden

### Wie der User-Flow jetzt aussieht

Pre-AI-Framing (alt):
```
User has OpenAPI spec → Reviews → Applies fixes → Exports
```

AI-Framing (neu):
```
1. User asks Cursor / Claude Code / Spec Kit / GPT to generate an OpenAPI spec
   ("Generate an OpenAPI 3.x spec for an order management API with...")
2. AI returns plausible-looking spec — but is it actually production-ready?
3. User pastes / uploads to apiq
4. apiq finds 14 issues, applies the 3 critical ones automatically
5. User previews live (Stoplight Elements + Prism mock)
6. User exports / commits → feeds back to AI for implementation
   OR feeds the *findings markdown* back to AI: "here's what apiq found, regenerate the spec with these fixes"
```

Das ist jetzt der Pitch. Konkret und zeitgemäß.

### Implikationen für die Build-Liste

**Was sich verstärkt:**
- **Paste-Mode** ist jetzt critical (AI-Agents output to Clipboard, nicht zu URLs) — schon im Plan, jetzt höhere Priorität
- **Markdown-Export der Findings** wird neu wichtig: User soll die Findings als strukturierten Prompt zurück an seinen AI-Agent geben können (*"regenerate with these 14 fixes"*) → ~half day extra
- **"Try It Out"-Preview** wird kritisch wertvoll, weil User die AI-Spec noch nie als rendered Doc gesehen hat
- **Capability-Gap-Generation** (i) — der Spike-Punkt von oben — wird ein Hero-Feature: *"AI agents miss endpoints. apiq spots the gaps."* Das ist genau die Pain Point der AI-Spec-Generation. Stark als Differenzierung.

**Was verliert Priorität:**
- **TypeSpec-Roundtrip:** raus. Nicht im Pre-Launch.
- **Multi-File-Upload für modulare Specs:** raus aus Pre-Launch. AI-Agents emittieren typischerweise einzelne JSON/YAML-Files, keine modularen Specs mit `$ref`-Splits.
- **GitHub-PR-Integration:** unklar. Wenn AI-Spec-Generation oft outside-of-Repo passiert (in Chat-UI), brauchen User keine PR-Flow → Post-Launch vermutlich genug.
- **CLI / GitHub Action:** weniger zentral als gedacht. AI-Workflow ist heute oft interactive (chat-driven), nicht CI-driven. CLI bleibt v1.1+.

**Was unverändert bleibt:**
- Apply-All-Critical: ✅ critical
- Stoplight Elements + Prism: ✅ critical
- Big-Spec-Spike Phase 0: ✅ critical (auch AI-generierte Specs können groß sein)
- Auth-Recovery / Sentry / Privacy/ToS: ✅ critical (Standard-Launch-Hygiene)

### Die Differentiation gegen die Big-AI-Lab-Threat schärfen

Mit AI-Age-Positionierung wird die Frage *"warum nicht einfach Claude / GPT direkt fragen?"* schärfer. Antworten:

1. **Apiq ist deterministisch + structured.** Claude/GPT geben dir Prosa-Reviews. Apiq gibt dir validierte JSON Patches mit Apply-Mechanik + Quality Score. Du klickst Apply, du siehst was sich ändert, du hast Versions-History. Das ist Engineering-Tool, kein Chat-Tool.
2. **Apiq ist preview-fähig.** Du siehst deine improved Spec live (Stoplight Elements + Prism). Im Chat müsstest du den Spec exportieren, in Swagger Editor laden, separates Mock-Tool aufsetzen.
3. **Apiq misst Qualität numerisch.** Quality Score 32→78 nach Apply ist messbar; "Claude says it looks better now" ist nicht.
4. **Apiq spotting Gaps systematisch.** Capability-Gap-Generation (i) wenn der Spike erfolgreich ist: *"your AI missed `/customers/{id}/payment_methods`"* — hochspezifisch, kein Chat-Allgemeinplatz.

Diese vier Punkte sind die Anti-Big-AI-Threat-Story. Nicht ein Moat aus Network-Effects oder Switching-Cost (haben wir nicht), sondern aus **specialized engineering tooling** vs. **general chat assistant**.

### Was ändert sich im Plan?

Vorheriger Plan (4-7 Wochen):
- Phase 0: Big-Spec-Architecture-Spike (3-5 Tage)
- Phase 1: (i) Capability-Gap Spike (5 Tage) [conditional Phase 2-3]
- Pre-Launch Engineering: Try-It-Out + Spec-Fixes + Naming + UI (7-10 Tage)
- Launch-Prep: Vercel/Supabase/Privacy etc. (3-5 Tage)

**Neuer Plan mit AI-Age-Framing (kein zusätzlicher Aufwand, gleiche Reihenfolge):**

Eigentlich ist die Build-Liste bemerkenswert ähnlich. Was sich ändert:
- **Markdown-Findings-Export** (~half day) ergänzt den Build-Plan
- **TypeSpec-Roundtrip-Polish + Multi-File-Upload + GitHub-PR raus** → -1-2 Tage
- **Marketing-Surfaces + Onboarding-Copy** auf AI-Framing trimmen (~half day)

Netto: **gleicher Aufwand, schärferes Produkt.**

### Naming-Implikation

Mit der neuen Positionierung wird das Naming kohärenter zu lösen sein:
- Wir suchen einen Namen, der "AI-Quality-Gate für API-Specs" konnotiert
- Nicht generic "API tool" — sondern spezifisch zur AI-Wave
- Beispiele zur Inspiration (nicht final): "specgate", "apiproof", "specsmith", "validspec", "speccheck", "openspec.ai"
- Naming-Workshop separat — wenn die Positionierung steht, ist das wesentlich einfacher

### Frage zurück

Mit dem klaren Commitment auf AI-Age-Positionierung:

1. Soll ich jetzt den ersten Draft der **echten Launch-PRD** (`prd-launch.md`) schreiben, basierend auf dem was wir hier diskutiert haben? Oder gibt's noch offene Punkte aus deiner ursprünglichen "weitere Dinge"-Liste, die wir in der Brainstorming-Datei zuerst abklären sollten?
2. Naming-Workshop: jetzt parallel zu PRD-Draft, oder erst nach PRD?
3. Big-Spec-Spike + Capability-Gap-Spike: starten wir die *vor* oder *nach* PRD-Finalisierung? (Vorher = empirische Daten in der PRD; nachher = klares Spike-Briefing aus PRD heraus.)

---

## Korrektur: agnostisch mit AI-implicit ist klüger als AI-only (2026-05-03)

User: *"oder sollen wir es einfach total agnostisch lassen, aber trotzdem den ai generated specs wf indirekt als first annehmen? dann schließen wir keinen nutzer aus."*

Du hast recht. Die aggressive AI-only-Positionierung von oben war zu eng — und 2026-Daten zeigen warum.

### Was die Daten *wirklich* zeigen

Aus der Recherche zu *"how engineers actually write OpenAPI specs 2026"*:

> "Most modern API frameworks generate OpenAPI specs automatically — ASP.NET, FastAPI, NestJS, and Express with swagger-jsdoc all do this. **This is the dominant workflow for new projects.**"
>
> "AI tools like Cursor and Copilot are increasingly part of the spec and code generation workflow."
>
> "Cursor is faster for the initial scaffold, generating a full FastAPI application with 12 endpoints in under 90 seconds."

Übersetzt: in 2026 gibt es **keine saubere Trennung** mehr zwischen "hand-written" und "AI-generated". Der typische Workflow ist:

```
Engineer asks Cursor / Claude / Copilot
  → AI scaffolds FastAPI / Spring / NestJS code
    → Framework auto-generates OpenAPI spec from decorators
      → Engineer iterates via more AI prompts
        → Spec evolves continuously
```

**Es ist alles AI-touched — irgendwo im Lifecycle.** Die "AI-generated vs hand-written"-Dichotomie ist 2026 ein falsches Framing. Realität:
- ~80%+ der Engineers in 2026 nutzen AI **irgendwo** im Spec-Lifecycle
- Aber viele davon nutzen es **nicht** zum direkten Schreiben der Spec — sie nutzen es zum Schreiben des Codes, der Spec emittiert
- Die Spec selbst ist oft *Framework-emittiert*, *AI-generated*, oder *AI-iterated* — alle drei vermischen sich

### Konsequenz für die Positionierung

**AI-only-Positionierung war ein strategischer Fehler.** Wenn 80%+ AI-touched sind, aber nur ~5-10% direkt-AI-generated, sprichst du mit AI-only-Marketing nur die kleine Subgruppe an. Schlechte Reichweite.

**Workflow-agnostisch mit AI-tailwind im Subtext** ist die richtige Antwort:

> **apiq — The quality gate for your OpenAPI specs. Wherever they came from.**

Tagline-Variationen:
- **Landing-Headline:** *"Your OpenAPI spec, quality-gated. Find what your framework, your AI, or you missed — and fix it in one click."*
- **Sub-Headline:** *"Whether your spec was hand-edited, framework-emitted (FastAPI / Spring / NestJS), or AI-generated (Cursor / Claude / GPT) — apiq reviews, suggests fixes, and lets you preview the result."*
- **Tweet-Bait:** *"I asked Claude to scaffold an API. FastAPI emitted the OpenAPI spec. apiq found 14 things wrong with it."* (AI-Wave bleibt im Marketing, ohne andere Workflows zu exkludieren.)
- **HN-Title:** *"Show HN: apiq — Find what's wrong with your OpenAPI spec"* (Generic, funktioniert für jede Audience.)

### Was bleibt unverändert vom AI-Lock-in?

- Apply-All-Critical, Try-It-Out (Stoplight Elements + Prism), Big-Spec-Spike, Capability-Gap-Spike — alles relevant, **alles workflow-agnostisch**
- **Markdown-Findings-Export** für AI-Roundtrip ist immer noch wertvoll — aber jetzt als *eines von mehreren* Output-Formaten, nicht das Primary
- Die 80% des Build-Plans ändern sich nicht; nur Marketing/Onboarding-Sprache wird breiter

### Was ändert sich konkret?

| Surface | AI-only (alt) | Agnostisch mit AI-implicit (neu) |
|---|---|---|
| Empty-State | "Paste your AI-generated spec" | "Paste your spec — whether you wrote it, your framework generated it, or your AI did" |
| Marketing-Hero-Story | exklusiv "Cursor/Claude generated → apiq fixes" | AI-Workflow als Demo-Hook, aber Landing zeigt drei plausible Origins |
| TypeSpec-Roundtrip | raus | bleibt v0.2-Backlog (nicht beworben, nicht abgelehnt) |
| Capability-Gap-Generation | "AI agents miss endpoints" | "Frameworks emit minimal specs / AI generates incomplete specs / hand-written specs drift — apiq spots gaps" |

Das ist ein deutlich breiterer TAM bei minimal anderem Build. Smart.

### Wettbewerbs-Update: OpenSpec von Fission-AI

Du hast OpenSpec auf GitHub gefunden — habe nachgeforscht. **Es ist ein adjacent-but-not-competing Produkt**, kein OpenAPI-Spec von Fission-AI selbst.

Was OpenSpec ist:
- **Spec-Driven Development Framework für AI Coding Assistants**
- npm-Paket: `npm install -g @fission-ai/openspec`
- Domain: [openspec.dev](https://openspec.dev/)
- Workflow: 3 Schritte — *Proposal* (markdown spec) → *Apply* (AI codes per spec) → *Archive*
- Multi-Tool-Support: 20+ AI assistants (Claude Code, Cursor, GitHub Copilot, ...)
- Positioning: "lightweight spec layer so engineers agree on what to build before code"

**Verhältnis zu apiq:**
- OpenSpec sitzt am **Anfang** des Dev-Cycles: "schreib eine Spec, lass AI danach codieren"
- apiq sitzt am **Ende** des Dev-Cycles: "review die Spec (egal woher), fix Issues, ship sauber"
- **Sie sind komplementär**, nicht direkt-kompetierend
- Möglicher Co-Use: "Use OpenSpec to drive AI development, use apiq to quality-gate the resulting OpenAPI spec"

**Aber:** der **Name `openspec` ist verbrannt** — wir können nicht "OpenSpec" oder "openspec.ai" oder ähnlich heißen. Naming-Suche muss um diese Marke herum laufen.

### speccheck.ai als Naming-Idee

Search ergab keine direkten Treffer für "speccheck.ai" als bestehendes Produkt — der Name könnte verfügbar sein. Aber:
- **`speccheck`** als Begriff existiert in nicht-API-Kontexten (z. B. spec-check für Verträge, für Bauwesen) → keine starke API-Konnotation
- **`.ai`** als TLD ist 2026 immer noch teurer als `.com`/`.dev` (~$60-100/Jahr)
- **Domain-Verfügbarkeit muss geprüft werden** — Search ist nicht zuverlässig dafür; Domain-Registrar checken

Andere Namens-Richtungen, die zur agnostischen Positionierung passen:
- **specgate** — nahe am "Quality Gate"-Konzept
- **specsmith** — implies craftsmanship
- **specsense** — Quality-Wahrnehmung
- **specreview** — direkt was es macht
- **apiqual** / **apiq2** — wenn man vom alten Namen sanft wegkommen will
- **openapi-doctor** — explicit, aber lang
- **specreviewer.ai** — beschreibend, etwas generisch

Naming-Workshop ist eigene Übung — sollten wir mit klarer Positionierung machen, nicht spekulativ vorab.

### Refined Verdict

**Du hast recht: agnostisch mit AI-implicit ist die richtige Balance.** Schließt niemanden aus, reitet trotzdem die AI-Wave im Marketing, und die Realität (jeder Workflow ist 2026 AI-touched) macht "AI-only-Positionierung" sowieso künstlich.

Konkret für die Launch-PRD:

- **Primary Positioning:** *"The quality gate for your OpenAPI specs. Wherever they came from."*
- **Implicit AI-tailwind:** Demo-Story + Marketing-Hooks zentriert auf AI-Use-Case (HN-friendly, time-relevant), aber Landing-Page + Onboarding agnostisch.
- **Audience-TAM:** maximalisiert — alle Workflows die OpenAPI emittieren, ~80-90% des API-Marktes
- **Differentiation gegen OpenSpec/Spectral/etc.:** klar (apiq = quality-gate at end of cycle, OpenSpec = spec-as-driver at start, Spectral = rule-linter without LLM-narration)

### Frage zurück (final)

1. Bestätigst du die agnostisch-mit-AI-implicit-Positionierung als finalen Stand?
2. PRD-Draft jetzt schreiben oder noch ein Punkt offen aus deiner ursprünglichen "weitere Dinge"-Liste?
3. Naming-Workshop nach PRD oder parallel?

Sources:
- [OpenSpec by Fission-AI (GitHub)](https://github.com/Fission-AI/OpenSpec)
- [OpenSpec — A lightweight spec-driven framework](https://openspec.dev/)
- [GitHub Copilot vs Cursor 2026 Review](https://tech-insider.org/github-copilot-vs-cursor-2026/)
- [Automate API Workflow with Bruno and Cursor AI](https://blog.usebruno.com/how-to-automate-your-api-workflow-with-bruno-and-cursor-ai)

---

## Synthesis & Self-Check: was wir jetzt klüger machen — und wo wir noch besser sein können (2026-05-03)

User: *"hast du alles festgehalten was wir in den letzten prompts besprochen haben? welche neuausrichtung ergibt sich denn, jetzt da wir einen viel klareren durchblick haben? können wir noch cleverer bzw besser sein als ursprünglich gedacht? evaluiere kritisch."*

Fair-and-honest pass. Erst was wir schon haben, dann was noch fehlt.

### Tagline-Tightening (Q1)

Du hast recht: *"The quality gate for your OpenAPI specs."* — punkt. Ohne *"Wherever they came from"*. Begründung:
- *"Wherever they came from"* ist defensiv, nicht selbstbewusst — beantwortet eine Frage, die niemand gestellt hat
- Kürzere Tagline = stärkeres Brand
- Engineers mögen Direktheit, kein Marketing-Subtext

**Final:** *"apiq — The quality gate for your OpenAPI specs."*

### Was sich von der Original-PRD geändert hat (Bilanz)

| Dimension | Original PRD (`prd.md`) | Stand nach Brainstorming |
|---|---|---|
| Positioning | *"Design partner, not rule checker"* — fuzzy | *"Quality gate for your OpenAPI specs"* — sharp |
| Tagline | *"Understand your APIs like the LLM does — and improve them in one click."* | *"The quality gate for your OpenAPI specs."* |
| Audience | Backend / API-Platform-Engineers an Startups | Jeder OpenAPI-User, agnostisch zu Workflow-Origin |
| Audience-TAM-Schätzung | ~10-30k addressable | ~80-90% des API-Marktes |
| AI-Aware? | Nicht explicit | Implicit-tailwind (im Marketing, nicht im Pitch) |
| Killer-Feature | LLM-Narration + Apply-Loop | + Apply-All-Critical + Live-Preview |
| Try-It-Out | Nicht vorhanden | Stoplight Elements + Prism (Pre-Launch) |
| Capability-Gap-Generation | v0.2 Landscape (vague) | Klar definiert mit Erfolgs-Wahrscheinlichkeit + Spike-Plan |
| Workflow-Source | Implicit Spec-First | Agnostisch — Hand / Framework / AI / TypeSpec |
| Anti-Big-AI-Threat-Story | Nicht artikuliert | 4 Punkte (deterministisch / preview-fähig / Quality-Score / systematic Gap-Detection) |

**Verdict: deutlich klarer als Original.** Aber auch ehrlich: das war Brainstorming-Arbeit, nicht zauberhafte Insights — die meisten Verbesserungen sind klassisches *Re-Scoping* mit Markt-Daten.

### Wo wir noch *cleverer* sein können — kritische Evaluation

Hier ist was noch nicht voll ausgeschöpft ist. Ehrlich, nicht enthusiastisch.

#### (A) MCP Server — high-leverage, low effort

**Was:** [Model Context Protocol](https://modelcontextprotocol.io/) ist Anthropics 2024-Standard, mit dem AI-Agents externe Tools als first-class-Citizens nutzen. Wenn apiq einen MCP-Server bereitstellt, dann:

- Claude Code kann apiq direkt während Code-Generation aufrufen: *"After generating the OpenAPI spec, run apiq quality-check"*
- Cursor (mit MCP-Support) integriert nahtlos
- Custom AI-Agents können apiq als Sub-Tool nutzen
- Apiq distribuiert sich **in die AI-Tools, die unsere User schon nutzen** — passt perfekt zur agnostisch-mit-AI-tailwind Positionierung

**Aufwand:** ~1-2 Tage für einen Basic-MCP-Server, der die existierenden Server-Actions als MCP-Tools exposed (`analyze_spec`, `apply_critical`, `get_findings`).

**Wert:** sehr hoch. Das ist eine echte Distribution-Strategie statt Marketing-Hoping. Engineers, die Claude-Code/Cursor nutzen, würden apiq als "tool that just appears in my AI session" entdecken — viel niedrigere Adoption-Hürde als "go to website, sign up".

**Strategischer Twist:** das ist auch unsere Antwort auf die Big-AI-Lab-Threat. Statt zu konkurrieren mit Anthropic / OpenAI / Google, **integrieren wir uns in deren Workflows**. Wenn Claude einen apiq-MCP-Tool-Call macht, sind wir Teil von Claudes Stack, nicht Konkurrent.

**Empfehlung:** **Pre-Launch must-have.** 2 Tage Engineering, riesiger Hebel.

#### (B) CLI als primäre Distribution-Channel — nicht nur Convenience

**Was wir vorher dachten:** CLI = "Convenience für Engineers, die das Web-UI nicht wollen" → Post-Launch.

**Was 2026 stattdessen wahr ist:** CLI ist die *primäre* Integration für AI-Tools. `npx apiq check ./openapi.yaml` ist:
- Aufrufbar von Cursor / Claude-Code-Sessions als Subprocess
- Distributable via npm (kostenlos)
- Composable mit anderen CLI-Tools (z. B. `openapi-generator` Pipeline)
- Suchbar via "openapi quality cli" — eigene SEO-Surface
- Listable auf [openapi.tools](https://openapi.tools/) und awesome-openapi

**Aufwand:** ~2 Tage für einen Basic-CLI mit `apiq check <spec>` + `apiq apply <spec> --critical-only` + JSON-Output für AI-Konsumption.

**Wert:** mittel-hoch. Adressiert den ~30% der User, die nie ein Web-UI öffnen würden, plus die AI-Workflow-Integration (überlappt mit MCP).

**Empfehlung:** **Pre-Launch should-have.** Nicht als Critical, aber als starkes Komplement zum MCP-Server. Nice synergy: CLI + MCP-Server teilen 80% der Logik.

#### (C) No-Signup-Demo + Public-Share-Link + Quality-Score-public

**Was:** drei zusammenhängende Mechanismen, die alle aus der "Round 5"-Diskussion oben hervorgehen, aber bisher nicht zusammen gedacht wurden:

1. **Anonymous Demo** — `/try` Route ohne Signup, paste spec → siehe Analysis. Zwingt zur Conversion erst beim Apply.
2. **Public-Share-Link** — User klickt "share analysis", bekommt `/share/<token>` URL, andere können die Analyse sehen ohne Account.
3. **Quality-Score viral** — Public-Share zeigt prominent den Score. *"GitHub's API: apiq Quality Score 73/100"* ist tweet-bait + memetic.

Diese drei zusammen schaffen einen **viral loop ohne Engineering-Mehrarbeit über das hinaus, was wir schon geplant haben:**

- User analyzes spec → likes the score reveal
- Shares public link → friends see *"oh, my company's API would also score X"*
- Friends click → land on apiq → conversion

**Aufwand:** ~2-3 Tage zusammen (anonymous demo + share-link + score-display). Schon im Plan, aber nicht als zusammenhängendes "viral loop"-Feature gerahmt.

**Wert:** hoch. Distribution ohne Marketing-Spend.

**Empfehlung:** **Pre-Launch must-have.** Diese drei zusammen explicit als "viral loop" denken, nicht als drei separate Features.

#### (D) Live-Preview als der "Magic Moment"

**Was wir vorher dachten:** Stoplight Elements + Prism = "nice Try-It-Out feature".

**Was wir aufwerten könnten:** das ist *der* Differentiator gegen Spectral et al. Im Rest der Wettbewerbslandschaft (`openapi.tools`-Liste hat ~60 Linter, Editor, Mock-Tools) ist nichts integriert. apiq's Loop "analyze → apply → see-it-running-live" ist 2026 einzigartig.

Marketing-Implikation: das **Hero-Demo-Video** auf der Landing-Page sollte nicht *Apply-Click → Spec-Diff* zeigen — es sollte **Apply-Click → Live-Mock-Server-Response** zeigen. Das ist viscerally beeindruckend.

**Aufwand:** kein zusätzliches Engineering — schon im Plan. Aber **Marketing-Framing ändern**: Live-Preview ist der Star, nicht ein Subtab.

**Empfehlung:** Kein Build-Change, aber **Re-Prioritisierung in Marketing/Demo/Onboarding-Reihenfolge**. Im Empty-State / Onboarding-Tour: Apply → Live-Preview als zentrale Demo, nicht Apply → Findings.

#### (E) Privacy-Architecture — könnte Differentiator werden

**Bisher übersehen:** OpenAPI-Specs enthalten oft **interne Endpoints, Auth-Schemas, sensible Metadaten**. Aktuell senden wir den ganzen Spec an OpenRouter / Anthropic. Das ist **legitimer Data-Privacy-Concern** für jeden seriösen Engineering-Team.

Was wir tun könnten — und sollten — vor dem Launch:

1. **Klare Privacy-Promise:** "We never log spec contents. Analysis is ephemeral. Spec data is encrypted at rest in your workspace."
2. **Optional: Self-Hosted Mode** — Docker-Image, in dem User ihre eigene OpenRouter-Key nutzen, kein Cloud-Persist. Würde Enterprise-Audience erschließen.
3. **Optional: BYOK (Bring Your Own Key)** — User-eigene OpenRouter-Account, apiq als Web-UI auf top.

**Privacy-Promise** kostet ~1 Tag (Privacy-Page-Content + Backend-Audit + Disclosure-Page).
**Self-Hosted-Mode** ist ~1 Woche extra.
**BYOK** ist ~3 Tage.

**Empfehlung:** Privacy-Promise ist **must-have** (sowieso für Privacy/ToS-Page nötig). Self-Hosted und BYOK sind v1.1+ — können aber ein einfacher Differentiator-Pitch sein gegen "send to Anthropic via apiq's account."

#### (F) Quality-Score als Brand-Asset (analog zum Credit-Score)

**Was bisher unterschätzt:** der Quality-Score (0-100) ist ein **Brand-Asset, das wir kaum nutzen**. Andere Tools (Spectral et al.) haben keinen Score. Wir könnten:

- **Public Spec Gallery** mit Quality-Score-Ranking (*"Highest-rated public APIs"*) — direkt aus Round 5
- **Score-Badges für GitHub-Repos** — `<img src="https://apiq.dev/badge/<workspace>/<spec>" />` zeigt den aktuellen Score, embed-ready in README. Setzt apiq direkt ins Engineer-Lifeblood (GitHub-Repo). Free Distribution.
- **"Improvement-Trend"** — Score über Zeit, "your spec went from 32 to 78 in 3 weeks." Visuelles Story-Element.

**Aufwand für Score-Badges:** ~1 Tag (SVG-Endpoint + Cache-Layer + Embedding-Doc).

**Wert:** hoch. Score-Badges sind Self-Marketing — jeder Repo, der das Badge embeded, advertised apiq passiv. Wie Codecov / Coveralls für API-Quality.

**Empfehlung:** **Score-Badges sind Pre-Launch should-have.** 1 Tag, hochlevel-Distribution-Mechanism.

### Triage-Tabelle: was kommt rein, was nicht

| Idee | Aufwand | Wert | Pre/Post-Launch |
|---|---|---|---|
| Tagline-Tightening | 0 (Marketing) | hoch | **Pre** (Done) |
| MCP-Server | 1-2 Tage | sehr hoch | **Pre must-have** (NEU) |
| CLI-Distribution | 2 Tage | mittel-hoch | **Pre should-have** (NEU) |
| No-Signup + Share-Link + Score-public (viral loop) | 2-3 Tage | hoch | **Pre must-have** (gehoben aus Round 5) |
| Live-Preview als Marketing-Star | 0 (Re-Framing) | mittel | **Pre Re-Prioritisierung** |
| Privacy-Promise + Disclosure | 1 Tag | hoch (Pflicht) | **Pre must-have** |
| Score-Badges (GitHub-embed) | 1 Tag | hoch | **Pre should-have** (NEU) |
| Self-Hosted Mode | 1 Woche | mittel | Post |
| BYOK | 3 Tage | mittel | Post |
| Capability-Gap-Generation Spike | 5 Tage | hoch (wenn klappt) | conditional Pre (Spike-staged) |

### Aktualisierter Aufwand-Snapshot

Nach Synthesis stehen wir bei:

**Spike-Phase (~5-12 Tage):**
- Big-Spec-Architecture-Spike: 3-5 Tage
- Capability-Gap-Generation Spike: 5 Tage (conditional)

**Pre-Launch Engineering (~14-19 Tage):**
- 3 Pre-Launch Spec-Fixes (Re-Validate / Re-Bundle / Cycle-Marker): 1-2 Tage
- Apply-All-Critical: 1 Tag
- Stoplight Elements + Prism: 4-5 Tage
- Paste/Upload-Mode: half day
- Markdown-Findings-Export: half day
- **MCP-Server: 1-2 Tage (NEU)**
- **CLI: 2 Tage (NEU)**
- **No-Signup-Demo + Share-Link + Score-public: 2-3 Tage**
- **Score-Badges: 1 Tag (NEU)**
- Privacy-Promise + Page-Content: 1 Tag
- Auth-Recovery (Email-Verify + Forgot-PW): 2-3 Tage
- Sentry-Integration: 2 Stunden
- Naming + UI-Redesign: ~2-3 Tage UI + parallel zur Naming-Arbeit
- Vercel/Supabase-Prod-Setup + DNS: 2 Tage

**Total: ~5-7 Wochen Kalenderzeit** je nach Spike-Conditional-Phasen und Parallelisierung.

Das ist mehr als die ursprünglichen 3 Wochen — aber das Produkt ist **substantially better positioniert** für einen Public-Launch der wirklich zünden kann.

### Naming-Evaluation (Q3)

Du hast vorgeschlagen: **aiapi**, **aipi**, **openapi-doctor**, **api-doctor**, **apicheck**.

Mein kritisches Take pro Vorschlag:

**aiapi / aipi** — schwach. *"a-i-a-p-i"* ist schwer zu sagen, schwer zu spellen, gefährlich nahe an "API" selbst (verwechslungsrisiko in Search). Auch: das `ai` im Namen widerspricht der "agnostisch mit AI-implicit"-Positionierung — wenn der Name selbst AI im Vordergrund hat, predigen wir AI, was wir gerade entschieden haben nicht zu tun. **Nicht empfohlen.**

**openapi-doctor** — beschreibend, aber:
- Lang (14 Zeichen)
- Doctor-Metapher ist überstrapaziert (db-doctor, json-doctor, etc. existieren)
- Spelling-Friction: "openapi" mit Bindestrich oder ohne?
- Domain `openapi-doctor.dev` oder `openapidoctor.com` — erforderlich Check
- *"Was tut das?"* aus dem Namen klar → gut
- Kann limitierend wirken, wenn apiq eines Tages nicht-OpenAPI-Specs (AsyncAPI, GraphQL) addressiert

**api-doctor** — etwas besser:
- Kürzer (10 Zeichen)
- Breitere Scope (nicht nur OpenAPI)
- Aber: "Doctor"-Metapher ist immer noch zahnlos

**apicheck** — bester der vier:
- Kurz (8 Zeichen), verb-form ("check")
- Klar was es tut
- Wenig Brand-Friction
- Aber: zu generisch? *"apicheck"* ist quasi ein Common-Noun, nicht ein Brand. Trademark-Suche kritisch — wahrscheinlich existiert irgendwer mit dem Namen schon.

**Meine kritischen Picks** (nicht zwingend deine):

- **specgate** — Quality-Gate-Konzept-aligned, technisch klingend, kurz (8 Zeichen), brandable. Domain-Status zu prüfen, aber `specgate.dev` / `specgate.io` realistisch erreichbar.
- **specgrade** — Quality-Score-aligned. *"Get your spec graded."* Kurz, klar, brandable. Möglicherweise verfügbar.
- **specprime** — kürzer noch, aber Bedeutung weniger klar.
- **goodspec** — sympathisch, klein, evtl. zu casual für API-Engineering-Audience.
- **apiqual** — wenn du "vom Vorgänger her ableiten" willst aber sanft wechseln. Domain wahrscheinlich verfügbar.

**Ranking-Empfehlung:**

1. **specgate** — wenn du auf "Quality Gate" als Brand-Anchor setzen willst
2. **apicheck** — wenn du auf Direktheit + Cost-of-Confusion-Tolerance setzen willst (Trademark-Risiko)
3. **specgrade** — wenn du auf Quality-Score als Brand-Anchor setzen willst
4. **api-doctor** — wenn du auf breitere Scope setzen willst (AsyncAPI später)

**Kritischer Punkt:** alle Namensentscheidungen brauchen:
- Trademark-Search bei [USPTO](https://www.uspto.gov/) und [EUIPO](https://euipo.europa.eu/)
- Domain-Verfügbarkeits-Check beim Registrar
- GitHub-Org-Name + npm-Package-Name-Verfügbarkeits-Check

Das ist ~1 Tag Naming-Workshop, eigene Übung — sollte parallel zur PRD-Arbeit laufen, nicht spekulativ vorab finalisieren.

### Frage zurück (final, hoffe ich)

1. Tagline-Tightening: ✅ confirmed.
2. **Bestätigst du die Triage-Tabelle?** Insbesondere: MCP-Server + CLI + Score-Badges Pre-Launch reinnehmen (5-6 Tage extra)?
3. **Naming**: Kommt als Workshop nach PRD-Draft? Oder willst du jetzt eine engere Shortlist (3-5 Namen mit Domain/Trademark-Status)?
4. **Bereit für PRD-Draft**, oder noch ein Punkt offen, den ich missed habe?
