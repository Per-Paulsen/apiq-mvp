# Epic 19 — Anonymous Demo + Public Share

> Two viral-loop surfaces wired into one epic because they share schema + token-mechanics: (a) anonymous-demo flow at `/try` and `/anon/<token>` (1 custom analysis per IP per 24h, sample-specs unlimited via pre-baked cache); (b) public share-links at `/share/<token>` with frozen snapshots, opt-in per spec, viral OG/Twitter previews.
> Upstream: [`prd-launch.md`](../prd-launch.md) §3 "Distribution & Viral block", §2 entry-points (1) and (4), [`specs/brainstorming-launch.md`](./brainstorming-launch.md) §"Anonymous Demo", §"Public Share", §"Resolved 2026-05-03" Q4.

## Scope

### Schema additions

```prisma
model AnonymousAnalysis {
  id            String   @id @default(cuid())
  tokenForUrl   String   @unique
  ipHash        String
  specName      String
  specContent   Json     // dereferenced + cycle-restored
  findings      Json     // array of finding records (snapshot)
  qualityScore  Int
  createdAt     DateTime @default(now())

  @@index([ipHash, createdAt])
  @@index([createdAt])
}

model SpecShare {
  id           String    @id @default(cuid())
  specId       String
  spec         Spec      @relation(fields: [specId], references: [id], onDelete: Cascade)
  token        String    @unique
  expiresAt    DateTime?
  revokedAt    DateTime?
  createdAt    DateTime  @default(now())
  // snapshot fields (frozen at creation):
  specName        String
  qualityScore    Int
  severityBreakdown Json  // { critical, high, medium, low }
  findings        Json     // narration-only finding records (NO patchOps, NO spec content)
  analyzedAt      DateTime
}
```

Migration: `npx prisma migrate dev --name add_anonymous_analysis_and_share`. Add `Spec.shares: SpecShare[]` relation back-reference.

### Sample-spec pre-baked outputs

- Build-time script `scripts/build-sample-analyses.ts`:
  - Loops over `SAMPLE_ALLOW_LIST = ['openweathermap', 'stripe-sliced', 'petstore']` (Petstore added per `brainstorming-launch.md` §"Resolved 2026-05-03" Q5).
  - For each: load `openapi-examples/<name>/openapi.{json,yaml}`, run the v0.1 analysis pipeline (or a stub script that calls `runAnalysis`), write `public/samples/<name>.json` with shape `{ specName, specContent, findings, qualityScore, severityBreakdown }`.
  - Run via `npm run build:samples` — wired into `npm run build` pre-step (or `vercel-build` script).
- Sample analyses are version-controlled (committed to repo) — re-run only when prompt or sample-content changes.
- Per `brainstorming-launch.md` §"Resolved 2026-05-03" Q4: NO fake spinner — sample demos render instantly with the same Score-Reveal animation (Epic 16 / Epic 17) but no "Analyzing…" delay.

### `/try` page (anonymous demo entry)

- New route `src/app/(public)/try/page.tsx`:
  - Renders `<SpecImportPanel mode="anon" />` (Epic 15) + `<SamplePicker />` with the 3 SAMPLE entries.
  - SamplePicker click → query-param navigation to `/anon/sample-<name>` (e.g. `/anon/sample-openweathermap`).
  - SpecImportPanel submit → POST `/api/anonymous-demo` with `{ content }` → on success, redirect to `/anon/<token>`.

### `/api/anonymous-demo` route handler

- POST handler `src/app/api/anonymous-demo/route.ts`:
  - Hashes IP via existing `IpActionLog` helper.
  - Rate-limit check: 1/IP/24h on action-key `anonymous_demo_custom` (helper from Epic 24).
  - Global cost-cap check: SUM(`LLMCall.costUSD`) where `workspaceId IS NULL` (anonymous bucket) within 24h ≥ $50 → return `{ error: { kind: 'anonymous_budget_exceeded' } }`.
  - Parse + validate spec content (reuse `addSpecFromPasteAction`'s validation pipeline minus persistence).
  - Run analysis pipeline directly (without creating a `Spec` row); record `LLMCall` with `workspaceId = null` for anonymous bucket accounting.
  - Generate token: 22-char base62.
  - Create `AnonymousAnalysis` row.
  - Return `{ token }` for client redirect.
- GET handler at `src/app/api/anonymous-demo/[name]/route.ts` for sample-spec lookup: serves `public/samples/<name>.json` directly with `Cache-Control: public, max-age=3600`.

### `/anon/<token>` route (anonymous result page)

- New route `src/app/(public)/anon/[token]/page.tsx`:
  - Loads `AnonymousAnalysis` by token (or pre-baked sample if token starts with `sample-`).
  - Renders the same Spec-Detail experience as authenticated specs: Quality-Score-Hero + Findings list + Live Preview pane (Epic 18). NO Apply buttons (read-only). NO Versions drawer.
  - Top sticky banner: *"This is an anonymous analysis. [Save it →] to apply fixes and access full features."* — Save-button leads to `/signup?carryover=<token>`.
  - Auto-cleanup: 30-day retention; cleared by Vercel Cron (Epic 26).

### Sign-up carryover

- Existing v0.1 signup form (Epic 02) accepts `?carryover=<token>` query param.
- Server action `signupAction` extended: after creating User+Workspace, if `carryover` query exists and matches an `AnonymousAnalysis` row not older than 30 d:
  - Create a `Spec` row in the new workspace, copying `specContent`, `qualityScore`, `findings` (re-create `Finding` rows with `status='open'`), `analyzedAt`.
  - Delete the `AnonymousAnalysis` row.
  - Redirect post-signup to `/specs/<newSpecId>` instead of `/specs`.

### `/share/<token>` route (public share view)

- New route `src/app/(public)/share/[token]/page.tsx`:
  - Loads `SpecShare` by token. 410 Gone if `revokedAt != null` OR `(expiresAt != null AND expiresAt < now())`.
  - Renders frozen snapshot: Quality-Score-Hero + severity-breakdown + Findings list (narration only, NO patchOps, NO Apply buttons).
  - Live Preview pane available (Epic 18 reuses share-token to mount mock).
  - Footer: *"This is a snapshot of an apiq analysis. The original spec is private."* + "Try with your own spec →" CTA → `/try`.
  - Meta: `<meta name="robots" content="noindex,nofollow">`. OG/Twitter image: dynamic `@vercel/og` Edge-rendered with score-ring + spec-name.

### Share-management on Spec-Detail

- Spec-Detail header gets a "Share" dropdown:
  - **Generate share link** — calls `createShareAction({ specId })`, copies token-URL to clipboard, toast.
  - **Update existing share** (visible if a non-revoked share exists) — re-snapshot current state, asks confirm modal *"Update share link with current state?"*.
  - **Revoke share** (visible if non-revoked share exists) — sets `revokedAt`, toast *"Share link revoked."*.
- Server actions: `createShareAction`, `updateShareAction`, `revokeShareAction` in `src/app/(app)/specs/[specId]/actions.ts`.

### Rate-limit & cost-controls

- IP-based rate-limit catalog (added to Epic 24's master catalog):
  - `POST /api/anonymous-demo` — 1/IP/24h on `anonymous_demo_custom`.
  - `GET /share/<token>` — 100/IP/h on `anonymous_share_view`.
- Global anon budget cap: $50/24h via `LLMCall` SUM on `workspaceId IS NULL` records.
- Auto-cleanup cron (Epic 26): daily prune `AnonymousAnalysis WHERE createdAt < NOW() - INTERVAL '30 days'`.

### Tests

- Vitest:
  - `POST /api/anonymous-demo` happy path → AnonymousAnalysis created, token returned.
  - 2nd POST from same IP within 24h → 429.
  - Anon budget cap enforcement.
  - `signupAction` with `carryover` token → Spec created, AnonymousAnalysis deleted.
  - `signupAction` with expired/missing token → no carry, normal signup.
  - `createShareAction` happy path.
  - `revokeShareAction` sets `revokedAt`; subsequent `/share/<token>` returns 410.
  - Share-token format: 22 chars base62.
  - `AnonymousAnalysis` cleanup query selects only >30 d.
- Browser smoke check: full carryover flow (anon → see result → signup → see same result in workspace).

## Acceptance criteria

1. Schema: `AnonymousAnalysis` and `SpecShare` models exist + migration applied. Indexes per Scope.
2. `npm run build:samples` exists and produces `public/samples/<name>.json` for all 3 sample specs. Wired into `vercel-build`.
3. `/try` page renders SpecImportPanel + SamplePicker; sample-button click navigates to `/anon/sample-<name>`.
4. `POST /api/anonymous-demo` enforces 1/IP/24h, $50/24h global cap, runs analysis, creates AnonymousAnalysis, returns token.
5. `/anon/<token>` renders read-only Spec-Detail-equivalent (Quality-Score-Hero + findings + preview); shows save-CTA banner.
6. `signupAction` accepts `?carryover=<token>` and migrates AnonymousAnalysis → Spec. Redirects to `/specs/<id>`.
7. `/share/<token>` route renders frozen snapshot + preview; respects expiresAt + revokedAt; OG/Twitter meta + noindex.
8. Spec-Detail Share dropdown exposes Generate / Update / Revoke; corresponding server actions exist.
9. Rate-limit + cost-cap enforced per Scope §"Rate-limit & cost-controls".
10. Auto-cleanup query specified for Vercel Cron (Epic 26 wires the cron schedule itself).
11. All Vitest tests pass.
12. Browser-smoke documented in results: full anon→signup carryover, share-link flow, badge-fallback for revoked.

## Out of scope

- Score Badge endpoint — Epic 22.
- Markdown findings export — Epic 22.
- MCP / CLI integration with share-tokens — Epics 20/21.
- Public-share-link landing page redesign — Epic 27 (this epic only renders content).
- Anonymous BYOK / per-IP-budget-tiers — explicitly v1.1+.
- Sharing of in-progress (analyzing) analyses — must be `completed` to share.
- Analytics on share-link views (Epic 26's PostHog handles overall page analytics).

## Domain terms

- **`AnonymousAnalysis`** — DB-row representing an anon-demo result; not workspace-scoped; auto-purged after 30 d.
- **`SpecShare`** — DB-row representing a public share-snapshot; references `Spec` but its data is frozen at creation.
- **Carryover** — the act of converting an `AnonymousAnalysis` into a workspaced `Spec` during signup.
- **Token** — 22-char base62 string; one of `AnonymousAnalysis.tokenForUrl` or `SpecShare.token`. Both unguessable.
- **Pre-baked sample** — sample-spec analysis stored at build-time in `public/samples/<name>.json`; loaded instantly without LLM call.
- **Anonymous bucket** — the conceptual `LLMCall` rows where `workspaceId = null`, used for the $50/24h global cap.

## Open questions

- Spec-share-snapshot fields: do we include the spec-content (JSON) in the share record, or only the findings + score? Per `brainstorming-launch.md` §"Public Share" §L6: NO spec-content in share. Confirmed in schema (`SpecShare` has `findings` and `severityBreakdown` but NOT spec-content). Live-preview on share-page uses the LIVE `Spec.currentJson` via the Spec relation — but only if the spec hasn't been deleted/changed. **Edge case:** if user re-applies findings post-share, the live preview shows the new state, but the listed findings are frozen. Acceptable mismatch; document on share-page footer.
- Cleanup-cron timing: Vercel Cron daily at 03:00 UTC. Epic 26 confirms.
- Anonymous-demo IP-hash strategy: bcrypt vs SHA-256? Recommendation: SHA-256 with a server-side salt — bcrypt is overkill for IP-hash and creates per-request CPU cost. Verify Epic 24 alignment.
- "Update existing share" UX: should we keep historical share-records or always overwrite? Recommendation: overwrite (single share per spec); simpler. Multi-share-per-spec is v1.1.
