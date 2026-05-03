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

(More questions to be added once user adds more concerns.)
