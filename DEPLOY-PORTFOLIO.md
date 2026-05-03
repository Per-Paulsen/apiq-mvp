# Portfolio Deploy Runbook — apiq v0.1

End-to-end checklist for deploying the v0.1 build to Vercel as a portfolio
demo. Demo-mode = pre-seeded `demo@example.com` account, daily reset cron,
landing-page banner with credentials.

> **Honest scope:** v0.1 is feature-complete (Epics 00–08) but lacks v1's
> auth-hardening, GDPR pages, prompt-injection delimiters, etc. Mitigations
> for the portfolio context are in §"Risks & mitigations" below.

---

## Phase 1 — Setup (one-time, ~30 min)

### A. Accounts (skip what you already have)

- [ ] **Vercel** — sign up at https://vercel.com (Hobby tier is fine; cron-jobs work)
- [ ] **Supabase** — sign up at https://supabase.com (Free tier works initially; consider Pro $25/mo if the project will run >7d, since Free DBs auto-pause after 7 d inactivity)
- [ ] **Cloudflare** — sign up at https://dash.cloudflare.com if not already (Turnstile is free)
- [ ] **OpenRouter** — sign up at https://openrouter.ai for a separate production key (don't reuse dev key)

### B. Provision the production Supabase project

1. Create a new Supabase project — region **EU Frankfurt** (or whichever EU region is closest).
2. Database → Settings → Database password → save it.
3. Connection strings:
   - Pooled (transaction mode, port 6543) → `DATABASE_URL`
   - Direct (port 5432) → `DIRECT_URL` (used by Prisma migrate)
4. Apply migrations:
   ```bash
   DATABASE_URL=<pooled> DIRECT_URL=<direct> npx prisma migrate deploy
   ```

### C. Provision the OpenRouter production key

1. Create a new API key on https://openrouter.ai/keys (separate from your dev key).
2. **Set a daily spend cap of $20/24h** on the OpenRouter dashboard. This is the headline abuse-protection — worst-case daily cost cannot exceed $20 even if a visitor spams Re-analyze.
3. Save the key — used as `OPENROUTER_API_KEY`.

### D. Provision Cloudflare Turnstile

1. https://dash.cloudflare.com → Turnstile → Add site.
2. Mode: Managed (recommended).
3. Hostnames: include your Vercel deploy domain (e.g. `apiq-mvp.vercel.app`). You can come back and add more after first deploy.
4. Save site key + secret key.

### E. Generate fresh secrets

Run locally (or anywhere with openssl):

```bash
openssl rand -base64 32   # AUTH_SECRET
openssl rand -base64 32   # INTERNAL_API_SECRET
openssl rand -base64 32   # CRON_SECRET
```

Save the three values; you'll paste them into Vercel.

---

## Phase 2 — Capture demo fixtures (one-time, ~5 min)

The demo workspace is seeded from pre-captured analysis fixtures so production
LLM cost on each daily reset is **$0**.

1. In your local dev environment, make sure these specs exist + are analyzed:
   - **OpenWeatherMap** — via the existing "Try sample" button on the empty Specs list
   - **Stripe** — via URL pull on a public Stripe spec URL (or use the local `openapi-examples/stripe/spec.json` via a temporary URL upload). Spec name should contain "Stripe".
2. Verify both have `analysisStatus = 'completed'` in your dev app.
3. From the repo root:
   ```bash
   npm run capture-demo-fixtures
   ```
4. Inspect `scripts/seed-fixtures/openweathermap.json` and `scripts/seed-fixtures/stripe.json`. Sanity-check that narrations look fine and no dev-only PII leaked.
5. Commit:
   ```bash
   git add scripts/seed-fixtures/
   git commit -m "chore: capture demo fixtures for portfolio deploy"
   git push
   ```

---

## Phase 3 — Vercel project (~10 min)

### A. Link the repo

```bash
npx vercel login
npx vercel link    # in the apiq-mvp directory; creates .vercel/project.json
```

Or via the Vercel dashboard: New Project → Import Git Repository → select `apiq-mvp`.

### B. Set environment variables

In the Vercel dashboard → your project → Settings → Environment Variables, add
(scope: **Production**):

| Variable | Value |
|---|---|
| `DATABASE_URL` | Supabase pooled connection string |
| `DIRECT_URL` | Supabase direct connection string |
| `AUTH_SECRET` | fresh openssl-base64-32 |
| `INTERNAL_API_SECRET` | fresh openssl-base64-32 |
| `OPENROUTER_API_KEY` | production OpenRouter key |
| `OPENROUTER_MODEL` | `anthropic/claude-sonnet-4` |
| `TURNSTILE_SITE_KEY` | from Cloudflare |
| `TURNSTILE_SECRET_KEY` | from Cloudflare |
| `DEMO_MODE` | `true` |
| `CRON_SECRET` | fresh openssl-base64-32 |

`.env.production.example` lives at the repo root as a reference.

### C. First deploy

```bash
npx vercel --prod
```

Or trigger via the dashboard ("Deploy"). First build runs Prisma generate +
Next build. ~3–5 min.

### D. First-time demo seed (against production DB)

After the deploy succeeds, seed the demo workspace ONCE:

```bash
DATABASE_URL=<production-pooled-url> npx tsx scripts/seed-demo.ts
```

You should see:
```
Demo seed complete.
  User:       demo@example.com  (password: demo)
  Workspace:  cl...
  Specs:      2
    - OpenWeatherMap  (score 75, 12 findings)
    - Stripe          (score 88, 18 findings)
  ResetAt:    2026-...
```

After this, the daily Vercel cron handles all subsequent resets at 03:00 UTC.

---

## Phase 4 — Smoke test (~10 min)

Verify the deploy works end-to-end:

1. Open `https://<your-deploy>.vercel.app/`. Landing page should show the demo
   credentials banner with a `[Open demo]` button.
2. Click `[Open demo]` → login page → enter `demo@example.com` / `demo` → log in.
3. Specs list shows 2 specs (OpenWeatherMap + Stripe) with quality-score badges.
4. Click into one spec → Findings render with narration + patches.
5. Click Apply on one finding → diff preview → confirm Apply → finding flips
   to applied state, score updates.
6. Click Export YAML → file downloads.
7. Click Versions drawer → see initial v1 + the post-Apply v2.
8. Sign up a new account (different email) → verify the public-signup path
   also works (this is the secondary demo of v0.1's full flow).
9. Manually trigger the cron once to verify reset:
   ```bash
   curl -H "Authorization: Bearer $CRON_SECRET" https://<your-deploy>.vercel.app/api/cron/reset-demo
   ```
   Should return `{ success: true, resetAt: ..., specs: [...] }`. Re-login as
   demo and confirm any test-Applies you did are reverted.

---

## Risks & mitigations (honest about v0.1 state)

| Risk | Mitigation in this deploy |
|---|---|
| No email verification → fake-email signups | Public signup is rate-limited (5/IP/h via existing `IpActionLog`) + workspace LLM cap ($10/24h) + global OpenRouter cap ($20/24h) — worst-case spend is bounded |
| No forgot-password flow → users locked out | Documented in landing-page footer / readme. Password resets aren't part of v0.1; users who forget can re-sign up with a different email |
| No Privacy Policy / ToS pages | Acceptable for portfolio-demo; v1 (Epic 25) ships these |
| No Cookie consent banner | Acceptable for portfolio-demo; Klaro lands in v1 (Epic 25) |
| Demo-account state shared across visitors | Daily reset at 03:00 UTC restores the seed; `vercel.json` cron + `/api/cron/reset-demo` route |
| LLM-cost runaway via Re-analyze spam on demo account | Demo workspace has the same $10/24h cap + global OpenRouter $20/24h cap |
| No SSRF protection on URL pull | Existing v0.1 protocol filters HTTPS-only; full SSRF hardening (RFC1918 blacklist, DNS-rebinding) lands in v1 (Epic 24). For portfolio-demo: low risk because attack-surface is the URL-pull box on signup-required path; existing rate-limit caps abuse |

If anything in this risk list bothers you, the cleanest mitigation is to add
Vercel Deployment Protection (password-gated preview/prod) for an extra
"private demo" layer. Vercel Pro ($20/mo) is required for Production-scope
password protection.

---

## Operations

### Daily reset

Runs automatically at 03:00 UTC via `vercel.json` cron entry pointing at
`/api/cron/reset-demo`. The route:
- Verifies `Authorization: Bearer $CRON_SECRET` (Vercel auto-injects it)
- Skips with `{skipped: true}` if `DEMO_MODE` isn't `"true"`
- Otherwise wipes the demo workspace's specs/findings/LLMCalls and re-seeds
  from `scripts/seed-fixtures/*.json`

### Manual reset

```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  https://<your-deploy>.vercel.app/api/cron/reset-demo
```

### Updating the demo content

1. Locally, change/re-analyze the source specs.
2. `npm run capture-demo-fixtures` to refresh the JSON fixtures.
3. Commit + push.
4. Vercel auto-deploys.
5. Either wait until 03:00 UTC for the cron, or manual-reset (above) to apply
   immediately.

### Watching costs

- OpenRouter dashboard: spend graph + alert at $20/24h.
- Supabase dashboard: row-count + storage; demo workspace stays small.
- Vercel dashboard: bandwidth + Edge function usage; demo traffic is tiny.

### Killing the deploy

If something goes very wrong:
1. Vercel dashboard → Project → Settings → Pause Deployment.
2. Or rotate `OPENROUTER_API_KEY` to disable LLM-cost source.
3. Or set `DEMO_MODE=false` in Vercel env to fall back to plain v0.1 landing
   (signup-only).

---

## Roll-forward to v1

When v1 ships (Epic 14–28 implemented), the demo-mode infra here can be
either:
- **Kept** — as the public demo-account path, alongside the now-improved
  signup flow with email verification.
- **Replaced** — by Epic 19's anonymous-demo flow (`/try` + `/anon/<token>`),
  which is more sophisticated.

In either case the `DEMO_MODE` flag + cron + landing banner are easy to leave
or remove based on how you want the v1-launch to look.
