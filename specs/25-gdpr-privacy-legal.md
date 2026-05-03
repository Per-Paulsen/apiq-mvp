# Epic 25 — GDPR, Privacy & Legal

> Cookie-consent banner, GDPR data-export ZIP, GDPR account-delete cascade, Privacy Policy + Terms of Service pages, sub-processor disclosure, content-moderation/take-down policy. Privacy-promise wording corrected to honestly reflect Anthropic's 30-day retention.
> Upstream: [`prd-launch.md`](../prd-launch.md) §3 "Privacy & Legal block", [`specs/brainstorming-launch.md`](./brainstorming-launch.md) §"GDPR, Privacy & Legal".

## Scope

### Cookie-consent banner

- `npm install klaro` (open-source, GDPR-friendly, ~20 KB).
- Klaro config in `src/lib/klaro-config.ts`:
  - **Essential** (always-on): Auth-Session cookie, CSRF, Theme-pref. Cannot be opt-out (legitimate-interest).
  - **Analytics** (opt-in default OFF): PostHog (Epic 26 wires it gated by Klaro consent flag).
  - **Anti-Bot** (always-on): Cloudflare Turnstile (legitimate-interest, anti-spam).
- Mount `<KlaroBanner />` client-component in `(public)/layout.tsx` AND `(app)/layout.tsx`. First-visit shows full banner; subsequent visits respect saved consent.
- Persistent storage: `localStorage['klaro-consent']` with versioned shape; bumping version forces re-prompt.
- Settings link: User can re-open consent at `/settings/privacy` (button: *"Manage cookie preferences"*).

### GDPR data-export

- New route `/settings/privacy/export` (page) with button *"Download my data (.zip)"*.
- Server action `exportUserDataAction()`:
  - Loads all user-related rows (user, workspace, specs, versions, findings, llm-calls, workspace-action-logs, api-keys-metadata, ip-action-log filtered to this user, anonymous-analyses linked via signup-carryover IF the user has any).
  - Builds ZIP via `archiver` (~20 KB):

    ```
    user.json                       — User row sans passwordHash + token-hashes
    workspace.json                  — Workspace row
    specs/<id>.json                 — { Spec row + originalJson + currentJson }
    specs/<id>-versions.json        — array of SpecVersion rows
    specs/<id>-findings.json        — array of Finding rows
    llm-calls.json                  — array of LLMCall rows for this workspace
    workspace-action-logs.json      — array
    api-keys.json                   — { id, name, prefix, createdAt, lastUsedAt, revokedAt } (NO hashedKey, NO plaintext)
    ip-action-log.json              — entries where userId = current.user OR email = user.email (filtered)
    README.md                       — explains what each file contains
    ```

  - Streams ZIP to client via `Response` body with `Content-Type: application/zip` + `Content-Disposition: attachment; filename="apiq-data-{userId}-{date}.zip"`.
  - For workspaces with >50 specs OR estimated ZIP size >50 MB: instead of streaming, emit an async-job that emails a download-link when ready (defer to v1.1 if heuristic shows v1 users stay small).
- v1 streaming acceptable for Vercel Hobby (50 MB Response cap); guard via row-count pre-check.

### GDPR account-delete

- Route `/settings/privacy/delete` (page) with prominent button *"Delete account"* + warning text.
- Confirm modal: *"This will permanently delete your account, all specs, findings, API keys. This cannot be undone. Type DELETE to confirm."* + text input.
- Server action `deleteAccountAction()`:
  - Revokes session.
  - Hard-delete cascade in single Prisma `$transaction`:
    - User row.
    - Account, Session, VerificationToken (Auth.js standard tables).
    - Workspace row (assumes 1-user-per-workspace v1).
    - Cascade: Spec / SpecVersion / Finding / LLMCall / WorkspaceActionLog / ApiKey / SpecShare.
    - `IpActionLog` entries: anonymize, set `userId = null`, `email = null` — keep timestamps for rate-limit analytics. Do NOT delete (preserves rate-limit aggregate behavior across signup loops).
    - `AnonymousAnalysis`: not touched (not user-bound; auto-purged after 30 d).
  - On success → redirect to `/?deleted=1` (public landing) → toast *"Your account has been deleted."*.
- Two confirmation steps required to prevent accidental click (modal type-check + redirect-confirmation).

### Privacy Policy + Terms of Service pages

- `/privacy/page.tsx`, `/terms/page.tsx`, `/privacy/sub-processors/page.tsx`.
- Templated content (we are NOT lawyers; use a templated source like termsfeed/PrivacyPolicies.com base + custom apiq-specific sections):
  - **Privacy Policy** sections:
    - "What data we collect" — account info (email + passwordHash), spec content (transient processing through OpenRouter/Anthropic), analytics (consent-gated PostHog).
    - "How we use it" — service delivery + analysis pipeline + product improvement (only if consent).
    - "Sub-processors" — link to `/privacy/sub-processors` page with the 8-row table from `brainstorming-launch.md`.
    - "Retention" — User data: until account-delete. Anonymous analyses: 30 d. LLMCall metadata: indefinite (anonymized post account-delete). Anthropic processing-retention: 30 d per Anthropic's policy.
    - "Your rights (GDPR)" — access, export, delete, restrict, object. Links to `/settings/privacy` actions.
    - "Contact" — `privacy@apiq.dev`.
  - **Terms of Service** sections:
    - "Service description" — quality-gate for OpenAPI specs.
    - "Acceptable use" — no spec uploading you don't have rights to; no security-testing other parties' APIs without authorization; no high-volume automated abuse.
    - "Free during beta" — service may be limited / unavailable / paid-converted post-beta.
    - "Liability" — no warranties; not liable for downstream API changes you make based on our recommendations.
    - "Take-down policy" — abuse@apiq.dev; 72 h SLA.
    - "Termination" — we reserve the right to terminate violators.
- All pages styled per `prd-decisions.md` (zinc + violet, density). Not marketing copy.

### Privacy-promise wording (correction)

- Replace any landing-page / app-surface phrasing that says *"Analysis ephemeral"* with the corrected wording per `brainstorming-launch.md`:

  > *"We never log your spec contents in our database. Your spec is processed by Anthropic's Claude API per their data-handling policy (no training, 30-day retention for safety reviews). After analysis, we store only the structured findings, not the spec text."*

- Wait — verify: do we actually NOT log spec contents? `Spec.originalJson` and `Spec.currentJson` ARE persisted (that's how the user comes back to their spec). The honest wording is:

  > *"Your spec is stored encrypted-at-rest in our Supabase database, scoped to your workspace. We do not log spec contents in application logs. During analysis, your spec is sent to Anthropic's Claude API via OpenRouter, processed per Anthropic's data-handling policy (no training; 30-day retention for safety reviews)."*

- Apply this wording to: Landing page hero subtext, Spec-Detail header tooltip, Privacy Policy "How we use it" section, Sign-up CAPTCHA pre-text.

### Content-moderation + take-down

- Mailbox `abuse@apiq.dev` (configured in Epic 28 DNS).
- ToS clause covers content-removal-on-valid-claim.
- Internal runbook in `LAUNCH-RUNBOOK.md` (Epic 28): how to handle a take-down request — verify claimant authority, locate the spec via SpecShare or Spec ID, soft-revoke the share (`revokedAt`), or remove the Spec entirely if escalated.
- 72 h SLA pledged in ToS.
- For v1, founder personally handles abuse@. PostHog/Sentry alerts route there.

### Tests

- Vitest:
  - `exportUserDataAction` happy path on a fixture user (mock Workspace + 3 Specs + 5 Findings) → ZIP buffer contains expected files; README.md text correct.
  - `exportUserDataAction` excludes passwordHash, hashedKey, token-hashes.
  - `deleteAccountAction` cascades: after delete, no rows remain for that workspaceId; IpActionLog rows show `userId = null` (anonymized).
  - `deleteAccountAction` requires "DELETE" confirmation text.
  - Klaro consent-gating: `posthogPageView()` not called before consent; called after.
- Browser smoke check: full export-flow downloads valid ZIP; full delete-flow removes account + redirects.

## Acceptance criteria

1. Klaro installed + configured per Scope. Banner appears on first visit.
2. Three consent groups (Essential / Analytics / Anti-Bot) with correct opt-in defaults.
3. Manage-cookie-preferences link in `/settings/privacy`.
4. `/settings/privacy/export` page + `exportUserDataAction` server action.
5. ZIP contains all listed files; passwordHash + hashedKey + token-hashes EXCLUDED.
6. README.md inside ZIP explains contents.
7. `/settings/privacy/delete` page + `deleteAccountAction` with confirmation text + cascade.
8. After delete: User + Workspace + Specs + Versions + Findings + LLMCall + WorkspaceActionLog + ApiKey + SpecShare ALL removed; IpActionLog anonymized.
9. `/privacy`, `/terms`, `/privacy/sub-processors` pages exist with templated content.
10. Sub-processor table matches the 8-row catalog in `brainstorming-launch.md`.
11. Privacy-promise wording corrected across landing, app-surfaces, Privacy Policy.
12. `abuse@apiq.dev` mailbox documented in ToS + runbook.
13. Vitest tests in §"Tests" pass.
14. Browser-smoke documented: export downloads ZIP; delete cascade.

## Out of scope

- Lawyer-reviewed Privacy/ToS — templated content only for v1; review pre-launch via legal-tier-tool (e.g. Termly, Iubenda) if budget allows.
- DPA (Data Processing Agreement) generation per-workspace — v1.1 if enterprise users request.
- Right-to-rectification UI (edit user-data fields) — partially covered by existing v0.1 Settings; full GDPR-rectification UI is v1.1.
- Audit log of GDPR-action-events (export-clicked, delete-clicked) — basic logging via existing `WorkspaceActionLog`; dedicated GDPR-audit-log is v1.1.
- Multi-region data-residency — v2 if EU-only-customer demand.
- Deletion-grace-period (Trash + 7-day undo) — explicitly hard-delete in v1 per GDPR Right-to-be-Forgotten.

## Domain terms

- **Klaro** — open-source consent-banner library.
- **Sub-processor** — third-party service that processes user data on apiq's behalf (Vercel, Supabase, OpenRouter, Anthropic, Cloudflare, Resend, Sentry, PostHog).
- **GDPR data-export** — ZIP file with all rows tied to the user.
- **Hard-delete cascade** — Prisma transaction that removes all user-bound rows; IpActionLog anonymized, not deleted.
- **Privacy-promise wording** — the user-facing one-paragraph description of what we do/don't do with spec content.

## Open questions

- ZIP size limit: v1 sync-stream up to 50 MB. Trigger async-mode at >50 spec rows? Recommendation: use a heuristic (Spec count × 100 KB avg) and switch to async-mode at threshold; ship as a follow-up patch if v1 users hit it.
- Klaro vs CookieYes vs custom: Klaro chosen. Verify it doesn't add 3rd-party-cookie itself (it's open-source so no remote-server, but verify via DevTools).
- Privacy/ToS localization — English only v1; German translations later if EU-customer signal.
- DMCA / IP-take-down workflow precision: v1 = founder-judgment. Document in runbook. v1.1 may add a structured take-down submission form.
