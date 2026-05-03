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
