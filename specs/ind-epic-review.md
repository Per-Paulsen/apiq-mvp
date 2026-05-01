# Individual Epic Review — 2026-05-01

## Summary

- **Mode:** in-dev (Epic 00 results exist)
- **Specs reviewed:** 01, 02, 03, 04, 05, 06, 07, 08 (all 8)
- **Specs skipped (completed epics):** 00 (research-spike has results)
- **Specs skipped (already refined):** none
- **Specs modified:** all 8
- **Specs clean:** none
- **Total findings:** 54 (49 structural applied, 5 NEEDS CONFIRMATION → Phase 2)
- **Triggering inputs:**
  - `specs/00-research-spike-results.md` (new — primary trigger)
  - `prd-decisions.md` (new — secondary trigger for UI epics)

---

## 01 — Project Setup

### Findings

- **Lint zero-warnings target unrealistic for shadcn-generated code** (Untestable AC)
  - **Change:** AC #4 reworded — zero errors required, warnings acceptable on shadcn-generated files.
- **AC #9 used `bg-blue-500` violating prd-decisions palette** (Inconsistent domain language)
  - **Change:** AC #9 reworded to use `bg-violet-500` or `text-zinc-500`.
- **shadcn `Button` install needed but not in scope** (Hidden scope creep)
  - **Change:** Scope bullet 14 extended to include `npx shadcn add button` and rendering it on placeholder page.
- `**OPENROUTER_MODEL` env var lacks v0.1 model context** (Inconsistent domain language)
  - **Change:** Scope bullet for `.env.example` extended with comment about Sonnet for single-call analysis.
- **No AC for Node `engines` pin** (Missing AC)
  - **Change:** New AC #17 added pinning `engines.node >=22.x`. Resolved Open Question #1 partially.
- `**base-ui` listed in tech-stack but not justified by prd-decisions** (Ungrounded assumption)
  - **NEEDS CONFIRMATION** — added as open question on the spec.

### Changes applied

- AC #4, #9: rewritten
- Scope bullet 14 (shadcn init): extended with Button install
- Scope bullet for `.env.example`: extended with model comment
- New AC #17 for Node engines
- New open question (NEEDS CONFIRMATION) for base-ui
- Open question on Node version: recommendation pinned

---

## 02 — Auth + Workspace

### Findings

- `**(auth)/layout.tsx` styling unspecified despite prd-decisions defining it** (prd-decisions impact)
  - **Change:** AC #11 extended to require centered card container per prd-decisions §"Layout".
- **Placeholder `/specs` ownership unclear** (Ungrounded assumption)
  - **Change:** Scope bullet 8 marked as "temporary" with note that Epic 07 replaces it.
- **No AC verifies middleware Edge-safe import graph** (Missing AC)
  - **Change:** New AC #13 verifying `middleware.ts` doesn't import bcrypt/Prisma transitively.
- `**getRequiredSession()` shape unclear under UserWorkspace join** (Untestable AC)
  - **Change:** Domain term extended with v0.1 single-row query semantics.
- `**UserWorkspace` join+role vs flat `User.workspaceId` FK** (Hidden scope creep)
  - **NEEDS CONFIRMATION** — added as open question.
- **Signup AC #4 enables account-enumeration despite Login AC #6 hardening** (Inconsistent domain language)
  - **NEEDS CONFIRMATION** — added as open question.

### Changes applied

- Scope bullet 8: "temporary" annotation + Epic 07 handover note
- AC #11: extended with `(auth)/layout.tsx` styling
- New AC #13 for Edge-runtime verification
- Domain term `getRequiredSession()`: extended with v0.1 semantics
- Two new open questions (NEEDS CONFIRMATION) for UserWorkspace shape and signup-enumeration policy

---

## 03 — Spec Ingestion (URL-only)

### Findings

- **Missing 1 MB JSON spec-size soft-warn threshold** (Epic 00 results impact)
  - **Change:** Scope step 8 extended with size threshold; banner copy added; AC #12 expanded to include `warningReasons` field; new AC #12a for the size-trip case.
- **Cycle-handling reference implementation not pointed to** (Reference implementation pointer)
  - **Change:** Scope step 9 extended with explicit `{"$ref":"#cyclic"}` marker shape and reference to `scripts/spike/stringify-spec.ts`.
- **External `$ref` rejection unverified by spike** (Ungrounded assumption)
  - **Change:** New open question added documenting need for explicit Vitest coverage.
- **Open question on cyclical refs now resolvable** (Open questions resolvable)
  - **Change:** Open question marked resolved with reference to spike findings.

### Changes applied

- Scope step 8: 1 MB soft-warn + banner copy
- Scope step 9: cycle marker shape + `cycleStripSpec` reference
- AC #12: extended with `warningReasons[]`
- New AC #12a for size-trip case
- Open question on swagger-parser cycles: resolved
- New open question on external $ref test coverage

---

## 04 — LLM Pipeline

### Findings

- **Spike-to-runtime file mapping not concrete** (Reference implementation pointer / Epic 00 impact)
  - **Change:** New top-level Scope bullet block listing exact source→destination paths for `prompts/v4.ts`, `schema.ts`, `stringify-spec.ts`, `openrouter.ts`, `validate-patches.ts`.
- `**LLMCall.prompt` storage at full prompt+spec body unsustainable** (Epic 00 impact)
  - **Change:** Prisma model description extended with structured Json shape (hash + metadata, NOT full body); Open Question #2 resolved.
- **OpenRouter retry policy duplicated from spike** (Reference implementation pointer)
  - **Change:** Scope bullet rewritten to "port `scripts/spike/openrouter.ts` verbatim, then …" with subtleties pinned.
- **Missing AC for cycle-marker handling** (Missing AC)
  - **Change:** New AC #7a for recursive-schema fixture test.
- **Open Question on `info.title`/`info.description` grounding now resolved** (Open questions resolvable)
  - **Change:** Open question marked resolved with reference to `buildUserPrompt`.
- **Pass-criterion 2 dependency on Epic 06 stale-handling not surfaced** (Hidden scope creep)
  - **Change:** New domain term added explaining residual-hallucination is expected and Epic 06 is the gate.
- **50/24h LLM-call cap may be too generous** (Epic 00 impact)
  - **NEEDS CONFIRMATION** — added as open question with 4 options.

### Changes applied

- New Scope bullets: spike-to-runtime file mapping
- `LLMCall` schema: extended prompt-Json shape
- OpenRouter scope bullet: rewritten as "port verbatim"
- New AC #7a for cycle-handling
- New domain term for hallucination residual
- Open Questions: 2 resolved (prompt source, info.title), 1 added (NEEDS CONFIRMATION on call cap)
- Daily-limit scope step: marked TENTATIVE pending decision

---

## 05 — Spec Detail Screen

### Findings

- **ACs reference visual elements without anchoring to prd-decisions tokens** (prd-decisions impact)
  - **Change:** AC #1, #4 anchored with explicit colour mappings + section references.
- **Diff library open question now resolved by prd-decisions** (Open questions resolvable)
  - **Change:** Open Question §1 resolved; AC #5 anchored to `react-diff-viewer-continued` with theming.
- **Monospace typography for paths/JSON not in ACs** (prd-decisions impact)
  - **Change:** AC #6 (Patch ops table) and AC #10 (endpoint list) extended with monospace requirement.
- **AC #11 "highlights/scrolls" untestable** (Untestable AC)
  - **Change:** AC #11 sharpened to `ring-2 ring-violet-500` outline; Open Question §3 resolved.
- **Card density unspecified for findings** (prd-decisions impact)
  - **Change:** Findings-list scope bullet anchored to `p-4` compact density per prd-decisions.
- **Retry analysis button styling vague** (prd-decisions impact)
  - **Change:** AC #13 anchored to primary violet button per prd-decisions.
- **Filter persistence open question** (Open questions resolvable)
  - **NEEDS CONFIRMATION** — kept as open question with recommendation toward URL query.

### Changes applied

- AC #1, #4, #5, #6, #10, #11, #13: anchored to prd-decisions tokens
- Findings-list scope bullet: compact density anchored
- Open Questions: 2 resolved (diff library, highlight behaviour), 1 marked NEEDS CONFIRMATION (filter persistence)

---

## 06 — Patch Apply

### Findings

- **Patch validation references bare `fast-json-patch.validate`, missing spike's bug fixes** (Epic 00 impact / Reference implementation pointer)
  - **Change:** Scope step 5 rewritten to use `validatePatchOps` with explicit cycle/move/copy semantics.
- **Stale-flow UX not specified — risk of error toast on hallucinated patch** (Epic 00 impact)
  - **Change:** New scope bullet for UI behaviour on `patch_stale`; new AC #8a for no-error-toast assertion.
- **Validator file shared with Epic 04, not duplicated** (Hidden scope creep)
  - **Change:** New top-level Scope bullet "Shared analysis-library imports" pointing to Epic 04 ownership.
- `**applyPatch` step uses unspecified deep-clone strategy** (Ungrounded assumption)
  - **Change:** Scope step 6 pinned to `structuredClone` with rationale on cycle markers.
- **AC #2 doesn't enumerate hallucination shapes** (Missing AC)
  - **Change:** AC #2 split into 2a-2d covering each hallucination shape including the move/copy bug-fix case.
- **Domain term `stale` doesn't ground in Epic 00** (Inconsistent domain language)
  - **Change:** Domain term `stale (status)` extended with explicit reference to spike validator and Epic 04 dependency.

### Changes applied

- New top-level Scope bullet: shared analysis-library imports
- Scope step 5: rewritten with `validatePatchOps` semantics
- Scope step 6: `structuredClone` pinned with cycle rationale
- New scope bullet for stale-flow UI
- AC #2: split into 2a-2d
- New AC #8a for no-error-toast
- Domain term `stale`: extended with Epic 04 dependency

---

## 07 — Specs List + Settings

### Findings

- **Quality-score badge thresholds restated locally with vocabulary mismatch** (prd-decisions impact / Inconsistent domain language)
  - **Change:** Specs List scope bullet + AC #3 anchored to prd-decisions (emerald/amber/red instead of green/yellow/red).
- **Status pill colours not anchored** (prd-decisions impact)
  - **Change:** AC #4 anchored to prd-decisions §"Components" Status-Pills.
- **Empty state visual treatment not anchored** (prd-decisions impact / Hidden scope creep)
  - **Change:** Empty state scope bullet anchored to prd-decisions; "no illustration" requirement made explicit.
- **Sample spec ID open question now resolvable** (Open questions resolvable / Epic 00 impact)
  - **Change:** Open Question §1 resolved; PagerDuty explicitly excluded from production "Try with a sample" CTA per Epic 00 license note.
- **Table density not anchored** (prd-decisions impact)
  - **Change:** Specs List Layout bullet anchored to prd-decisions §"Components" Tables.
- **Sidebar collapse open question resolvable** (Open questions resolvable)
  - **Change:** Open Question §4 resolved with reference to prd-decisions §"Layout".
- **"Theming / dark mode" out-of-scope conflicts with prd-decisions mandate** (Inconsistent domain language)
  - **Change:** Removed from out-of-scope; new "Appearance" Settings section added with theme toggle.
- **Domain term "Status pill" duplicates prd-decisions definition** (Inconsistent domain language)
  - **Change:** Domain term extended to defer to prd-decisions for visual tokens.

### Changes applied

- Specs List Layout bullet: anchored to prd-decisions Tables
- Quality score column + AC #3: emerald/amber/red vocabulary aligned
- AC #4: anchored to prd-decisions Status-Pills
- Empty state bullet: anchored, "no illustration" explicit
- Settings sections: added "Appearance" with theme toggle
- Out-of-scope: removed dark-mode line
- Domain term Status pill: extended
- Open Questions: 2 resolved (sample IDs, sidebar collapse)

---

## 08 — Export + Polish

### Findings

- **Spec preamble doesn't point to prd-decisions** (prd-decisions impact)
  - **Change:** Top-of-file preamble extended with prd-decisions reference.
- **Toast positioning open question resolvable** (Open questions resolvable)
  - **Change:** Open Question §5 resolved; Scope §"Toast system" bullet rewritten with prd-decisions tokens; AC #12 anchored.
- **Mobile fallback breakpoint open question resolvable** (Open questions resolvable)
  - **Change:** Open Question §4 resolved with reference to prd-decisions §"Layout".
- **Skeleton/error/404 visual treatment unspecified** (prd-decisions impact)
  - **Change:** AC #7, #8, #9 anchored to prd-decisions Cards + "no illustrations" rule.
- **Toast system scope creep into Epic 06 territory** (Hidden scope creep)
  - **Change:** Scope §"Toast system" rewritten to clarify Epic 08 ships infrastructure, per-action toasts owned by their epics. AC #12 reworded to test infrastructure, not specific Apply toast.
- **YAML library open question resolvable** (Open questions resolvable)
  - **Change:** Open Question §1 resolved (already aligned in scope).
- **AC #1 "visually default" untestable** (Untestable AC)
  - **Change:** AC #1 sharpened to primary-violet vs ghost-secondary per prd-decisions.
- **Mobile-fallback banner colour/icon unspecified** (prd-decisions impact)
  - **Change:** AC #11 anchored to muted (zinc) colour and lucide-react `X` icon.

### Changes applied

- Preamble: extended with prd-decisions reference
- AC #1, #7, #8, #9, #11, #12: anchored to prd-decisions tokens
- Scope §"Toast system": clarified ownership
- Open Questions: 3 resolved (YAML, mobile breakpoint, toast positioning)

---

## NEEDS CONFIRMATION items (5 total → Phase 2 Brainstorming)

1. **Epic 01 — `base-ui` usage** — install/configure or implicit?
2. **Epic 02 — `UserWorkspace` shape** — flat FK vs join+role?
3. **Epic 02 — Signup-enumeration policy** — accept clear UX trade-off or harden?
4. **Epic 04 — Daily LLM-call cap** — 50/24h vs 10/24h vs per-spec-size buckets vs dollar cap?
5. **Epic 05 — Filter persistence** — URL query vs client state?

---

## Brainstorming (Phase 2)

> Append-only. Bitte direkt unter jede Frage antworten — "ack [empfehlung]" / "Variante X" / Freitext. Ich wende die Entscheidungen anschließend in Phase 3 an.

### Q1 — Epic 01: `base-ui` Verwendung

`tech-stack.md` listet `shadcn/ui + base-ui + lucide-react` als UI-Stack. `prd-decisions.md` und alle UI-Epic-Specs nutzen aber nur shadcn-Komponenten (Card, Button, Table, Form, Input, Tooltip, Toaster, Sidebar). `base-ui` wird nirgends explizit eingesetzt.

**Optionen:**

- (a) `**base-ui` aus Tech-Stack entfernen.** Wir nutzen es nicht; shadcn/ui hat seine eigenen Primitive (basiert intern auf Radix). Saubere Stack-Hygiene.
- (b) `**base-ui` installieren, ohne expliziten Use-Case.** "For future use" — verschiebt die Entscheidung.
- (c) **Konkreten Use-Case definieren.** z.B. `base-ui` für Komponenten, die shadcn nicht hat (Slider, Combobox falls nötig später).

Empfehlung: **(a)** — nichts installieren, was nicht genutzt wird; tech-stack updaten. v0.2 kann nachziehen falls Bedarf.

**Antwort:** a

---

### Q2 — Epic 02: `UserWorkspace` Schema-Shape

PRD §"Schema" listet `Workspace, User, Account, Session, VerificationToken (Auth.js standard)` und sagt "v0.1 supports one user per workspace ... data model is multi-tenant from day 1". Zwei valide Designs:

**Optionen:**

- (a) **Flat: `User.workspaceId` FK direkt.** Simpler, eine Tabelle weniger, exakt 1:1 in v0.1. v0.2-Migration auf Many-to-Many ist destruktiv (FK entfernen, Join-Tabelle anlegen, Daten migrieren).
- (b) **Join: `UserWorkspace { userId, workspaceId, role }`.** Eine Extra-Tabelle mehr, aber v0.2-ready für Team-Features ohne destruktive Migration. Aktuell im Spec angenommen.

Trade-off: simpler now (a) vs migration-safe later (b). v0.2-Team-Features sind **nicht** auf der MVP-Roadmap (Out of scope: "Team features (commenting, approvals, role hierarchy)") — kommen frühestens v0.3+.

Empfehlung: **(b) bleibt** — kostet jetzt eine Tabelle, spart später eine destruktive Migration. ExpliqAI-Convention ist auch Join-Tabelle.

**Antwort:** b

---

### Q3 — Epic 02: Signup-Enumeration-Policy

Login (AC #6) ist non-enumerating ("Invalid email or password" — verrät nicht, ob die E-Mail existiert). Signup (AC #4) zeigt "duplicate email" als field-level error → ein Angreifer kann via Signup-Versuch erfahren, welche E-Mails registriert sind.

**Optionen:**

- (a) **Asymmetrie akzeptieren.** Signup zeigt klaren Fehler ("Diese E-Mail ist bereits registriert"). Standard-Pattern, klare UX, akzeptiertes Risiko. Engineer-Zielgruppe weiß damit umzugehen.
- (b) **Signup hardening.** Statt "duplicate email" immer "Wir haben dir eine Bestätigungs-E-Mail geschickt" anzeigen — auch wenn es keine echte E-Mail gibt. **Geht nur mit Mailer**, den wir in v0.1 nicht haben (E2 — out of scope).
- (c) **Rate-limit per IP.** Mildert Enumeration ohne UX-Cost. Aber Rate-Limit-Infra ist schon Workspace-scoped (Brainstorming I5), nicht IP — neue Infra-Arbeit.

Empfehlung: **(a)** — akzeptieren und in `prd-decisions.md` (oder Epic 02 Domain terms) als Known-Trade-off dokumentieren. v0.2 + Mailer kann (b) nachziehen.

**Antwort:** wie schützen wir vor: "ein Angreifer kann via Signup-Versuch erfahren, welche E-Mails registriert sind"?

#### Q3.1 — Schutzmaßnahmen gegen Signup-Enumeration

Bedrohungsmodell: Angreifer hat E-Mail-Liste, probiert Signup mit jeder Adresse. "Duplicate email" → Konto existiert. Erfolg → kein Konto. So baut er eine Liste registrierter Apiq-User.

**Maßnahmen** (von "voll wirksam mit Mailer" bis "leichter Bot-Schutz"):


| #   | Maßnahme                                                                                                                                                                                              | Wirkung                                                                  | v0.1-machbar?                                                          | UX-Cost                     |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------- | --------------------------- |
| 1   | **E-Mail-Verifikation mit gleicher Antwort.** Signup zeigt immer "Check your email — wenn ein Konto existiert, kriegt der Owner eine Warn-Mail". Kein "duplicate" leak.                               | Voll wirksam                                                             | ❌ braucht Mailer (Resend/Postmark) — out of scope per Brainstorming E2 | gering                      |
| 2   | **CAPTCHA auf Signup.** Cloudflare Turnstile (gratis, ~10 KB JS) oder hCaptcha. Verhindert Automation.                                                                                                | Stoppt Bots; ein Mensch kann immer noch enumerieren                      | ✅ ja (~30 min Integration)                                             | minimal (1-Klick-Challenge) |
| 3   | **IP-Rate-Limit auf `/signup`.** Z.B. max 5 Signup-Versuche/IP/Stunde. Neue Tabelle `IpActionLog { ip, action, createdAt }` (Workspace-Action-Log ist Workspace-scoped, hier brauchen wir IP-scoped). | Mildert Mass-Enumeration; bypassbar via VPN/Botnet                       | ✅ ja (~1h Implementation)                                              | keine für normale User      |
| 4   | **Honeypot + Time-Trap.** Hidden-Field-Trap + Mindest-Submit-Zeit ≥2s. Fängt simple Bots.                                                                                                             | Niedrig — gegen sophisticated Bots wirkungslos                           | ✅ trivial (~15 min)                                                    | keine                       |
| 5   | **Constant-Time Response.** Sicherstellen, dass Response-Zeit für "duplicate" identisch ist wie für "new".                                                                                            | Schließt Timing-Side-Channel — der Status-Code-Channel bleibt aber offen | ✅ ja (Auth.js mit zusätzlicher Latenz padden)                          | keine                       |
| 6   | **Akzeptieren + dokumentieren.** Industry-Standard für viele Apps (Twitter/GitHub haben das jahrelang gehabt).                                                                                        | Keine                                                                    | ✅ trivial                                                              | keine                       |


**Mein Vorschlag für v0.1 (proportional zum Risiko bei Engineer-Zielgruppe + MVP-Skala):**

Kombiniere **#2 + #3 + #4** als minimaler Defense-in-Depth:

- **CAPTCHA** (Cloudflare Turnstile) auf Signup-Form → stoppt Automation
- **IP-Rate-Limit** 5/h auf Signup-Endpoint → stoppt manuelles Massen-Probieren
- **Honeypot field + 2s minimum submit time** → günstige zusätzliche Bot-Defense

Ergebnis: Mass-Enumeration ist nicht praktikabel. Ein motivierter Angreifer kann mit menschlichem Aufwand einzelne Adressen testen — das akzeptieren wir explizit (in Domain-terms dokumentieren) und v0.2 + Mailer macht es voll-richtig per #1.

**Aufwand:** Cloudflare Turnstile ist ~30 Min. IP-Rate-Limit ist ~1h (neue Prisma-Tabelle + middleware-helper, parallel zur Workspace-Action-Log-Infra aus Epic 03). Honeypot ist trivial.

**Alternativen:**

- **Minimal:** nur #4 (Honeypot) + #6 (akzeptieren). Schnellste Lösung, schwächster Schutz.
- **Strikt:** alle drei (#2 + #3 + #4). Empfohlen.
- **Maximal:** #2 + #3 + #4 + Mailer-Vorzug auf v0.2. → würde Mailer in v0.1 Scope ziehen, was wir ausgeschlossen haben.

Welche Variante? Ack die "Strikt"-Empfehlung, oder eine andere Kombination?

**Antwort: strikt**

---

### Q4 — Epic 04: Daily LLM-Call Cap

Aktuell im Spec: 50 Calls / 24h pro Workspace. Per Epic 00 spike: ein Stripe-Lauf kostet ~$1.80, also 50 große Specs = $90/Tag/Workspace worst-case. Worst-case ist unwahrscheinlich (User analysieren nicht 50 Specs/Tag), aber ein Misuse-Vector.

**Optionen:**

- (a) **50 / 24h beibehalten.** $90/Tag worst-case akzeptieren. MVP-Skala ist klein, ein Misuse-Workspace fällt schnell auf.
- (b) **10 / 24h.** $18/Tag worst-case. Reicht für realistische Engineering-Workflows (man analysiert nicht mehr als 5-10 Specs/Tag in echten Cases). Schmaler Sicherheitsabstand bei normalen Power-Usern.
- (c) **Per-Spec-Size-Buckets.** 50 small (≤50 endpoints) + 20 medium + 5 large/24h. Komplexer Code, aber faires Limit. Spike-Operating-Cost-Bands geben die Schwellen vor.
- (d) **Dollar-budget-Cap.** Sum `LLMCall.costUSD` über rolling 24h, reject bei ≥ $X (z.B. $10 oder $25). Direktes Cost-Limit, deckt alle Spec-Größen, einfach zu erklären, einfach zu monitoren.

Empfehlung: **(d) $10/24h Workspace-Budget.** Direktester Schutz, bei reasonable usage nie touched (5-7 medium specs Spielraum). Implementierung simpel: COUNT/SUM auf `LLMCall.costUSD WHERE workspaceId = X AND createdAt > NOW()-24h`.

**Antwort:** d

---

### Q5 — Epic 05: Filter-Persistence

Filters auf Spec Detail (Severity, Category, Status, Endpoint-Path-Search) — wo lebt der State?

**Optionen:**

- (a) **URL-Query-String.** `?severity=critical,high&status=open&search=/orders`. Reload-safe, share-link-friendly, deep-linkable, browser-back funktioniert. Engineer-UX-Standard (Linear, GitHub, Vercel arbeiten so). Etwas mehr Code (URL-Sync-Hook).
- (b) **Client-State only.** React `useState`. Verschwindet bei Reload, kein Share-Link mit Filtern. Trivialer Code.

Spec-Recommendation war "URL query — Engineer-UX expects deep-linkable filters".

Empfehlung: **(a) URL-Query.** ROI ist hoch — share-links und reload-safety sind reale Engineer-Features. shadcn / next.js haben gute Hook-Patterns dafür.

**Antwort:** a

---


## Confirmations Applied

All 5 NEEDS CONFIRMATION items resolved by user 2026-05-01. Phase 3 changes:

### Q1 — Epic 01: base-ui removed from stack
- `tech-stack.md` Frontend section: `shadcn/ui + base-ui + lucide-react` → `shadcn/ui + lucide-react`
- `specs/01-project-setup.md` Scope bullet 2: removed `base-ui` from install list
- `specs/01-project-setup.md` Open Questions: removed the NEEDS CONFIRMATION on base-ui

### Q2 — Epic 02: UserWorkspace join confirmed
- No spec changes (current model already uses join+role)
- `specs/02-auth-workspace.md` Open Questions: removed the NEEDS CONFIRMATION line

### Q3 — Epic 02: Strict anti-enumeration (CAPTCHA + IP rate-limit + honeypot)
- `specs/02-auth-workspace.md` Scope: signup-form gets Cloudflare Turnstile widget, honeypot field, 2-second time-trap; `signupAction` server-verifies Turnstile, IP-rate-limits at 5/h via new `IpActionLog` table, re-checks honeypot + time-trap server-side.
- `specs/02-auth-workspace.md` Scope: new Prisma model `IpActionLog { id, ip, action, createdAt }` (IP-scoped, distinct from Workspace-scoped `WorkspaceActionLog`).
- `specs/02-auth-workspace.md` ACs: new AC #14 (Turnstile reject), #15 (honeypot), #16 (time-trap), #17 (IP rate-limit).
- `specs/02-auth-workspace.md` Out of scope: clarified rate-limiting on **login** is still cross-cutting; signup IP-rate-limit is in scope here.
- `specs/02-auth-workspace.md` Domain terms: new "Anti-enumeration defenses" + "IpActionLog" terms documenting the trade-off.
- `specs/01-project-setup.md` `.env.example`: added `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`, `INTERNAL_API_SECRET` env vars.
- `specs/02-auth-workspace.md` Open Questions: removed the NEEDS CONFIRMATION on signup-enumeration.

### Q4 — Epic 04: Dollar-budget cap $10/24h per workspace
- `specs/04-llm-pipeline.md` Scope: replaced "TENTATIVE: ≤50 LLM calls/24h" with rolling-window SUM on `LLMCall.costUSD` ≥ $10 → reject `{ kind: "budget_exceeded" }`.
- `specs/04-llm-pipeline.md` AC #10: rewritten to test the dollar-budget threshold with the new error shape.
- `specs/04-llm-pipeline.md` Open Questions: marked the cap question resolved.

### Q5 — Epic 05: URL-query filter persistence
- `specs/05-spec-detail.md` Scope (filter bar bullet): explicit URL-query persistence per filter dimension (`?severity=`, `?category=`, `?status=`, `?search=`); `useRouter().replace()` to avoid history pollution.
- `specs/05-spec-detail.md` AC #8, #9: extended to assert URL-query persistence and reload behaviour.
- `specs/05-spec-detail.md` Open Questions: marked filter-persistence question resolved.

---

**Phase 3 status:** complete. All 5 NEEDS CONFIRMATION items resolved; specs updated; brainstorming markers already set in Phase 1. Recommended next: `/refine_all` for cross-epic consistency check, or proceed to `/dev specs/01-project-setup.md`.
