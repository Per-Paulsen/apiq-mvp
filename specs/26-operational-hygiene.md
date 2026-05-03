# Epic 26 — Operational Hygiene

> Catch-all bundle of small operational items that each individually wouldn't justify their own epic but together establish production-baseline: Sentry, PostHog, security-headers, sitemap/robots.txt, OneUptime status page, Supabase backup verification, welcome email, contact form/mailbox, pricing page, anonymous-analysis cron-cleanup, badge-cache-tuning.
> Upstream: [`prd-launch.md`](../prd-launch.md) §3 "Operational & Hygiene block", [`specs/brainstorming-launch.md`](./brainstorming-launch.md) §"Operational Hygiene".

## Scope

### Sentry (error tracking)

- `npm install @sentry/nextjs`.
- Sentry config: `sentry.client.config.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts` per Sentry-Next.js convention.
- DSN via `SENTRY_DSN` env var. Project: EU-region.
- Configure source-map upload via `next build` (Sentry CLI hook).
- Integrate with Klaro consent (Epic 25): Sentry is essential (legitimate interest for service reliability), runs without consent.
- Filter rules: drop noise from known-benign errors (e.g. `ResizeObserver loop`, NextAuth-redirect-throws).
- Breadcrumbs: NO spec-content; redact `Spec.originalJson | currentJson` from breadcrumbs via `beforeSend` hook.

### PostHog (product analytics)

- `npm install posthog-js posthog-node`.
- Cloud project, EU-region. API key via `NEXT_PUBLIC_POSTHOG_KEY`.
- Consent-gated per Klaro (Epic 25): only initialize when `klaro.consent.analytics === true`.
- Track these events (matches PRD §7 metrics):
  - `signup_completed`
  - `email_verified`
  - `spec_uploaded` (`{ method: 'paste'|'url'|'sample' }`)
  - `analysis_completed` (`{ score, findingCount, severityBreakdown }`)
  - `apply_clicked` (`{ scope: 'single'|'critical'|'all' }`)
  - `share_link_created`
  - `badge_enabled`
  - `markdown_export_downloaded`
  - `anonymous_demo_started`
  - `signup_carryover_completed`
- Funnel definition (in PostHog dashboard): signup → first-analysis → first-apply.
- NO spec-content in any event payload.

### Security headers

- New `next.config.ts` `headers()` config returning:
  - `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
  - `X-Frame-Options: DENY`
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Permissions-Policy: accelerometer=(), camera=(), geolocation=(), microphone=(), payment=()` (minimal — apiq uses none)
- CSP NOT added in v1 — Stoplight Elements + Klaro + PostHog inline-styles make CSP brittle; defer to v1.1 with `report-only` first.

### Sitemap + robots.txt

- `npm install next-sitemap`.
- Config `next-sitemap.config.js`:
  - `siteUrl: process.env.NEXT_PUBLIC_SITE_URL`
  - `generateRobotsTxt: true`
  - Exclude: `/anon/*`, `/share/*`, `/api/*`, `/auth/*`, `/settings/*`, `/specs/*`.
  - Include: `/`, `/try`, `/docs`, `/mcp`, `/cli`, `/pricing`, `/contact`, `/privacy`, `/terms`, `/privacy/sub-processors`.
- Robots-disallow: `/anon/`, `/share/`, `/api/`. Allow rest.

### OneUptime status page

- Sign up for OneUptime free-tier cloud.
- Configure 4 monitors:
  - HTTPS check on `https://apiq.dev/api/health` every 60 s; trigger incident on 503 or timeout.
  - HTTPS check on `https://apiq.dev/` every 5 min; trigger on non-200.
  - DNS check on `apiq.dev` every 30 min.
  - Public status page at `status.apiq.dev` (subdomain in Epic 28).
- Alert routing: incident → Resend email to founder + Slack webhook (if Slack workspace exists).

### Supabase backup verification

- Manually verify Supabase auto-backups are enabled in production project settings (Epic 28 covers project setup).
- Document restore-procedure in `LAUNCH-RUNBOOK.md`:
  - How to restore PITR snapshot to a new project.
  - How to swap Vercel `DATABASE_URL` to point at restored project.
  - Estimated RTO ~30 min for Supabase Pro tier.
- Test restore on a non-prod sandbox (one-time exercise pre-launch). Document outcomes in runbook.

### Welcome email

- React-Email template at `src/lib/email/welcome-email.tsx` (template lives here; trigger is signup-flow):
  - Subject: *"Welcome to apiq"*
  - Body: 6-line plain-text style email per `brainstorming-launch.md` §"Operational" Q4 — personal voice, Reply-To founder, links to `/specs/new` + `/try`.
- Wire trigger into `signupAction` (extends Epic 23 signup): after User+Workspace creation AND after verification email sent, queue welcome email via Resend (sent on its own — not gated by verification).
- Or: send welcome AFTER email verified (cleaner UX; user only gets it after they're real). Choose: AFTER verification.

### Contact form / mailbox

- Mailbox `support@apiq.dev` configured in Epic 28 DNS.
- New page `/contact/page.tsx` with form: Name + Email + Message (textarea).
- Server action `submitContactAction({ name, email, message })`:
  - Rate-limit: 3/IP/h on `contact_form` action-key.
  - Send email via Resend to `founder@apiq.dev` with content + reply-to user's email.
  - Toast: *"Thanks — we'll reply within a few days."*
- No persistence in DB (avoid storing contact-data).

### Pricing page

- New page `/pricing/page.tsx`. Static content per `brainstorming-launch.md` §"Operational" Q5:
  - Heading: *"Pricing"*
  - Body: *"apiq is free during public beta."*
  - Cost-control during beta (3 bullets: $10 LLM-cap, 1 anonymous demo/IP/24h, unlimited samples).
  - When-beta-ends teaser ($10–20/month + free tier + 3-month-discount for beta users).
  - "Want to be invoiced or have specific needs? Contact founder@apiq.dev"
- Tone per `brainstorming-launch.md` §"Marketing": Engineer-zu-Engineer, ehrlich.

### Anonymous-analysis cron-cleanup

- Vercel Cron config in `vercel.json`:

  ```json
  {
    "crons": [
      {
        "path": "/api/cron/cleanup-anonymous-analyses",
        "schedule": "0 3 * * *"
      }
    ]
  }
  ```

- Route handler `src/app/api/cron/cleanup-anonymous-analyses/route.ts`:
  - Verifies `Authorization: Bearer <CRON_SECRET>` (Vercel-injected).
  - Runs `prisma.anonymousAnalysis.deleteMany({ where: { createdAt: { lt: subDays(new Date(), 30) } } })`.
  - Returns `{ deleted: count }`.
- Documented in `LAUNCH-RUNBOOK.md`.

### Cost-alarm on OpenRouter

- Manual: configure OpenRouter dashboard daily-spend-alert at $40 (40% of expected $100/day during launch).
- Automated: separate Vercel-Cron daily probe `/api/cron/check-llm-spend`:
  - Calls OpenRouter usage API for prior 24h.
  - If > threshold → email founder via Resend.
- Documented in `LAUNCH-RUNBOOK.md`.

### Tests

- Vitest:
  - Sentry `beforeSend` redacts spec-content fields.
  - PostHog event tracking gated by Klaro consent flag.
  - `next.config.ts` headers config returns expected headers (type-check only).
  - `submitContactAction` rate-limited at 4th call.
  - Welcome email triggers AFTER verification, not before.
  - Cron route returns 401 without `CRON_SECRET`.
  - Cleanup-cron deletes only rows >30 d old.
- Browser smoke: hit pages /pricing, /contact, /privacy, /terms — all render. /api/health returns 200. Status-page DNS resolves.

## Acceptance criteria

1. `@sentry/nextjs` installed; client/server/edge config files exist; DSN env-var; spec-content redacted.
2. PostHog installed; consent-gated; 10 events listed in §"PostHog" tracked.
3. `next.config.ts` returns 5 security headers per Scope.
4. Sitemap + robots.txt generated post-build with correct exclude/include rules.
5. OneUptime status page configured at `status.apiq.dev` with 3 monitors + 1 public page.
6. Supabase backup-restore procedure documented in `LAUNCH-RUNBOOK.md`; non-prod restore tested.
7. Welcome email template + trigger wired into signupAction (post-verification).
8. `/contact` page + `submitContactAction` + rate-limit functional.
9. `/pricing` page renders templated content per Scope.
10. Vercel Cron `cleanup-anonymous-analyses` runs daily at 03:00 UTC.
11. OpenRouter cost-alarm configured + cron-probe in place.
12. `LAUNCH-RUNBOOK.md` exists at repo root with: backup-restore, abuse@-handling, cron-list, on-call playbook (founder is on-call).
13. Vitest tests pass.
14. Smoke check documented in `specs/26-operational-hygiene-results.md`.

## Out of scope

- CI/CD pipeline (GitHub Actions for tests + build) — Epic 28 ships deployment; explicit CI is v1.1 if friction signals.
- Custom Sentry dashboards — defaults sufficient.
- Custom PostHog SQL queries — defaults + UI-builder.
- Multi-region status page — single region OK.
- Slack-channel-bot for incidents — webhook is enough for v1.
- Custom transactional-email-tracking (open-rate, click-rate) — Resend basic stats sufficient.
- Pricing-page A/B test — static for v1.
- Backup-snapshot on every deploy — Supabase auto-backup is sufficient.
- Auto-restore drill (chaos engineering) — manual one-time test pre-launch.

## Domain terms

- **Sentry** — error monitoring; redacts spec-content.
- **PostHog** — product analytics; consent-gated.
- **OneUptime** — open-source uptime monitoring + public status page.
- **`LAUNCH-RUNBOOK.md`** — operational doc at repo-root with restore + on-call procedures.
- **Cron-cleanup** — Vercel-Cron daily job removing >30 d AnonymousAnalysis rows.

## Open questions

- Sentry sample-rate: 100% in v1 (free-tier 5k events/month, low traffic). Reduce to 25% if approaching cap.
- PostHog session-recordings: opt-out by default? Recommendation: disable session-recordings entirely in v1 to minimize PII; aggregate-events only.
- Welcome-email vs welcome-toast on first login: send email + show toast on first /specs visit. Both. Toast says *"Welcome — try uploading your first spec"* with link to `/specs/new`.
- Cron-secret rotation: every 90 d via Vercel env-var update + redeploy.
- Status-page subdomain DNS handled in Epic 28; Epic 26 just configures OneUptime side.
