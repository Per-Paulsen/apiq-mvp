# Epic 28 — Production Setup & Smoke-Test

> Final epic before launch: provision Vercel production project + Supabase production project (EU region) + DNS + SSL + Cloudflare Turnstile real keys + secret rotation + OpenRouter cost-alarm + LAUNCH-RUNBOOK + 10-scenario smoke-test pass.
> Upstream: [`prd-launch.md`](../prd-launch.md) §3 "Production setup block", §"Pre-launch checklist", [`specs/brainstorming-launch.md`](./brainstorming-launch.md) §"Production Setup".

## Scope

### Vercel production project

- Create new Vercel project named `apiq-prod` (or `<final-brand-name>` post-Naming-Workshop).
- Connect to GitHub repo's `main` branch. Auto-deploy on push to main.
- Preview deploys on PRs.
- Production domain: `apiq.dev` (or post-Naming-Workshop domain).
- Environment variables (production scope):
  - `DATABASE_URL` — Supabase production pooler URL.
  - `DIRECT_URL` — Supabase direct-connection URL (for migrations).
  - `AUTH_SECRET` — fresh 32-byte random (rotate from dev).
  - `INTERNAL_API_SECRET` — fresh 32-byte random (rotate from dev).
  - `OPENROUTER_API_KEY` — production OpenRouter key (separate from dev).
  - `TURNSTILE_SITE_KEY` + `TURNSTILE_SECRET` — real Cloudflare Turnstile keys (production widget).
  - `RESEND_API_KEY` — production Resend key.
  - `SENTRY_DSN` — production Sentry DSN.
  - `NEXT_PUBLIC_POSTHOG_KEY` — production PostHog key (EU-region).
  - `CRON_SECRET` — random 32-byte for Vercel-Cron auth (Epic 26).
  - `NEXT_PUBLIC_SITE_URL` — `https://apiq.dev`.
- Deploy-protection: enable Vercel "Deployment Protection" requiring shared-secret on preview-URLs.
- Build settings: framework auto-detect Next.js. Build cmd `npm run build`. Output `.next`. Install cmd `npm ci`.
- Output-tracing for Edge Functions enabled.

### Supabase production project

- New Supabase project, EU-Frankfurt region (or closest EU-region).
- Postgres version: 15+.
- Connection pooler enabled (Supavisor; transaction-pool mode for prod, session-pool for migrations via DIRECT_URL).
- Row-Level Security NOT enabled (apiq uses workspace-scoping at app-layer, not RLS — keep simple).
- Backups: verify daily auto-backup enabled (default on paid tier; enable PITR for free tier if available, else upgrade to Pro $25/month).
- Run all migrations from `prisma/migrations/` via `npx prisma migrate deploy` against production DB before first deploy.

### DNS + SSL + domain setup

- Domain registrar: `apiq.dev` (or post-Naming-Workshop domain) — verify ownership.
- DNS records:
  - `A` / `AAAA` records → Vercel anycast IPs (or `CNAME` to `cname.vercel-dns.com`).
  - `MX` record → Resend (for `noreply@apiq.dev`, `support@apiq.dev`, `abuse@apiq.dev`, `privacy@apiq.dev`, `founder@apiq.dev`).
  - `TXT` record SPF: `v=spf1 include:resend.com ~all`.
  - `TXT` record DKIM: per Resend setup instructions.
  - `TXT` record DMARC: `v=DMARC1; p=none; rua=mailto:dmarc@apiq.dev` (none-policy first; tighten to quarantine after 30 d clean).
  - `CNAME` `status.apiq.dev` → OneUptime status page (Epic 26).
- SSL: Vercel auto-provisions Let's Encrypt for apex + wildcard. Verify HTTPS works on launch domain.
- Email warm-up: send 100 transactional/day for first 14 days (signup verifications, welcome emails) to ramp domain reputation. Document in runbook.

### Real Cloudflare Turnstile

- Replace dev-mode Turnstile keys (existing v0.1 placeholders) with production widget keys.
- Add `apiq.dev` (and any preview-deploy domain) to Turnstile-allowed-hostnames.
- Verify Turnstile renders on signup form pre-launch.

### Secret rotation

- All secrets above (AUTH_SECRET, INTERNAL_API_SECRET, OPENROUTER_API_KEY, TURNSTILE_SECRET, RESEND_API_KEY, CRON_SECRET) generated FRESH for production.
- Document rotation procedure in `LAUNCH-RUNBOOK.md`: how to rotate each + estimated downtime.
- Schedule for first rotation: 90 d post-launch.

### OpenRouter cost-alarm

- Production OpenRouter account with daily-spend-alert at $40/24h.
- Cron probe `/api/cron/check-llm-spend` (Epic 26) wired with production OpenRouter usage API.
- Hard-cap (defensive): if SUM(`LLMCall.costUSD`) for current 24h-window > $200, refuse new analyses (return `{ kind: 'service_overloaded' }`). Recovery: alert founder via Resend.

### `LAUNCH-RUNBOOK.md`

- New file at repo root. Contains:
  - **On-call:** founder@apiq.dev + Slack-webhook (if any) + phone (private notes).
  - **Incident-response:**
    - DB down — Supabase status page + Vercel `DATABASE_URL` swap to backup project (PITR restore).
    - LLM-pipeline outage — fallback to OpenAI via OpenRouter (manual env-var swap).
    - DDoS / abuse — Cloudflare proxy enable + IP-bans via `IpActionLog`-based block-list.
  - **Rotation procedures** — for each secret.
  - **Backup-restore** — from Epic 26.
  - **Cron list** — from Epic 26.
  - **Take-down handling** — from Epic 25.
  - **Smoke-test** — the 10-scenario matrix below.
  - **First-week-launch checklist** — pre-launch (T-1d) + launch-day (T-0) + post-launch (T+1, T+7) tasks.

### Smoke-test matrix (10 scenarios)

Per `brainstorming-launch.md` §"Production Setup":

1. Anonymous Web (sample) → Magic Moments → Sign-up CTA
2. Anonymous Web (paste) → Sign-up mid-flow + Carryover (Epic 19)
3. Signup → Verify Email → Login → Upload-File → Analyze → Apply All Critical → Export YAML
4. Login → Upload-URL → Analyze → Apply All → Export JSON → Generate Share → Visit Share as Anon
5. API-Key → CLI: `apiq check + apply`
6. API-Key → MCP-Setup in Claude Desktop → Analyze via Claude
7. Anon → Get Share + Badge → Verify SVG renders + GitHub-README embed
8. Forgot-password → Reset Email → New Password → Login
9. GDPR Data-Export → Download ZIP → Verify contents
10. GDPR Account-Delete → Verify all rows gone

Each scenario: walk through manually, document outcome + screenshots in `specs/28-production-setup-smoke-test-results.md`. Block launch on any failure.

### Post-launch-week monitoring

- T+0 to T+7: founder on-call 24/7. Monitor Sentry, OneUptime, OpenRouter usage daily.
- T+7 retrospective: write `LAUNCH-RETRO.md` with metrics + issues + lessons.

## Acceptance criteria

1. Vercel production project provisioned + connected to GitHub `main`. Auto-deploy + preview-deploys functional.
2. All 11 production environment variables set + values fresh (not dev placeholders).
3. Supabase production project provisioned in EU region, all migrations applied, backups verified.
4. DNS records configured per Scope (A/CNAME, MX, SPF, DKIM, DMARC, status subdomain).
5. SSL on `https://apiq.dev` (apex) functional.
6. Turnstile real-keys replace dev-keys; signup widget renders correctly.
7. All secrets rotated fresh; rotation procedure documented.
8. OpenRouter cost-alarm at $40/24h + cron-probe + hard-cap at $200/24h functional.
9. `LAUNCH-RUNBOOK.md` exists with all sections per Scope.
10. All 10 smoke-test scenarios pass; outcomes documented in results.
11. T+0 launch-day checklist + T+7 retrospective frame written into runbook.
12. Email-warm-up plan documented (100/day for 14 days).

## Out of scope

- Manual-bug-fixing during smoke-test — if a scenario fails, the failure is recorded and the relevant epic gets a follow-up patch; this epic itself is the orchestration, not the bugfix.
- Multi-region active-active deploy — single-region (Frankfurt for DB, Vercel global Edge for app).
- Disaster-recovery drill (chaos engineering) — manual one-time backup restore is enough for v1.
- Bug bounty / pen-test — post-launch (PRD §5).
- HIPAA / SOC 2 / ISO 27001 prep — post-revenue (PRD §5).
- Custom Vercel-Edge regions — defaults sufficient.
- Custom CDN / image-CDN — Vercel-Edge sufficient.

## Domain terms

- **Production setup** — the act of provisioning Vercel + Supabase + DNS + SSL + secrets.
- **Smoke test** — the 10 manual end-to-end scenarios that gate launch.
- **`LAUNCH-RUNBOOK.md`** — operational doc covering on-call, rotation, restore, take-down, smoke-test.
- **Email warm-up** — gradually-ramped transactional volume over 14 d to establish sender reputation.
- **Hard-cap** — application-level $200/24h LLM-cost limit; refuses new analyses if breached.

## Open questions

- Final domain after Naming-Workshop: `apiq.dev` interim if no rebrand; final brand-name domain otherwise. DNS swap is straightforward (Vercel "domain" UI + DNS update).
- Vercel tier: Hobby vs Pro at launch. Pro ($20/month) gives Edge-Function 60s timeout (vs Hobby 10s) + bigger bandwidth + analytics. Recommendation: Pro from day 1 — analysis duration could exceed 10s on big specs.
- Supabase tier: Free vs Pro. Free DB sleeps after 7 d inactivity — bad for production. Pro $25/month required. Add to budget.
- Cloudflare-proxy: enable from day 1 (DDoS protection + caching) or wait for first incident? Recommendation: enable from day 1 (free tier sufficient).
- Smoke-test pass-criteria: every scenario green before announcing on HN. Tolerance: zero red. If smoke-test reveals a critical bug, delay launch by 1-2 d to fix.
