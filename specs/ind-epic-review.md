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

---

# Individual Epic Review — 2026-05-02

## Summary

- **Mode:** in-dev (Epic 00 + 01 + 02 results exist)
- **Specs reviewed:** 03, 04, 05, 06, 07, 08 (6 of 9)
- **Specs skipped (completed epics):** 00, 01, 02
- **Specs skipped (already refined):** none — all 6 reviewed specs were stale (their brainstorming markers referenced only `00-research-spike-results.md`; the new triggers are `01-project-setup-results.md` and `02-auth-workspace-results.md`)
- **Specs modified:** all 6
- **Specs clean:** none
- **Total findings:** 16 (16 structural applied, 0 NEEDS CONFIRMATION → no Phase 2)
- **Triggering inputs:**
  - `specs/01-project-setup-results.md` (now incorporated — primary trigger for tooling/Prisma quirks)
  - `specs/02-auth-workspace-results.md` (now incorporated — primary trigger for shadcn-no-form pattern, `useActionState`, TooltipProvider, server-action conventions)

---

## 03 — Spec Ingestion (URL-only)

### Findings

- **Form pattern reference missing for the Add Spec screen** (Hidden scope creep / Epic 02 results impact)
  - **Change:** Scope bullet for `(app)/specs/new/page.tsx` extended with: plain `<form action={...}>` + shadcn `Input`/`Label`/`Button`/`Card` + React 19 `useActionState`. Explicit "shadcn 4.6.0 radix-nova preset does NOT ship a `form` component, do not run `npx shadcn add form`" note.

- **Prisma migrate→generate quirk missing from migration step** (Epic 02 results impact)
  - **Change:** AC #1 extended with implementation note: `npx prisma migrate dev` in 7.x does NOT auto-run `npx prisma generate`. Added explicit model-types import path: `import type { Spec, SpecVersion, WorkspaceActionLog } from '@/generated/prisma/models'`.

- **`x-internal-secret` header missing on the trigger fetch** (Inconsistent domain language with Epic 04)
  - **Change:** Scope step 12 rewritten: `fetch('/api/internal/analyze', { method: 'POST', headers: { 'x-internal-secret': process.env.INTERNAL_API_SECRET! }, body: JSON.stringify({ specId }) })`. Note added that Epic 04's route guard returns 403 without the header.

### Changes applied

- Scope bullet (Add Spec screen): form-pattern note added
- Scope step 12: explicit secret header + content-type
- AC #1: migrate→generate quirk + model-types import path

---

## 04 — LLM Pipeline

### Findings

- **`reanalyzeSpecAction` missing explicit `getRequiredSession()` workspace check** (Hidden scope creep / Inconsistent domain language with Epic 03's `addSpecFromUrlAction`)
  - **Change:** Scope bullet rewritten: explicit workspace check with 404 on cross-workspace access (per Epic 02 convention) + fire-and-forget POST with `x-internal-secret` header (mirroring Epic 03 step 12 shape).

- **Prisma migrate→generate quirk missing from migration step** (Epic 02 results impact)
  - **Change:** AC #1 extended with implementation note + explicit model-types import: `import type { Finding, LLMCall } from '@/generated/prisma/models'`.

- **`INTERNAL_API_SECRET` placeholder warning missing** (Epic 02 results impact / pre-launch checklist)
  - **Change:** Open Question on Internal-API-secret rotation extended with explicit pre-launch note — current `.env` value is a dev placeholder; route returns 403 for missing/wrong header so a placeholder secret in prod silently breaks analysis triggers.

### Changes applied

- `reanalyzeSpecAction` scope bullet: workspace check + 404 + secret-header trigger details
- AC #1: migrate→generate note + model-types import
- Open Question (Internal-API-secret): pre-launch warning expanded

---

## 05 — Spec Detail Screen

### Findings

- **`react-diff-viewer-continued` install step missing from Scope** (Hidden scope creep — only mentioned in resolved Open Question §1, not in Scope)
  - **Change:** New Scope bullet added: `npm install react-diff-viewer-continued`; note that Epic 01 + 02 do not pull it in.

- **TooltipProvider inheritance not noted** (Epic 02 results impact / Inconsistent domain language)
  - **Change:** Scope bullet for `(app)/specs/[specId]/page.tsx` extended: `(app)/layout.tsx` is already wrapped in `<TooltipProvider>` from Epic 02 — disabled Apply/Reject buttons (and any other Tooltip primitives in this screen) work without further wrapper setup.

### Changes applied

- New Scope bullet: react-diff-viewer-continued install
- Scope bullet (Spec Detail page): TooltipProvider inheritance note

---

## 06 — Patch Apply

### Findings

- **`rejectFindingAction`, `undoApplyAction`, `undoRejectAction` missing explicit `getRequiredSession()` workspace check** (Hidden scope creep — only `applyFindingAction` had the explicit step; AC #11 implies it for all four)
  - **Change:** Each of the three missing server actions got an explicit "Workspace check" bullet at step 1 of its action body, with reference to AC #11.

### Changes applied

- `rejectFindingAction`: prepended workspace-check step
- `undoApplyAction`: prepended workspace-check step
- `undoRejectAction`: prepended workspace-check step

---

## 07 — Specs List + Settings

### Findings

- **Form pattern reference missing for Settings** (Hidden scope creep / Epic 02 results impact) — `updateWorkspaceAction`, `updateUserAction` are forms; spec was silent on the pattern.
  - **Change:** Settings scope extended with form-pattern note (plain `<form>` + Input/Label/Button/Card + `useActionState`; shadcn `form` component absent).

- **Sidebar footer hardcoded values** (Hidden scope creep — required by AC #10 "reflects immediately in the sidebar footer", but layout-edit not in scope)
  - **Change:** New "Layout update" bullet in Shared section: convert `(app)/layout.tsx` to async server component, call `getRequiredSession()`, fetch workspace name via Prisma, render `{workspace.name} • {session.email}` in the sidebar footer (replacing Epic 01's hardcoded `"Workspace name • user@example.com"`).

- **`signOutAction` import path clarified** (Inconsistent domain language)
  - **Change:** Inline note added: `signOutAction` already exists at `@/lib/session` per Epic 02 results.

- **shadcn `alert-dialog` install step missing** (Hidden scope creep — referenced as confirm dialog but no install step)
  - **Change:** New "Library install" bullet added to Shared section: `npx shadcn@latest add alert-dialog`.

- **TooltipProvider inheritance noted** (cosmetic / Epic 02 results impact)
  - **Change:** Inline note in Shared layout bullet: layout already wrapped in `<TooltipProvider>` (Epic 02) — Specs List row-action menus + AlertDialog tooltips work without further wrapper.

### Changes applied

- Settings scope: form-pattern note
- Shared section: new "Layout update" bullet for sidebar footer replacement
- Shared section: TooltipProvider inheritance note
- Shared section: `alert-dialog` install bullet
- Settings → Session bullet: `@/lib/session` import path note

---

## 08 — Export + Polish

### Findings

- **`sonner` (Toaster) library install missing** (Hidden scope creep — Epic 02 only installed card+label; shadcn 4.6.0 uses `sonner` as the toast primitive)
  - **Change:** Toast system bullet extended with `npx shadcn@latest add sonner`.

- **Toaster mount placement unclear with existing layout providers** (Epic 02 results impact)
  - **Change:** Toast system bullet clarified: `<Toaster position="top-right" />` goes inside the existing `<TooltipProvider><SidebarProvider>...</SidebarProvider></TooltipProvider>` wrapper from Epic 01 + 02 — don't re-wrap the providers.

- **Quota-exceeded toast handler implementation pattern unclear** (Epic 02 results impact)
  - **Change:** Implementation note added below quota-exceeded bullet: `useActionState` is per-form; each emitting epic's form consumes its own action state and calls `showToast` directly. No global "last-action-state" subscription in v0.1; per-form duplication accepted (centralize in v0.2 if it grows painful).

### Changes applied

- Toast system scope: `sonner` install + Toaster placement clarification
- Quota-exceeded scope: per-form `useActionState` implementation note

---

## NEEDS CONFIRMATION items

None. All 16 findings were structural fixes (anchoring to existing Epic 01 + 02 conventions, surfacing implicit scope, library installs that were referenced but not committed). No design decisions deferred.

---

**Status:** Phase 1 complete. Phase 2 (brainstorming) skipped — no NEEDS CONFIRMATION items. Phase 3 not needed.

Recommended next: `/refine_all` for cross-epic consistency check (the new edits touch shared conventions — TooltipProvider, server-action error shapes, layout updates — which may have cross-epic implications worth verifying). Then `/dev specs/03-spec-ingestion.md` to start the next epic.

---

# Individual Epic Review — 2026-05-02 (Pass 3, post-Epic-03)

## Summary

- **Mode:** in-dev (Epic 00 + 01 + 02 + 03 results exist)
- **Specs reviewed:** 04, 05, 06, 07, 08 (5 of 9)
- **Specs skipped (completed epics):** 00, 01, 02, 03
- **Specs skipped (already refined):** none — all 5 reviewed specs were stale (their brainstorming markers referenced only `00+01+02-results.md`; the new trigger is `03-spec-ingestion-results.md`)
- **Specs modified:** all 5
- **Specs clean:** none
- **Total findings:** 12 (12 structural applied, 0 NEEDS CONFIRMATION → no Phase 2)
- **Triggering input:** `specs/03-spec-ingestion-results.md` (newly added — accepted recommendations on direct `runAnalysis` call, sample-label fix, separate rate-limit buckets, explicit soft-warn ack, external-ref question close).

---

## 04 — LLM Pipeline

### Findings

- **Auto-trigger should be a direct `runAnalysis(specId)` call, not a self-fetch** (Epic 03 results recommendation #1, accepted by user). Self-fetch carries the localhost-hardcode + secret-header roundtrip for zero benefit. (Implementation drift / Hidden scope creep — Epic 04 already owns `runAnalysis` so the direct-call path is server-internal by definition.)
  - **Change:** Replaced the auto-trigger bullet to commit to direct call. Documented that Epic 04's first job is to swap Epic 03's `triggerAnalyzeFireAndForget` self-fetch in `src/app/(app)/specs/actions.ts` to `void runAnalysis(specId).catch((err) => console.error(...))`. The `/api/internal/analyze` route stays for manual debug/curl access.

- **Wire deferred Finding-invalidation in Epic 03's `repullSpecAction`** (Epic 03 results §"Risks for future epics" — `// TODO Epic 04` left because the Finding model didn't exist yet). (Hidden scope creep — Epic 04 owns the model; the wiring is Epic 04's job.)
  - **Change:** New scope bullet committing Epic 04 to add `tx.finding.updateMany({ where: { specId, status: 'open' }, data: { status: 'outdated', updatedAt: new Date() } })` inside Epic 03's existing re-pull transaction, plus extending Epic 03's `actions.test.ts` with a Finding-invalidation test (Epic 03's AC #14 becomes assertable).

- **`reanalyzeSpecAction` is button-triggered, not form-triggered** (Hidden assumption — earlier wording implied form-style; Epic 03 results clarify the convention).
  - **Change:** Action bullet rewritten to specify direct call from a `useTransition` / async click handler, no `useActionState` / FormData adapter. Notes that buttons can call object-args actions directly (the form-action.ts adapter pattern is forms-only).

- **`stringify-spec.ts` already ported by Epic 03** (Implementation drift — file mapping listed it as a TODO for this epic).
  - **Change:** Spike-to-runtime mapping line updated to note "Already ported by Epic 03; Epic 04 just imports."

### Changes applied

- Auto-trigger bullet: rewritten as direct `runAnalysis(specId)` call
- New scope bullet: wire deferred Finding-invalidation in Epic 03's repull transaction
- `reanalyzeSpecAction` bullet: button-triggered semantics + direct call
- Spike-to-runtime mapping: stringify-spec.ts noted as already-ported

---

## 05 — Spec Detail Screen

### Findings

- **Placeholder `/specs/[specId]/page.tsx` already exists from Epic 03** — Epic 05 replaces, not creates. (Implementation drift — earlier wording implied creating from scratch.)
  - **Change:** `(app)/specs/[specId]/page.tsx` scope bullet extended: "Replaces Epic 03's placeholder at the same path. The placeholder's auth/workspace check pattern (`getRequiredSession()` → `prisma.spec.findFirst({ where: { id, workspaceId } })` → `notFound()`) is the established convention — keep it, expand the rendered content."

- **`error.tsx` and `not-found.tsx` already exist from Epic 03** — Epic 05 inherits, doesn't need to create. (Implementation drift / Hidden scope creep avoided.)
  - **Change:** New scope bullet: "`(app)/specs/error.tsx` and `not-found.tsx` already exist (Epic 03 shipped minimal versions). Epic 05 inherits — Epic 08 polishes per `prd-decisions.md` Cards conventions."

- **Re-pull button visibility logic missing** — Epic 05 renders the re-pull button but the spec doesn't say when to hide it. Epic 03 added `Spec.wasAuthedPull` boolean specifically for this. (Hidden scope creep — without this, AC tests would surface authed-pull buttons that 404 on click.)
  - **Change:** New scope bullet: "render the 'Re-pull from URL' button only when `Spec.sourceType === 'url' AND Spec.wasAuthedPull === false`. Sample-sourced specs and authed pulls hide the button (parity with Epic 03's `repullSpecAction` rejection)."

- **Pre-existing Sidebar hydration warning surfaces during tooltip-heavy UI** — Epic 03 results flagged this; Epic 05's screen has heavy Tooltip use (disabled Apply/Reject buttons + endpoint-list rows + truncated URLs). (Implementation drift — risk note for the impl team.)
  - **Change:** Scope bullet extended with hydration-warning note + suggested fix paths (defer Tooltip mount via `useEffect`-gated client component, or pin controlled `open` to `false` on SSR).

### Changes applied

- `(app)/specs/[specId]/page.tsx` scope: "replaces Epic 03's placeholder" + auth pattern reuse
- New scope bullet: error.tsx / not-found.tsx inherited from Epic 03
- New scope bullet: re-pull button visibility logic on `wasAuthedPull` flag
- Hydration-warning note added to scope

---

## 06 — Patch Apply

### Findings

- **`APPLY_LIMIT_PER_HOUR` constant + `@/lib/rate-limit-workspace` reference missing** (Hidden scope creep — Epic 03 ships the helper at `@/lib/rate-limit-workspace` with `URL_PULL_LIMIT_PER_HOUR = 20` and the `checkWorkspaceRateLimit` API; Epic 06 needs `APPLY_LIMIT_PER_HOUR = 30` added to the same file).
  - **Change:** Step 2 (rate-limit) extended to spell out the import + constant addition + `recordWorkspaceAction` call after the check (Epic 02/03 convention: every attempt records).

- **`cycleStripSpec` already at the documented path** (Implementation drift — spec said "ported by Epic 04" but Epic 03 ported it).
  - **Change:** Shared-imports bullet annotated "Already ported by Epic 03 — file exists at the documented path; Epic 06 just imports."

- **Hitchhiker fix: rename Epic 03's sample SpecVersion label** (Epic 03 results recommendation #2, accepted — fix lands in Epic 06's PR because the Versions drawer is where users see the label). (Cross-epic file edit; out-of-scope-flavored but pragmatic.)
  - **Change:** New top-level scope bullet documenting the one-line fix to `src/app/(app)/specs/actions.ts` `loadSampleSpecAction` label literal. Note that single source of truth (don't translate at render time).

### Changes applied

- Step 2 (apply rate-limit): explicit `checkWorkspaceRateLimit` call shape + `APPLY_LIMIT_PER_HOUR = 30` + `recordWorkspaceAction` after check
- Shared-imports bullet: cycleStripSpec already-ported note
- New scope bullet: hitchhiker fix for sample SpecVersion label

---

## 07 — Specs List + Settings

### Findings

- **Form pattern should follow Epic 03's object-args + form-action adapter convention**, not Epic 02's direct-FormData pattern (Implementation drift — Epic 03 refined the convention; Epic 07 inherits).
  - **Change:** Settings form-pattern bullet extended with the action signature convention: underlying actions take typed object args (`updateWorkspaceAction({ name })`); a thin `'use server'` adapter at e.g. `(app)/settings/workspace-form-action.ts` exposes the `(prevState, FormData)` signature for `useActionState`. Reference to Epic 03's `src/app/(app)/specs/new/form-action.ts` as the canonical example.

- **Pre-existing Sidebar hydration warning relevant for Specs List row actions** (Inconsistent domain language — the warning was flagged in Epic 03 results but not yet propagated to Epic 07).
  - **Change:** Shared layout bullet extended with the hydration-warning note + cross-reference to Epic 05 (which has the same note + suggested fixes).

### Changes applied

- Settings Form-pattern bullet: object-args + form-action.ts adapter convention
- Shared layout bullet: hydration-warning note

---

## 08 — Export + Polish

### Findings

- **`(app)/specs/error.tsx` and `not-found.tsx` already exist from Epic 03** — Epic 08 polishes, doesn't create. (Implementation drift — earlier wording implied creating from scratch in this epic.)
  - **Change:** Error-boundaries bullet extended: "`src/app/(app)/specs/error.tsx` already exists (minimal Card + Try-again). Epic 08 polishes per `prd-decisions.md` Cards conventions — does NOT create from scratch." Same note for `not-found.tsx`. Clarification: Epic 08 still creates the missing route-group `not-found.tsx` files (`(app)`, `(auth)`, root) where Epic 03 didn't ship.

- **Pre-existing TODO from Epic 03 to wire up** in `add-spec-form.tsx` (Hidden scope creep — Epic 03 left a `// TODO (Epic 08)` for the rate_limited toast emission).
  - **Change:** Toast-system bullet extended: "When Epic 08 ships `showToast`, swap Epic 03's form's rate-limited handler to also emit the toast: `showToast(formatQuotaToast(error))` alongside the inline banner. Remove the TODO comment in `src/app/(app)/specs/new/add-spec-form.tsx`."

### Changes applied

- Error boundaries bullet: error.tsx/not-found.tsx inherited from Epic 03
- Toast-system bullet: wire showToast in Epic 03's add-spec-form.tsx (TODO removal)

---

## NEEDS CONFIRMATION items

None. All 12 findings were structural fixes anchoring to Epic 03's accepted recommendations + surfaced implementation drift between unbuilt specs and Epic 03's actual ship.

---

**Status:** Phase 1 complete. Phase 2 (brainstorming) skipped — no NEEDS CONFIRMATION items. Phase 3 not needed.

Recommended next: `/refine_all` for cross-epic consistency check — the new edits cross multiple epics (Epic 04 modifies Epic 03's source as part of its scope; Epic 06 hitchhikes a fix into Epic 03's loadSampleSpecAction). Worth a cross-epic sweep before `/dev specs/04-llm-pipeline.md`.

---

# Individual Epic Review — 2026-05-02 (post-Epic-04)

## Summary

- **Mode:** in-dev (results 00-04 exist)
- **Specs reviewed:** 05, 06, 07, 08 (4)
- **Specs skipped (completed epics):** 00, 01, 02, 03, 04
- **Specs skipped (already refined for current results set):** none
- **Specs modified:** 05, 06, 07, 08 (4)
- **Specs clean:** none
- **Total findings:** 22 (15 structural applied, 7 NEEDS CONFIRMATION → Phase 2)
- **Triggering input:** `specs/04-llm-pipeline-results.md`

---

## 05 — Spec Detail Screen

### Findings

- **Placeholder description outdated** (Inconsistent domain language)
  - Spec said placeholder "currently renders just spec name + status + endpoint count"; actual placeholder also renders source URL.
  - **Change:** Updated scope bullet 1 to read "spec name + source URL + status + endpoint count".

- **Prisma type-import path quirk not surfaced** (Ungrounded assumption)
  - Epic 04 results §6 documented `Finding`/`Spec`/`SpecVersion` aliases live at `@/generated/prisma/client`, not `@/generated/prisma/models`. CLAUDE.md is stale.
  - **Change:** Added a scope bullet pinning `@/generated/prisma/client` as the import path.

- **Sidebar hydration warning investigation pulled into Epic 05** (Hidden scope creep)
  - Spec line 12 directed Epic 05 to "consider investigating the root cause" — no AC, no scope cap, not Epic 05's responsibility (pre-existing per Epic 03 / Epic 04).
  - **Change:** Replaced the directive with a one-line acknowledgement that the warning is pre-existing and not Epic 05's responsibility; deferred to a separate `/patch` or Epic 08 polish.

- **AC #1 silent on `qualityScore IS NULL`** (Missing AC)
  - The field is `Int?`; before first analysis there's no score. Spec didn't say what to render.
  - **Change:** AC #1 extended — render neutral placeholder badge `—` in zinc when `qualityScore IS NULL`.

- **AC #2 polling lifecycle covers `analyzing` only, not `pending`** (Inconsistent domain language)
  - Domain term "Polling" already says "while it is `pending` or `analyzing`". AC #2 said `analyzing` only — internal contradiction.
  - **Change:** AC #2 extended to "`pending` or `analyzing`"; auto-stop on `completed` or `failed` made explicit.

- **AC #13 silent on `analysisError` formatting and synchronous flip** (Missing AC)
  - Epic 04 results documented that `analysisError` may be a stringified zod-error JSON for the `schema_validation` path. AC #13 didn't say how to render it. Also missed that `reanalyzeSpecAction` writes `analysisStatus = 'analyzing'` synchronously per Epic 04 commit `50b4b1c`.
  - **Change:** AC #13 extended — parse JSON if possible (render first issue's `.message` headline + collapsible JSON `<details>`); explicit "no client-side optimistic state needed" note with `router.refresh()` as optional skip-poll-wait.

- **Diff sub-tree handling of cycle markers** (Ungrounded assumption)
  - `Spec.currentJson` carries `{"$ref":"#cyclic"}` markers from Epic 03's `cycleStripSpec`. AC #5 and the "Diff sub-tree" domain term didn't acknowledge this.
  - **Change:** Diff sub-tree domain term extended — markers render as opaque JSON nodes; Epic 06's `validatePatchOps` is the apply-time gate.

- **`analysisError` extraction policy** — `NEEDS CONFIRMATION` added as open question (recommendation: include `.path.join('.')` next to `.message` in the headline so the user knows WHICH finding failed).

### Changes applied
- Scope bullet 1: placeholder description updated.
- Scope: added Prisma type-import-path note.
- Scope §"Re-pull button visibility logic": Sidebar hydration sentence rewritten as no-op for Epic 05.
- AC #1: appended null-rendering rule.
- AC #2: extended polling lifecycle.
- AC #13: extended with `analysisError` parsing rule + synchronous-flip note.
- Domain terms §"Diff sub-tree": extended with cycle-marker note.
- Open questions: 1 new `NEEDS CONFIRMATION` item.

---

## 06 — Patch Apply

### Findings

- **`computeQualityScore` argument-name wording misleading** (Inconsistent domain language)
  - Step 7 said `computeQualityScore(remainingOpenFindings)` — implies caller pre-filters. The function takes ALL findings and filters internally.
  - **Change:** Renamed to `allFindingsForSpec` with a parenthetical clarification.

- **Prisma type-import path quirk not surfaced** (Ungrounded assumption)
  - Same as Epic 05's finding. Epic 06 actions need `Finding` and `SpecVersion` types.
  - **Change:** Added bullet under "Shared analysis-library imports" pinning `@/generated/prisma/client`.

- **Synchronous-flip on Re-analyze button not noted** (Inconsistent domain language)
  - Epic 06 wires Re-analyze on stale/outdated cards. Without this note, an implementer might add redundant optimistic UI.
  - **Change:** Re-analyze wiring sentence extended with synchronous-flip note + optional `router.refresh()` hint.

- **`validatePatchOps` test ownership** — `NEEDS CONFIRMATION` (recommendation: keep AC #2 as integration tests AND add a separate pure-function test file `src/__tests__/llm-pipeline/validate-patches.test.ts` for shapes 2a-2d, fits Epic 04's testing style).

### Verified clean (no changes)
- `validatePatchOps` signature matches spec wording exactly.
- Defensive `cycleStripSpec` call still warranted.
- `'outdated'` status string matches re-pull writer.
- `'apply'` action key reserved cleanly in `rate-limit-workspace.ts`.
- Hitchhiker fix (`'Initial pull from URL'` → `'Initial sample load'`) confirmed still needed; literal still in source.
- `prisma.lLMCall` camelCase quirk — irrelevant to Epic 06 (no LLMCall writes).

### Changes applied
- Scope: added Prisma type-import-path note.
- Scope step 7 (apply transaction): renamed `remainingOpenFindings` → `allFindingsForSpec`.
- Scope §"Wire these actions": Re-analyze line extended with synchronous-flip + `router.refresh()` note.
- Open questions: 1 new `NEEDS CONFIRMATION` item.

---

## 07 — Specs List + Settings

### Findings

- **AC #6 missing "disable Re-analyze when analyzing" rule** (Missing AC)
  - Open Question line 100 already resolves this ("greyed out with tooltip"), but the resolution never made it into AC #6.
  - **Change:** AC #6 extended with the disable rule.

- **`qualityScore` rendering after failed re-analysis** — `NEEDS CONFIRMATION` (recommendation: render the prior numeric score, since it accurately reflects the last completed analysis; the `failed` status pill signals retry).

- **Polling cadence (5 s) inconsistent with Epic 05 (3 s)** — `NEEDS CONFIRMATION` (recommendation: keep 5 s with rationale that list view tolerates more lag and polling cost scales with row count).

- **Sidebar hydration warning investigation in Epic 07 scope** — `NEEDS CONFIRMATION` (recommendation: drop the directive — same reasoning as Epic 05).

### Verified clean (no changes)
- `analysisStatus` enum correctly listed; no `stale`/`outdated` leak.
- Sample-spec allow-list (`'openweathermap'`) correctly scoped.
- `loadSampleSpecAction` + `addSpecFromUrlAction` named correctly.
- `signOutAction` import path (`@/lib/session`) correct.
- Workspace-name extra-query (`prisma.workspace.findUnique`) correctly called out.
- `next-themes` wiring — already installed by Epic 01.
- Sidebar footer source-of-truth + `revalidatePath` correctly specified.

### Changes applied
- AC #6: extended with disable rule.
- Open questions: 3 new `NEEDS CONFIRMATION` items.

---

## 08 — Export + Polish

### Findings

- **Spec wording suggests creating `src/lib/toasts.ts` from scratch** (Inconsistent domain language)
  - File already exists from Epic 03 with `formatQuotaToast`. Spec's "Canonical message catalog at `src/lib/toasts.ts`" reads as create-from-scratch.
  - **Change:** Reworded to "extends `src/lib/toasts.ts` (the Epic 03 stub)".

- **`add-spec-form.tsx` import path under-specified** (Missing AC)
  - **Change:** Appended import path: `import { showToast, formatQuotaToast, TOASTS } from '@/lib/toasts'`.

- **Mobile fallback banner placement / sessionStorage key vague** (Missing AC)
  - **Change:** Added: "above `<SidebarInset>`, below topbar, full-width"; sessionStorage key `apiq.mobile-banner-dismissed`; `'use client'` with `window.matchMedia('(max-width: 1023px)')`.

- **No empty-state styling rule cross-reference** (Inconsistent domain language)
  - **Change:** Empty-state bullets extended with reference to `prd-decisions.md` §"Was wir NICHT übernehmen" (no illustrations, no hero).

- **AC #12 references a "smoke-test page" never specified** (Untestable AC)
  - **Change:** Reworded to a Vitest test that renders a component calling `showToast(TOASTS.exportedJson)` + asserts Sonner container receives the message. Visual styling moved to manual browser smoke-check.

- **AC #13 silent on canonical-string ownership** (Inconsistent domain language)
  - **Change:** AC #13 extended with "No other module re-implements these strings" — pins `formatQuotaToast` as the single source.

- **Spec Detail asynchronous budget-rejection toast not specified** (Missing AC)
  - Epic 04 results explicitly handed off: budget rejection arrives via `Spec.analysisError`, not a synchronous return. Epic 08's spec didn't mention surfacing this on Spec Detail.
  - **Change:** "Per-consumer pattern" paragraph extended with: Spec Detail polls → if budget pattern detected in `Spec.analysisError`, call `showToast(formatQuotaToast(...))` once per session per specId (sessionStorage dedupe key `apiq.budget-toast.<specId>`).

- **`formatAnalysisError` helper ownership** — `NEEDS CONFIRMATION` (recommendation: ship at `src/lib/format-analysis-error.ts`, Epic 08 owned, both Epic 05's failed-card and the budget-toast hook import it).

- **Pre-launch checklist reconciliation as Epic 08 AC** — `NEEDS CONFIRMATION` (recommendation: own reconciliation in Epic 08; it IS the final v0.1 epic).

### Verified clean (no changes)
- `react-diff-viewer-continued` not duplicated in Epic 08 (Epic 05 owns the install).
- `yaml` library handoff from Epic 03 correctly noted.

### Changes applied
- Scope §"Toast system": canonical-message-catalog wording reworded.
- Scope §"Toast system": `add-spec-form.tsx` import path appended.
- Scope §"Polish" mobile-banner bullet: placement + storage key + matchMedia hint.
- Scope §"Polish" empty-states bullet: styling rule cross-reference.
- Scope §"Rate-limit polish": Spec Detail asynchronous budget-rejection paragraph added.
- AC #12: reworded to Vitest assertion + manual browser smoke-check.
- AC #13: canonical-source ownership pinned.
- Open questions: 2 new `NEEDS CONFIRMATION` items.

---

## NEEDS CONFIRMATION items

7 items across Epics 05/06/07/08:

| Spec | Item | Recommendation |
|------|------|----------------|
| 05 | `analysisError` extraction policy on failed card (path + message vs message-only) | Include `.path.join('.')` next to `.message` in headline |
| 06 | `validatePatchOps` test ownership (integration only vs +pure-function tests) | Both: keep AC #2 integration AND add `validate-patches.test.ts` |
| 07 | `qualityScore` rendering after failed re-analysis (prior score vs `—`) | Render prior numeric score; `failed` pill signals retry |
| 07 | Specs-list polling cadence (5 s vs align to Epic 05's 3 s) | Keep 5 s with rationale (list tolerates more lag) |
| 07 | Sidebar hydration warning investigation in Epic 07 scope | Drop directive (same as Epic 05) |
| 08 | `formatAnalysisError` helper ownership (Epic 08 vs Epic 05 inline) | Epic 08 owns at `src/lib/format-analysis-error.ts` |
| 08 | Pre-launch checklist reconciliation as Epic 08 AC | Yes — Epic 08 IS the final v0.1 epic |

---

**Status:** Phase 1 complete. 7 NEEDS CONFIRMATION items.

Recommendation: skip Phase 2 (brainstorming-in-file) and proceed to `/refine_all` — the items are low-stakes and can be resolved inline during cross-epic review. Alternative: run `/refine_all_ind` Phase 2 first if user wants to confirm before cross-epic checks.

---

# Individual Epic Review — 2026-05-02 (Pass 7, post-Epic-07)

## Summary

- **Mode:** in-dev (results 00–07 exist)
- **Specs reviewed:** 08 (1)
- **Specs skipped (completed epics):** 00–07 — results files exist; never re-refined.
- **Specs skipped (already refined for current results set):** none — Epic 08 marker was missing `07-specs-list-settings-results.md`.
- **Specs modified:** none — Epic 08 is clean against current state.
- **Specs clean:** 08
- **Triggering input:** `07-specs-list-settings-results.md` (just shipped; Epic 07 results §"Follow-up after user review" includes Q1/Q2/Q5 fixes: Radix tooltip on disabled Re-analyze, three coloured finding-count pills, workspace-name cache with `updateTag`).

## Method

One read-only Explore agent (`spec08`) traced every assumption in Epic 08 spec against (a) the Epic 07 results file (implementation changes, new patterns established) and (b) current source: `src/lib/toasts.ts`, `src/app/(app)/layout.tsx`, `src/lib/format-analysis-error.ts`, `src/lib/workspace-cache.ts`, Spec Detail header/view/finding-card components, versions-drawer, specs-list-view, settings actions/forms, and `prd-decisions.md`. Findings reported back, lead synthesized.

## 08 — Export + Polish

### Findings

**Stale assumptions / drift:** none. All code locations and signatures Epic 08 references remain stable against Epic 07's landed work:

- Toast catalog (`TOASTS.*` entries) + `showToast` stub + `formatQuotaToast` continue unchanged at `src/lib/toasts.ts` — Epic 07 added 4 new catalog entries (`rePullComplete`, `specDeleted`, `workspaceUpdated`, `profileUpdated`) which Epic 08 correctly verifies exist.
- `spec-detail-header.tsx` `onRepull` / `onReanalyze` handlers still lack toast wiring (correctly assigned to Epic 08 Scope §"Toast wiring on existing surfaces" AC #21).
- `spec-detail-view.tsx` `FailedPanel.onRetry` still lacks `TOASTS.reanalyzeStarted` wiring (correctly assigned to Epic 08 AC #21).
- Epic 06's `finding-card.tsx` `StaleOrOutdatedActions.onReanalyze` already calls `showToast(TOASTS.reanalyzeStarted)` — verified (no double-wiring).
- Epic 06's `finding-card.tsx` `OpenActions.onApply` already calls `showToast(formatQuotaToast(error))` on rate-limit — verified.
- `formatAnalysisError` helper remains at `src/lib/format-analysis-error.ts` with all 3 parsing rules intact (12 tests pass).
- `(app)/layout.tsx` is async server component (line 35); loads `getWorkspaceNameCached` (line 41) — compatible with all 3 sidebar-hydration fix candidates (a/b/c per AC #18).
- `versions-drawer.tsx` controls `open` state via `useState` — Epic 08's pulse-on-delta hook (AC #23) is implementable without refactoring.
- `workspace-cache.ts` new in Epic 07 with `unstable_cache` + `WORKSPACE_NAME_CACHE_TAG`; `updateWorkspaceAction` calls `updateTag(WORKSPACE_NAME_CACHE_TAG)` — confirms Epic 08 should NOT use `revalidateTag` (Next.js 16 pattern).
- `rePullStarted` removed from Toast catalog per cross-epic Q1 Pass 6 — no stale entry exists. ✓

**Hidden scope / oversized slices:** none. Epic 08 spec correctly recognizes that `updateTag` (Next.js 16) supersedes `revalidateTag` — recommend documentation note if Epic 08 adds caching to new features.

**Missing / untestable ACs:** none. AC #18 (hydration fix) / AC #19 (pre-launch checklist) require implementation-time investigation + manual verification, but requirements are specific.

**Inconsistent terminology:** none.

**Cross-epic items breaking implementation:** none. Epic 07 shipped row-action menu wiring (Re-analyze / Re-pull / Delete) in specs-list-view. Epic 07 results §"Toast catalog entries shipped here, not Epic 08" states: "Epic 07's row-action menu… calls `showToast(TOASTS.rePullComplete)`", implying toasts are ALREADY wired. **Verification point:** confirm specs-list-view row actions call `showToast()` on success before closing Epic 08 AC #21.

**NEEDS CONFIRMATION items raised by investigator (resolved at synthesis time):**

1. *Sidebar Hydration-Fix candidate (a/b/c)* — Epic 08 spec line 30 explicitly says "commit to ONE of (a)/(b)/(c) and pick whichever has the lowest blast radius." This is an implementation-time choice, not a refinement question. **No new NEEDS CONFIRMATION needed.**
2. *Specs-list row-action toast wiring status* — investigator flagged uncertain wiring, but Epic 07 results §"Toast catalog entries shipped here, not Epic 08" explicitly commits "Epic 07's row-action menu… calls `showToast(TOASTS.rePullComplete)`". **Recommendation:** Trust Epic 07 results; if toasts are missing on landing, it's an Epic 07 gap to fix before Epic 08 verification.

### Changes applied

- Updated `specs/08-export-polish-brainstorming.md` marker to add `07-specs-list-settings-results.md` to the `Results incorporated:` list. No spec edits.

## Outcome

Epic 08 is clean against the codebase + current results set. **Phase 2 skipped — 0 `NEEDS CONFIRMATION` items raised by this pass.** The 1 verification point (specs-list row-action toast wiring) is an Epic 07 landing check, not an Epic 08 blocker — can proceed with confidence.

**Status:** Phase 1 complete. 0 `NEEDS CONFIRMATION` items from Pass 7.

---

# Individual Epic Review — 2026-05-02 (Pass 5, post-Epic-05)

## Summary

- **Mode:** in-dev (results 00–05 exist)
- **Specs reviewed:** 06, 07, 08 (3)
- **Specs skipped (completed epics):** 00, 01, 02, 03, 04, 05
- **Specs skipped (already refined for current results set):** none
- **Specs modified:** 06, 07, 08 (3)
- **Specs clean:** none
- **Total findings:** 11 (7 structural applied, 4 NEEDS CONFIRMATION → Phase 2 candidates)
- **Triggering input:** `specs/05-spec-detail-results.md` (newly added — Epic 05 shipped `formatAnalysisError` early because of the failed-card hard dependency, which causes structural drift in Epic 08; Epic 05 also flagged risks for Epics 06/07).

---

## 06 — Patch Apply

### Findings

- **Versions drawer open/closed state — controlled vs uncontrolled** (Hidden scope creep / Epic 05 Q6 carry-over)
  - Spec Detail polls every 3 s while `analysisStatus` is `pending`/`analyzing` (`spec-detail-view.tsx`); each poll calls `router.refresh()` which re-renders the tree. Per Epic 05 Q6, uncontrolled `<details>`/`<dialog>` collapsibles lose their open/closed state across re-renders. Spec doesn't say which pattern to use for the Versions drawer.
  - **NEEDS CONFIRMATION** — added as open question with 2 options + recommendation toward controlled.

- **Diff preview behaviour for `stale` finding cards** (Untestable AC)
  - Spec scope §"Diff preview" (line 52) says diff is "scaffolded in Epic 05" (correct) and computed live via `applyPatch`. For `stale` findings, `validatePatchOps` already failed against `currentJson` so `applyPatch` likely throws; Epic 05's `computeDiff` already catches throws → "Diff unavailable". Spec doesn't say whether to leave the Show-diff toggle visible or hide it for stale cards.
  - **NEEDS CONFIRMATION** — added as open question with 3 options + recommendation toward leaving as-is.

### Verified clean (no changes needed)

- Apply/Reject button disabled surface in `finding-card.tsx` is exactly the pattern Epic 06 needs to activate (`<Tooltip><TooltipTrigger asChild><span tabIndex={0}><Button disabled>...`). Verified inline.
- `registerCardRef` callback API is wired through `findings-list.tsx` and used by `spec-detail-view.tsx`. Epic 06 inherits.
- `asAffectedEndpoints` and `asPatchOps` are exported from `finding-card.tsx`. Epic 06 imports unchanged.
- `validatePatchOps` exists at `src/lib/analysis/validate-patches.ts` (Epic 04) with the documented `{ applyClean, hallucinationCheck: { hallucinated, details }, applyError? }` return shape — the four hallucination shapes 2a-2d are all checked correctly (incl. the move/copy bug-fix #1 — destination `path` is NOT checked).
- `computeQualityScore` from `src/lib/analysis/quality-score.ts` filters `status === 'open'` internally — caller does NOT pre-filter (matches spec scope step 7).
- `cycleStripSpec` from `src/lib/analysis/stringify-spec.ts` exists (Epic 03 ported).
- `checkWorkspaceRateLimit` + `recordWorkspaceAction` + `URL_PULL_LIMIT_PER_HOUR` exported from `@/lib/rate-limit-workspace.ts`; Epic 06 adds `APPLY_LIMIT_PER_HOUR = 30` per spec scope step 2.
- Hitchhiker fix (`'Initial pull from URL'` → `'Initial sample load'` literal in `loadSampleSpecAction` line 537) — spec already mandates this in scope line 12; the fix lands during Epic 06 implementation, no spec change needed.
- `formatAnalysisError` shipped by Epic 05 — Epic 06's stale-card hint is independent of this helper.

### Changes applied

- 2 new `NEEDS CONFIRMATION` items appended to Open questions (Versions drawer state + stale-card diff behaviour).

---

## 07 — Specs List + Settings

### Findings

- **AC #3 quality-score badge zinc colour for null** (Inconsistent domain language with Epic 05 implementation)
  - Spec said "unanalysed specs show '—'" but didn't name the colour. Epic 05's `spec-detail-header.tsx` `qualityScoreClasses` 4th band uses zinc. Specs-list table must mirror.
  - **Change:** AC #3 extended — "unanalysed specs (`qualityScore IS NULL`) show '—' in zinc, mirroring Epic 05's null-score placeholder (`border-zinc-500/40 bg-zinc-500/15 text-zinc-700 dark:text-zinc-300`)".

- **`QualityScoreBadge` and `StatusPill` extraction missing from spec** (Hidden scope creep / Epic 05 risk carry-over)
  - Both are private functions inside `spec-detail-header.tsx` (Epic 05). Specs-list table needs the same badges per row (AC #3, #4); without explicit extraction, both get duplicated.
  - **Change:** new bullet added to Scope §"Shared" mandating extraction to `src/components/quality-score-badge.tsx` and `src/components/status-pill.tsx`, with re-import in both Spec Detail and Specs List. All 4 quality-score colour bands + spinner-icon for `pending`/`analyzing` preserved verbatim.

- **`User.displayName` schema field is a prerequisite, not present** (Ungrounded assumption)
  - Profile section + AC #11 mandate editable `displayName`; Prisma User model only has `name` (Auth.js standard). Three resolution paths.
  - **NEEDS CONFIRMATION** — added as open question with 3 options + recommendation: reuse `User.name` (no migration, "Name" is a fine label).

- **Finding-counts triplet semantics** (Missing AC / Untestable AC)
  - Scope says "Open / applied / rejected finding counts (small triplet)" but `Finding.status` has 5 values. Spec doesn't say what happens to `stale` and `outdated`.
  - **NEEDS CONFIRMATION** — added as open question with 3 options + recommendation: show 3 only (stale/outdated are transient, resolved by re-analyze).

### Verified clean (no changes needed)

- `addSpecFromUrlAction`, `repullSpecAction`, `loadSampleSpecAction`, `deleteSpecAction`, `reanalyzeSpecAction` signatures all match what Epic 07's row-action menu calls.
- `signOutAction` and `getRequiredSession()` available from `@/lib/session`.
- Form-action adapter pattern (`addSpecFromUrlFormAction` in `(app)/specs/new/form-action.ts`) is the canonical reference Epic 07 mirrors for `updateWorkspaceFormAction` etc.
- `(app)/layout.tsx` already wraps in `<TooltipProvider>` (Epic 02) — Specs List row-action menus + AlertDialog tooltips work without further setup.
- `(app)/specs/error.tsx` and `not-found.tsx` already exist — Epic 07 inherits, Epic 08 polishes.
- Re-pull button visibility condition (`sourceType === 'url' && wasAuthedPull === false`) matches Epic 05's `spec-detail-header.tsx` impl exactly.
- Polling cadence 5 s remains correct (cross-epic Q4 resolved).
- Sidebar hydration warning is owned by Epic 08 polish (cross-epic Q5).
- `npx shadcn@latest add alert-dialog` install bullet present and necessary.

### Changes applied

- AC #3: extended with the explicit zinc colour token for null `qualityScore`.
- Scope §"Shared": new bullet for `QualityScoreBadge` + `StatusPill` extraction.
- 2 new `NEEDS CONFIRMATION` items appended to Open questions (`User.displayName` schema + Finding-counts triplet semantics).

---

## 08 — Export + Polish

### Findings

- **`formatAnalysisError` ownership wording contradicts shipped reality** (Inconsistent domain language)
  - Spec text said "Epic 08 ships" / "owned by Epic 08". Epic 05 already shipped the helper at `src/lib/format-analysis-error.ts` with all 3 parsing rules + 12 unit tests. Spec language misled.
  - **Change:** Scope §"Polish" first bullet rewritten — "already shipped by Epic 05; Epic 08's remaining scope is verification + new-consumer wiring only". The 3 parsing rules retained as the spec contract (regression-check shape). Explicit "do NOT duplicate Epic 05's 12 existing tests."

- **AC #17 vague against shipped implementation** (Untestable AC)
  - AC #17 read as if Epic 08 implements the helper from scratch.
  - **Change:** AC #17 rewritten to verification-focused — confirm 3 parsing rules, confirm both consumers import the same helper, confirm Epic 05's existing tests still pass, no inline parsing duplication.

- **AC #18 hydration warning fix lacks decision gate** (Untestable AC)
  - Spec listed 3 candidate fixes but didn't commit Epic 08 to picking one. Cross-epic Q5 user direction was "every issue needs to be fixed" — investigate-and-defer is not acceptable.
  - **Change:** AC #18 rewritten — "Epic 08 picks ONE of three candidate fix paths and ships it — investigate-and-defer is NOT acceptable". Fix verification via Playwright + chosen path documented in results.

- **AC #19 currently unsatisfiable** (Missing handoff Epic 04 → Epic 08)
  - CLAUDE.md "Pre-launch checklist" has 4 items; cross-epic-review.md Pass 4 Q7 documented Epic 04 results add 3 more (`INTERNAL_API_SECRET` rotation reaffirmed, OpenRouter pricing monthly verification, Petstore-failed-state cleanup) that are NOT yet in the CLAUDE.md checklist.
  - **Change:** AC #19 rewritten — Epic 08 first scans Epic 04/05/06/07 results files for follow-up items, updates the CLAUDE.md checklist to include them, then reconciles all items.

- **Spec-Detail budget-toast hook implicit, not implemented** (Hidden scope creep)
  - Spec prose said "Epic 05 detects the budget-shape on its poll-tick" — but Epic 05 results §"Risks for Epic 08" explicitly hands this off; `spec-detail-view.tsx` polls but emits no budget toast. The hook must be Epic 08's responsibility.
  - **Change:** Scope §"Rate-limit polish" rewritten to commit Epic 08 to implementing the hook in `spec-detail-view.tsx` (`useEffect` keyed on `[analysisStatus, analysisError, specId]`, sessionStorage dedupe). New AC #20 asserts the hook + dedupe.

- **TOASTS catalog wired in catalog but not in code** (Hidden scope creep)
  - Catalog has `rePullComplete` and `reanalyzeStarted`, but `spec-detail-header.tsx`'s `onRepull` / `onReanalyze` and `spec-detail-view.tsx`'s `FailedPanel.onRetry` call `router.refresh()` silently — no toast. Epic 05 results explicitly hands this off.
  - **Change:** Scope §"Polish" — new top bullet "Toast wiring on existing surfaces" detailing the 3 wiring points. New AC #21 asserts each.

- **Tailwind JIT regression test for `ring-2 ring-violet-500`** (Missing AC / Epic 05 Q5 carry-over)
  - Epic 05 results §"Open question Q5" explicitly recommended adding a regression test against future Tailwind config glob narrowing.
  - **Change:** Tests §"Vitest" — new sub-bullet for the regression test (assert `ring-2` + `ring-violet-500` CSS rules exist in the document's stylesheets).

### Verified clean (no changes needed)

- `react-diff-viewer-continued@^4.2.2` is installed (Epic 05).
- `ResizeObserver` polyfill is in `src/__tests__/setup.ts` (Epic 05) — Epic 08 keeps.
- TOASTS catalog 13 entries are correct (cross-epic Q1 resolved → option (a) catalog).
- `(app)/specs/error.tsx` + `not-found.tsx` already exist — Epic 08 polishes only (spec language correct).
- `npx shadcn@latest add sonner` install bullet present.
- Mobile fallback banner spec details (placement, sessionStorage key, matchMedia) are complete.

### Changes applied

- Scope §"Polish" first bullet rewritten — `formatAnalysisError` ownership wording corrected to "shipped by Epic 05".
- Scope §"Polish" — new "Sidebar hydration warning fix" wording with explicit "MUST pick one fix path".
- Scope §"Polish" — new "Toast wiring on existing surfaces" bullet detailing 3 click-handler wirings.
- Scope §"Rate-limit polish" — rewritten to commit Epic 08 to implementing the budget-toast hook in `spec-detail-view.tsx`.
- Tests §"Vitest" — added Tailwind JIT regression test + budget-toast hook test + toast-wiring tests for 3 surfaces.
- AC #17, #18, #19 — rewritten.
- AC #20 (Spec-Detail budget-toast hook) — added.
- AC #21 (toast wiring on Spec Detail header) — added.

---

## NEEDS CONFIRMATION items

4 items across Epics 06/07:

| Spec | Item | Recommendation |
|------|------|----------------|
| 06 | Versions drawer open/closed state: controlled vs uncontrolled | Controlled (preserves state across 3 s polls) |
| 06 | `stale`-card diff preview behaviour | Leave as-is (existing "Diff unavailable" catch is informative) |
| 07 | `User.displayName` schema field path | Reuse `User.name` (no migration; "Name" is a fine label) |
| 07 | Finding-counts triplet semantics (3 vs 5 statuses) | Show 3 (open/applied/rejected); stale + outdated are transient |

---

**Status:** Phase 1 complete. 4 `NEEDS CONFIRMATION` items.

Recommendation: skip Phase 2 (brainstorming-in-file) and proceed to `/refine_all` — the 4 items are low-stakes and easy to inline-confirm during the cross-epic pass. Alternative: run Phase 2 first if user prefers explicit confirmation before cross-epic checks.

---

# Individual Epic Review — 2026-05-02 (Pass 6, post-Epic-06)

## Summary

- **Mode:** in-dev (results 00–06 exist)
- **Specs reviewed:** 07, 08 (2)
- **Specs skipped (completed epics):** 00, 01, 02, 03, 04, 05, 06 — results files exist; never re-refined.
- **Specs skipped (already refined for current results set):** none — both 07 and 08 markers were missing `06-patch-apply-results.md`.
- **Specs modified:** none — both clean against current state.
- **Specs clean:** 07, 08
- **Triggering input:** `06-patch-apply-results.md` (just shipped, includes a "Follow-up after user review" section that already forwarded the Versions-drawer pulse polish to Epic 08 spec).

## Method

Two read-only Explore agents (`spec07`, `spec08`) traced every assumption in their respective spec against (a) the Epic 06 results file (patterns established, surfaces shipped, follow-up actions taken) and (b) current source: `prisma/schema.prisma`, `src/app/(app)/specs/actions.ts`, `src/lib/toasts.ts`, the Spec Detail components, `src/lib/session.ts`, `src/lib/format-analysis-error.ts`, and `src/components/ui/`. Findings reported back, lead synthesized.

## 07 — Specs List + Settings

### Findings

**Stale assumptions / drift:** none. All action signatures, schema fields, and existing-component locations referenced by Epic 07 hold against current code:

- `repullSpecAction` / `deleteSpecAction` / `reanalyzeSpecAction` signatures match (`src/app/(app)/specs/actions.ts`)
- `Spec` model fields all present in `prisma/schema.prisma`; `Finding.staleReason` is now in the schema (Epic 06 addition)
- `getRequiredSession()` shape unchanged; `signOutAction` still at `@/lib/session`
- `Workspace.name` field present
- Sidebar footer still hardcoded in `src/app/(app)/layout.tsx` — Epic 07 owns the replacement (correctly scoped)
- `loadSampleSpecAction` allow-list still hard-coded to `'openweathermap'` — matches Epic 07's empty-state CTA

**Hidden scope / oversized slices:** none.

**Missing / untestable ACs:** none. The two mechanical dependencies investigator flagged (`npx shadcn add alert-dialog` for AC #6; badge extraction for AC #3, #4) are already explicitly listed in Epic 07 Scope (lines 48-49). Not findings.

**Inconsistent terminology:** none.

**Cross-epic items breaking implementation:** none. Epic 06 → 07 handoff is clean: the four new server actions exist but Epic 07 is read-only at the list level and does not call them; `Finding.staleReason` exists; Epic 07's row-level finding counts deliberately exclude `stale`/`outdated` per cross-epic Q4 (already documented in spec line 15).

**NEEDS CONFIRMATION items raised by investigator (resolved at synthesis time):**

1. *Combined vs separate badge files* — already addressed in Epic 07 Scope line 49: "Move them to `src/components/quality-score-badge.tsx` and `src/components/status-pill.tsx` (or a single `src/components/spec-badges.tsx` if preferred)". Both options are explicitly permitted. **No new NEEDS CONFIRMATION needed.**
2. *Sidebar footer dropdown vs static text* — already addressed in spec lines 47, 94 ("small, muted text") and AC #10 ("reflects immediately in the sidebar footer" — implies static). Spec is committed to static. **No new NEEDS CONFIRMATION needed.**
3. *Settings sections — Cards vs tabs* — already implicit in spec line 38 which lists `shadcn Input/Label/Button/Card` as the form primitives. Cards-per-section is consistent with the rest of the project. **No new NEEDS CONFIRMATION needed.**

### Changes applied

- Updated `specs/07-specs-list-settings-brainstorming.md` marker to add `06-patch-apply-results.md` to the `Results incorporated:` list. No spec edits.

## 08 — Export + Polish

### Findings

**Stale assumptions / drift:** none. Every surface Epic 08 references holds in current code:

- `src/lib/toasts.ts` ships `showToast` (no-op stub), `TOASTS.reanalyzeStarted`, `formatQuotaToast`, and the `ToastShape` type — all from Epic 06. Epic 08's job is to replace the no-op body with a real Toaster dispatch and extend the catalog.
- `formatAnalysisError` shipped in Epic 05 at `src/lib/format-analysis-error.ts`.
- `spec-detail-header.tsx` `onRepull` / `onReanalyze` and `spec-detail-view.tsx` `FailedPanel.onRetry` exist as the spec describes.
- The Versions drawer trigger lives in `spec-detail-header.tsx`; the `versions` prop flow from `page.tsx` → `spec-detail-view.tsx` → `spec-detail-header.tsx` → `versions-drawer.tsx` is in place. The "Versions-drawer trigger pulse" Scope bullet (per Epic 06 results Q3) is implementable as written.
- Stale-card Re-analyze with `showToast(TOASTS.reanalyzeStarted)` is already wired in `finding-card.tsx`.
- `(app)/specs/error.tsx` and `not-found.tsx` exist (Epic 03 baseline). `(auth)/not-found.tsx` and root `not-found.tsx` do not — Epic 08 correctly claims to add them.
- Sidebar hydration warning still occurs on `(app)` routes (re-confirmed during Epic 06 Playwright run).
- Quota-toast emitters: `addSpecFromUrlAction`, `repullSpecAction`, and `applyFindingAction` (Epic 06's addition) all return `{ success: false, error: { kind: 'rate_limited', retryAt } }`.
- No export action exists yet — Epic 08 introduces from scratch (correctly scoped).

**Hidden scope / oversized slices:** none.

**Missing / untestable ACs:** none. AC #18 / #19 require manual / browser verification but the requirements are specific.

**Inconsistent terminology:** none.

**Cross-epic items breaking implementation:** none. Sidebar hydration fix depends on Epic 07's async-layout conversion; Epic 08 spec already cross-references this. The `applyFindingAction` rate-limit + `patch_stale` branching pattern is correctly captured in Epic 08's toast-wiring conventions.

**NEEDS CONFIRMATION items raised by investigator (resolved at synthesis time):**

1. *Sidebar Hydration-Fix candidate (a/b/c)* — Epic 08 spec line 30 explicitly says "Investigate the root cause first, then commit to ONE of (a)/(b)/(c) and pick whichever has the lowest blast radius." This is an explicit implementation-time choice, not a refinement-time question. **No new NEEDS CONFIRMATION needed.**
2. *Versions-Pulse timing (~1.2 s)* — the new bullet committed to ~1.2 s as a default. Sub-second tuning is implementation-time polish. **No new NEEDS CONFIRMATION needed.**
3. *`TOASTS.analysisComplete` dedupe scope (per-specId vs global)* — Epic 08 spec already commits to per-specId sessionStorage with key `'apiq.analysis-complete-toast.<specId>'` (resolved per cross-epic Q5, 2026-05-02). **No new NEEDS CONFIRMATION needed.**

### Changes applied

- Updated `specs/08-export-polish-brainstorming.md` marker to add `06-patch-apply-results.md` to the `Results incorporated:` list. No spec edits.

## Outcome

Both 07 and 08 are clean against the codebase + current results set. **Phase 2 skipped — no `NEEDS CONFIRMATION` items.** Recommended next: `/refine_all` for the post-Epic-06 cross-epic consistency pass.

**Status:** Phase 1 complete. 0 `NEEDS CONFIRMATION` items.

---

# Individual Epic Review — 2026-05-02 (Pass 7, post-Epic-07)

## Summary

- **Mode:** in-dev (results 00–07 exist)
- **Specs reviewed:** 08 (1)
- **Specs skipped (completed epics):** 00, 01, 02, 03, 04, 05, 06, 07 — results files exist; never re-refined.
- **Specs skipped (already refined for current results set):** none — Epic 08 marker was missing `07-specs-list-settings-results.md`.
- **Specs modified:** none — clean against current state.
- **Specs clean:** 08
- **Triggering input:** `07-specs-list-settings-results.md` (just shipped, including the "Follow-up after user review" section that captured Q1/Q2/Q5 fixes — Radix tooltip on disabled DropdownMenuItem, three coloured pills for Findings, `unstable_cache` for the layout's workspace-name lookup with `updateTag` invalidation).

## Method

Read-only Explore agent (`spec08`) traced every assumption in Epic 08 against (a) the Epic 07 results "Follow-up after user review" section and (b) current source — `src/lib/toasts.ts`, `src/lib/workspace-cache.ts`, `src/app/(app)/layout.tsx`, `src/app/(app)/settings/actions.ts`, `src/app/(app)/specs/[specId]/spec-detail-header.tsx`, `spec-detail-view.tsx`, `finding-card.tsx`, `versions-drawer.tsx`, `specs-list-view.tsx`. Findings reported back; lead synthesized + verified the one outstanding question.

## 08 — Export + Polish (Pass 7)

### Findings

**Stale assumptions / drift:** none. Every surface Epic 08 references holds in current code:

- `TOASTS.rePullStarted` correctly removed from both spec catalog (line ~60) and `src/lib/toasts.ts` (per Pass-6 Phase-3 confirmation).
- `formatQuotaToast` import path + signature in `src/lib/toasts.ts` matches the spec.
- `formatAnalysisError` shipped at `src/lib/format-analysis-error.ts` (Epic 05); 12 unit tests pass; Epic 08 spec correctly notes the helper is already in place and only adds the budget-toast hook as a new consumer.
- `(app)/layout.tsx` is async (Epic 07) — all three sidebar-hydration-fix candidate paths (a/b/c) remain compatible with the async-server-component parent.
- Versions drawer at `src/app/(app)/specs/[specId]/versions-drawer.tsx` owns its own `open` state via `useState` (Epic 06's controlled-Sheet pattern); the trigger button currently does NOT pulse — Epic 08 adds that per AC #23.
- Epic 06's stale-card Re-analyze emits `TOASTS.reanalyzeStarted` already; rate_limited Apply emits `formatQuotaToast(error)` already (`finding-card.tsx`).
- Specs-list row actions (Epic 07) wire all four toasts in `src/app/(app)/specs/specs-list-view.tsx`: Re-analyze → `TOASTS.reanalyzeStarted` (line 210); Re-pull → `TOASTS.rePullComplete` on success (line 222) + `formatQuotaToast(error)` on rate_limited (line 228); Delete → `TOASTS.specDeleted` (line 240). Epic 08's AC #21 "seven wiring points total" enumeration matches reality. Spec-Detail header + FailedPanel are the remaining 3 sites Epic 08 owns.

**Hidden scope / oversized slices:** none. `updateTag` (Next.js 16) is now in use at `src/app/(app)/settings/actions.ts:84` for the workspace-name cache invalidation — Epic 08 spec doesn't reference this primitive, but Epic 08 doesn't introduce any new tagged caches, so there's nothing to update. Documented precedent if any Epic 08 polish work later wants to add caching elsewhere.

**Missing / untestable ACs:** none.

**Inconsistent terminology:** none.

**Cross-epic items breaking implementation:** none. Every dependency chain holds. Toast catalog state today: `reanalyzeStarted` (Epic 06) + `rePullComplete` / `specDeleted` / `workspaceUpdated` / `profileUpdated` (Epic 07) shipped; Epic 08 still owns `analysisComplete` / `patchApplied` / `patchRejected` / `applyUndone` / `rejectUndone` / `exportedJson` / `exportedYaml` plus replacing the no-op `showToast` body with a real Sonner dispatch.

**NEEDS CONFIRMATION items raised by investigator (resolved at synthesis time):**

1. *Specs-list row-action toast wiring status* — investigator flagged this as a verification point; lead grepped `specs-list-view.tsx` directly and confirmed all four `showToast(...)` calls are present (lines 210, 222, 228, 240) per Epic 07's commit `ba721e0`. Resolves to verified-clean. **No new NEEDS CONFIRMATION needed.**

### Changes applied

- Updated `specs/08-export-polish-brainstorming.md` marker to add `07-specs-list-settings-results.md` to the `Results incorporated:` list. No spec edits.

## Outcome (Pass 7)

Epic 08 is clean against the codebase + current results set. **Phase 2 skipped — no `NEEDS CONFIRMATION` items.** Recommended next: `/refine_all` for the post-Epic-07 cross-epic consistency pass.

**Status:** Pass 7 Phase 1 complete. 0 `NEEDS CONFIRMATION` items.
