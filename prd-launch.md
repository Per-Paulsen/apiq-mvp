# Launch PRD — apiq v1

> **Status:** Draft v1, 2026-05-03. Strategic re-scoping post-Epic-08, derived from `prd-launch-brainstorming.md`.
> **Upstream context:** `prd.md` (original v0.1 product vision — stays valid as the long-term direction). `prd-decisions.md` (design system tokens). `tech-stack.md` (stack pinning).
> **Downstream artefacts:** `prd-launch.md` is the input for `/spec`-derived epic sequence (Epic 09 onward).

---

## TL;DR

apiq closed its v0.1 implementation in Epic 00–08 (single-spec analysis, narrated findings, one-click patches, version history, export). v1 is the **public-launch product** — same core loop, but:

- **Tighter positioning** — *"The quality gate for your OpenAPI specs."* — agnostic to spec-origin, with AI-tailwind in marketing subtext
- **Wider distribution** — Web app + CLI + MCP server + public-share viral loop, not just web app
- **Magic-moment UX** — Apply-All-Critical + Live Preview (Stoplight Elements + Prism mock) + Quality-Score-Hero
- **Production-ready hygiene** — full critical security + GDPR + operational baseline
- **Spike-staged scope expansion** — capability-gap-generation conditionally added if pre-launch spike succeeds

Realistic timeline: **~7–8 weeks** of engineering + spike-phase. Audience-TAM expanded from ~10–30k (original PRD) to ~80–90% of the OpenAPI market through workflow-agnostic framing.

---

## 1. Product Vision

### Tagline

> **apiq — The quality gate for your OpenAPI specs.**

### Positioning

apiq is the quality-control layer for OpenAPI specs in the AI age. It accepts any OpenAPI 3.x spec — hand-edited, framework-emitted (FastAPI / Spring / NestJS / etc.), AI-generated (Cursor / Claude / Spec Kit), or compiled from higher-level DSLs (TypeSpec / Smithy) — and produces:

- LLM-narrated findings with engineering-grade reasoning (3–5-sentence per finding, grounded in REST / OWASP / RFC 7807 / pagination patterns)
- Validated, ready-to-apply JSON Patch operations
- A deterministic Quality Score (0–100)
- An interactive live preview of the improved spec running against a mock backend

apiq does **not** lint, edit, scan-for-security-vulnerabilities, or generate-from-scratch. It assumes the user already has a spec; apiq's job is to make it production-ready.

### Audience

**Primary:** any technical user who works with OpenAPI 3.x specs and wants quality-gating before deploying / sharing / shipping. The tool is workflow-agnostic.

**Why "agnostic with AI-implicit"** rather than aggressive AI-only positioning:

- 2026 reality: ~80%+ of OpenAPI workflows are AI-touched somewhere (engineer asks Cursor → AI scaffolds FastAPI → framework emits spec → AI iterates on prompts → spec evolves). The "hand-written vs AI-generated" dichotomy is a false framing.
- Aggressive AI-only positioning excludes 70%+ of potential audience (FastAPI/Spring/NestJS users with code-first auto-generated specs)
- AI tailwind stays present in the *Marketing-Hero-Story* (HN-titles, Tweet-Threads), not in the product Pitch itself

**Secondary high-relevance subgroups:**
- **Solo / Lead Engineers** at startups designing public APIs without a senior architect to review
- **Engineers using AI coding assistants** (Cursor / Claude Code / Copilot) who want a quality-gate after AI generation
- **API platform engineers** at mid-market companies maintaining internal OpenAPI specs

**Out of audience for v1:**
- Enterprise security/compliance teams (apiq is pattern-level, not BOLA-exploitation depth — leave to 42Crunch et al.)
- Spec authoring / greenfield API design (apiq mutates existing specs, not authors new ones — leave to TypeSpec / Stoplight Studio)
- Consumers of public APIs (documentation viewers, not improvers — leave to Postman / Swagger UI)

### Strategic differentiation

In one sentence: **apiq is the only tool that combines LLM-narrated findings + ready-to-apply patches + live mock preview + quality scoring as one integrated loop.**

vs. competitive landscape:

| Tool | What it does | What apiq does that they don't |
|---|---|---|
| Spectral / Vacuum (OSS linters) | Rule-based linting → "Rule X violated" | LLM-narrated reasoning + ready-to-apply patches |
| 42Crunch (security audit) | Deep security scanning | Pattern-level + design + clarity findings (broader) |
| Stoplight Studio | GUI-based spec authoring | Read-then-mutate workflow + LLM narration |
| Postman | Lifecycle (design → test → monitor) | Specialized depth on quality-gating |
| OpenSpec (Fission-AI) | Spec-driven development *driving* AI code generation | Quality-gate at *end* of cycle (complementary, not competing) |
| Generic AI assistants (Claude / GPT projects) | Free-form chat reviews of specs | Deterministic + structured output + Apply-loop + measurable score |

### Anti-Big-AI-Lab-Threat story

If Anthropic / OpenAI / Google ship "review my OpenAPI spec" as a feature in their chat products, apiq's differentiation against general chat assistants is:

1. **Deterministic, structured output.** Validated JSON Patches with Apply mechanic + version history. Not Prosa.
2. **Live preview.** Stoplight Elements + Prism mock = see your improved spec running. Chat assistants don't render runnable mocks.
3. **Numeric quality measurement.** Score 32→78 is provable. *"Looks better now"* isn't.
4. **Systematic capability-gap detection** (if Spike (i) ships). Specific, structural. Not chat allgemein.

Plus the **distribution play**: apiq publishes an MCP server, so Claude Code / Cursor sessions integrate apiq as a tool. We integrate **into** the AI workflow rather than competing against it.

---

## 2. Core User Experience

### Four entry points → one core loop → five exit options

```
              Web Landing  CLI  MCP  Public Share
                    \      |    |    /
                     \     |    |   /
                      ↓    ↓    ↓  ↓
              ┌──────────────────────────┐
              │       CORE LOOP          │
              │                          │
              │  Analyze (45–90 s)       │ ← Magic Moment #1: Score-Reveal
              │       ↓                  │
              │  Apply All Critical      │ ← Magic Moment #2: One-click transform
              │       ↓                  │
              │  Live Preview            │ ← Magic Moment #3: see your API run
              └──────────────────────────┘
                            ↓
            ┌─────┬─────┬─────┬─────┬─────┐
        Export  Markdown  Share  Badge  MCP-roundtrip
```

### Three magic moments (where engagement spikes)

**Magic Moment #1 — Score-Reveal.** During analysis, smart loading hints replace generic spinners (*"Reviewing your endpoints… Checking for design patterns… Looking for capability gaps…"*). On completion, animated reveal: **"Your spec scored 32 / 100"** — color-coded SVG ring (red <60, amber 60–79, green ≥80) + severity breakdown (3 critical · 5 high · 4 medium · 2 low).

**Magic Moment #2 — Apply All Critical.** Prominent severity-color-coded button. One click → 3 patches applied → score animates 32 → 53 → finding cards flip to "applied" state with green markers → versions-drawer trigger pulses. User has just solved 3 real problems in 3 seconds.

**Magic Moment #3 — Live Preview.** Stoplight Elements renders the improved spec interactively. Endpoints browsable left, request/response schemas right, **"Try It"** button on each endpoint hits a Prism mock backend. User clicks POST `/orders` → sees a real response in 200 ms. *Their own API*, just improved, *running before their eyes*.

### Per-entry-point flows

#### (1) Web Landing — HN/Twitter/Reddit-driven traffic

```
Visit / → "Paste your spec or try a sample" CTA prominent
   ↓ (no signup)
Click "Try sample" → 60s analysis on OpenWeatherMap (or Petstore)
   ↓
Magic #1 → Magic #2 → Magic #3
   ↓
"This was a sample. Try with your own spec →"
   ↓ (no signup yet — anonymous)
Paste/Upload own spec → Anonymous Analysis (1 free per IP/24h)
   ↓
After own analysis: "Save this analysis? Sign up free →"
   ↓ Signup-Wall (Conversion at peak value-perception)
Account created → continue with Core Loop unlimited
```

**Anonymous Demo Policy:** sample specs unlimited. Custom specs: 1/IP/24h. Public-share-links: unlimited anonymous.

#### (2) CLI — Engineer's terminal

```
Engineer reads about apiq → `npx apiq check ./openapi.yaml`
   ↓
Output: markdown report with findings + score (sent to apiq backend, returned to terminal)
   ↓
`npx apiq apply ./openapi.yaml --critical-only` → file modified in place
   ↓
`git diff` → review → commit
   ↓ optional:
`npx apiq preview ./openapi.yaml` → opens localhost:5173 with Stoplight Elements + local Prism
`npx apiq share ./openapi.yaml` → uploads, returns public-share-link
```

CLI auth: optional. Anonymous CLI calls run with the same anonymous-demo limits as Web. Authenticated CLI uses an API key (stored in `~/.apiqrc`) and shares the workspace's cap.

#### (3) MCP — Cursor / Claude Code / Continue session

User adds apiq's MCP server config once (copy-paste from `apiq.dev/mcp`). Then in any AI session:

```
Engineer asks Claude to scaffold or modify an OpenAPI spec
   ↓
Claude sees apiq MCP tools registered
   ↓
After spec generation, automatic call: `apiq.analyze({ spec })`
   ↓
Claude receives findings + score
   ↓
Cursor surface: "apiq found 14 issues. Apply critical? [Yes / Review first]"
   ↓
Yes → `apiq.apply({ spec_id, scope: 'critical' })`
   ↓
Claude updates the spec in the editor
```

Engineer never opens apiq's web UI — apiq is part of the AI toolchain.

#### (4) Public Share — viral

```
Friend tweets "Look at apiq's analysis of Stripe's API: <link>"
   ↓
Recipient clicks /share/abc123 → sees Stripe-Analysis (no signup)
   ↓
Sees Quality Score 73/100 + findings
   ↓
"Try with your own spec →" CTA
   ↓
Mündet in Web Landing Flow (1)
```

Share-link does NOT contain spec content (privacy) — only the findings + score + spec-name + analysis-timestamp.

### Five exit options

1. **Export YAML/JSON** — improved spec for repo commit
2. **Markdown Findings** — for Slack/PR-comment OR AI-Roundtrip prompt (*"AI, regenerate the spec with these fixes"*)
3. **Public Share Link** — `/share/<token>` — viral mechanism
4. **Score Badge** — `<img src="apiq.dev/badge/<spec-id>">` — embed in GitHub README; passively advertises apiq via every repo view (Codecov / Coveralls pattern)
5. **MCP Roundtrip** — findings flow back to Cursor / Claude Code → AI fixes the source code that emits the spec (closes the code-first loop)

---

## 3. Build Scope (v1 Pre-Launch)

Total Engineering: **~36–42 days** (~7–8 weeks calendar, full Critical-Gap-Fix Option α).

Plus spike-phase: ~8–10 days (Phase 0 + conditional Phase 1).

### Foundation block (~7–9 days)

The core feature additions to apiq's existing v0.1 codebase.

| Item | Effort | Description |
|---|---|---|
| 3 Pre-Launch Spec-Fixes | 1–2 d | Re-validate-after-apply (`swagger-parser.validate()` after every apply); re-bundle `$refs` on export (`swagger-parser.bundle()`); cycle-marker → real-`$ref` roundtrip on export |
| Export-Time Validation Safety-Net | 1 h | Final `swagger-parser.validate()` immediately before serialization, always |
| Export-Validation-Failed Error UX | 2 h | Refuse export + show validation issues + offer Re-Analyze (no auto-fix in v1) |
| Paste/Upload Spec Import | half d | Textarea paste + drag-drop file upload; auto-detect JSON/YAML; reuses validation pipeline |
| Apply-All-Critical | 1 d | Severity-color-coded prominent button; applies all `severity: critical` open findings in order, skips conflicts |
| Apply-All (with confirm dialog) | 1 d | Secondary button; confirm-modal lists what will apply ("12 findings, 3 critical, 5 high, 4 medium"); applies severity-ordered, skips stale |
| Stoplight Elements + Prism Live Preview | 4–5 d | Embed `<elements-api>` web component as third pane; ephemeral Prism mock per spec (Vercel function, 24h auto-cleanup); Try-It buttons hit the mock |
| Markdown Findings Export | half d | Export findings as structured markdown — for Slack/PR-comments and AI-Roundtrip prompts |

### Distribution & Viral block (~4–6 days)

| Item | Effort | Description |
|---|---|---|
| MCP Server | 1–2 d | Anthropic MCP-protocol-compliant; exposes `apiq.analyze`, `apiq.apply`, `apiq.get_findings` tools; published as `@apiq/mcp-server` npm |
| MCP Setup Doc Page | 2 h | apiq.dev/mcp with copy-paste-ready JSON snippets for Claude Code, Cursor, Continue |
| CLI | 2 d | `apiq check / apply / preview / share` commands; published as `@apiq/cli` npm; auth via `~/.apiqrc` API key |
| Anonymous Demo (sample + 1/IP/24h custom) | 1–2 d | No-signup flow on `/try` and `/share`; IP-based rate-limit on custom-spec analysis |
| Public Share Links | 1 d | `/share/<token>` route; analysis snapshot stored, spec content NOT included; OG/Twitter cards |
| Score Badges (hosted SVG) | 1 d | `apiq.dev/badge/<spec-id>` SVG endpoint; color-coded score; cache 30min; markdown-embed-ready |

### Security block (~1.5–2 days)

#### Blocking (must-fix before any public access)

| Item | Effort | Description |
|---|---|---|
| SSRF Hardening on URL-Pull | 2 h | HTTPS-only; resolve DNS via public resolver (no DNS rebinding); blacklist RFC1918 / RFC4193 / loopback / link-local IP ranges |
| GDPR Cookie Consent Banner | half d | Klaro or similar; "essential cookies only" by default; opt-in for analytics |
| GDPR Data-Export + Account-Delete | 1 d | Settings buttons → ZIP download / cascade delete |
| Open Graph + Twitter Card Meta | 1 h | Per-route meta tags + dynamic preview-image generation for share-links |

#### High (strong recommend)

| Item | Effort | Description |
|---|---|---|
| Prompt-Injection Hardening | half d | Wrap user-content in `<<<SPEC_CONTENT>>>` delimiters; system-prompt explicit "data not instructions"; output regex-flag for inject-patterns |
| XSS Hardening Spec-Content Render | 2 h | DOMPurify on all user-strings rendered in UI |
| IP Rate-Limit on All Non-Auth Endpoints | 2 h | Generic helper; applied to anonymous-demo, share-link views, badge endpoint |
| Health-Check Endpoint | 30 m | `/api/health` returns 200 + DB connection status; 503 if DB down |

### Auth & Account block (~2–2.5 days)

| Item | Effort | Description |
|---|---|---|
| Email Verification on Signup | 1 d | Auth.js Email provider + Resend transactional email |
| Forgot-Password Flow | 1 d | Reset-token + email template + UI |
| Login Rate-Limit (per IP + per email) | half d | Mirror IpActionLog pattern from Epic 02 |
| Bcrypt Cost-Factor 12+ | 1 h | Increase from default 10 |

### Privacy & Legal block (~1.5 days)

| Item | Effort | Description |
|---|---|---|
| Privacy Policy + Terms of Service Pages | 1 d | Templated content + sub-processor disclosure (OpenRouter / Anthropic) + acceptable-use policy |
| Privacy Promise on Landing + Spec-Detail | 2 h | *"We never log spec contents. Analysis ephemeral. Encrypted at rest in your workspace."* |
| Sub-Processor Disclosure | 1 h | Listed in Privacy Policy + on dedicated `/privacy/sub-processors` route |
| Content-Moderation + Take-Down | 1 h | `abuse@apiq.dev` mailbox + ToS clause |

### Operational & Hygiene block (~2–3 days)

| Item | Effort | Description |
|---|---|---|
| Sentry / Error Tracking | 2 h | Server + client integration |
| PostHog / Analytics | half d | Self-hosted or Cloud, GDPR-mode |
| Comprehensive Security Headers | 30 m | HSTS / X-Frame-Options / X-Content-Type-Options / Referrer-Policy / Permissions-Policy via `next.config.js` |
| Sitemap + robots.txt + Canonical URLs | 2 h | next-sitemap |
| Status Page | half d | Better Stack / Statuspage.io / OneUptime — basic incident communication |
| Database Backup Verification + Rollback Doc | 1 h | Verify Supabase auto-backups enabled + document restore procedure in `LAUNCH-RUNBOOK.md` |
| Welcome Email post-Signup | 2 h | Resend template via signup-action |
| Contact / Support Channel | half d | `support@apiq.dev` mailbox + `/contact` form |
| Pricing Page (*"Free during beta"*) | 2 h | Static `/pricing` route + future-pricing teaser |

### Marketing surfaces block (~3–4 days)

| Item | Effort | Description |
|---|---|---|
| Landing Page (`/`) | 2–3 d | Hero with tagline; Try-Sample CTA prominent; demo-flow embedded; agnostic copy |
| Empty-State for Specs List | half d | Try-with-sample CTA + 3-4 sample-spec options |
| Marketing Copy on All Surfaces | half d | Agnostic with AI-implicit; no preachy language |
| Onboarding Loading Hints | 2 h | Smart hints during analysis (*"Reviewing your endpoints…"*) |

### UI Redesign block (structured surgical, ~6.5 days)

| Item | Effort | Description |
|---|---|---|
| Sidebar Restructure | 1 d | Sections (WORKSPACE / TOOLS / RESOURCES) + sub-items + footer user-menu — fills 256px geometry |
| Command Palette (Cmd+K) | 1.5 d | cmdk lib; navigate / actions / search; Linear-style |
| Spec Detail Three-Pane Layout | 1 d | Endpoints / Findings / Preview (collapsible right pane) |
| Quality Score Hero | half d | Big number + SVG ring + severity breakdown |
| Apply-All-Critical + Apply-All Buttons | (in Foundation block) | — |
| Empty States Polish | half d | Density-aware, no illustrations |
| General Density Pass | 1 d | Typography refinement + spacing audit + component compaction |

### Naming & Brand block (~1–2 days, post-PRD)

| Item | Effort | Description |
|---|---|---|
| Naming Workshop | 1 d | Trademark-search (USPTO + EUIPO) + domain availability + GitHub-org + npm-package availability |
| Logo + Brand Assets | 1–2 d | Logo + favicon variants + color-palette refinement |

### Production setup block (~1.5–2 days)

| Item | Effort | Description |
|---|---|---|
| Vercel Production Project + Deploy Pipeline | half d | GitHub integration, environment variables, deploy-protection |
| Supabase Production Project | half d | Migrations, backup-settings, connection-pool sizing |
| DNS + SSL + Domain Setup | 2 h | DNS records, Vercel domain mapping |
| Real Cloudflare Turnstile + Secret Rotation | 1 h | Replace dev placeholders for AUTH_SECRET, INTERNAL_API_SECRET, OpenRouter prod-key |
| Cost Alarm on OpenRouter | 1 h | Daily-spend threshold notification |
| Smoke Test Production Domain | 2 h | Full-flow signup → spec → analyze → apply → export → share |

---

## 4. Spike Strategy

Pre-engineering, staged. Hard cancel-thresholds after each phase.

```
Phase 0: Big-Spec Architecture Spike
   Tests: Bigger Context (model swap) vs naive Chunking (with shared schemas)
          vs Two-Call (Haiku-per-endpoint + Sonnet-aggregation)
   Effort: 3–5 days
   Conditional: NO — required regardless of which Phase 1+ outcome
   Cancel: never (we need this answer)
   Output: clear winning approach + endpoint-cap raised from 200 to 1000+

Phase 1: Capability-Gap-Generation Spike
   Tests: can the LLM reliably spot domain-pattern gaps in real specs?
   Effort: 5 days
   Conditional: YES — only if Phase 0 done
   Cancel-Threshold: <50% of suggestions land as relevant on test specs → cancel,
                     defer (i) to v1.1
   Probability of success: ~60–70%

Phase 2: Business-Improvements Spike
   Tests: with explicit business-context input, can the LLM produce
          strategically-relevant business-level improvement suggestions?
   Effort: 5 days
   Conditional: YES — only if Phase 1 successful
   Cancel-Threshold: <40% relevance OR business-context input UX too clunky → cancel
   Probability of success: ~30–40%

Phase 3: Implementation-Hints Spike
   Tests: can the LLM produce stack-specific (FastAPI / Spring / NestJS)
          implementation suggestions that are correct enough to ship?
   Effort: 7 days
   Conditional: YES — only if Phases 1+2 successful
   Cancel-Threshold: <25% correctness on independent code-review → cancel
   Probability of success: ~15–25%
```

**Realistic spike-phase length:** 3–12 days depending on cancel cascade. Most likely scenario: Phase 0 (5 d) + Phase 1 success (5 d) + Phase 2 cancel (after 2 d evaluation) = ~12 days total.

**If Phase 1+ fail:** spike-phase is 5 days, capability-gap is v1.1 territory, v1 ships with the existing Apply loop only.

**If Phase 1 succeeds:** capability-gap-generation ships in v1 as a hero differentiator (*"AI agents miss endpoints. apiq spots the gaps."*). Engineering effort to implement: ~2 days on top of spike-validated prompt.

---

## 5. Out of Scope (v1)

Explicit non-goals. Each item has a reason and a future-version-hint where relevant.

| Out of v1 | Reason | Future |
|---|---|---|
| Capability-Gap-Generation implementation (without Phase-1 success) | Spike-conditional | v1.1 if spike defers |
| Business-Improvements (Phase 2) implementation | Spike-conditional | v1.1+ |
| Implementation-Hints (Phase 3) implementation | Spike-conditional + high hallucination-risk | v1.2+ |
| Code-First mode (stack-specific code patches for FastAPI / Spring / NestJS) | Massive scope; needs separate spike per stack | v2 |
| Multi-File Spec Upload (modular specs with split `$refs`) | Most AI-emitted + framework-emitted specs are single-file | v1.1 |
| GitHub PR Integration / GitHub App | CLI covers most CI use-cases for v1 | v1.2 |
| Drift Detection (re-analysis on schedule, change diffs) | Requires versioning + scheduled jobs infrastructure | v0.4 Governance |
| Cross-Spec / Landscape (multi-spec aggregation) | Different product-shape | v0.2 Landscape |
| Generation (net-new endpoints from gaps via PR) | Different product-shape | v0.3 Generation |
| 2FA / SSO / SAML | Enterprise scope; v1 audience is solo / small-team | v2+ |
| Audit Log for workspace actions | Single-user-per-workspace in v1 | v2 (multi-user) |
| BYOK (Bring Your Own OpenRouter Key) | Operational complexity; cap-based works for v1 | v1.1 |
| Self-Hosted Mode (Docker / Helm chart) | Enterprise scope | v2+ |
| TypeSpec Roundtrip (back-port apiq diff to TypeSpec source) | TypeSpec users are subset, manual port works | v1.1 |
| Stripe-Metered Billing | Not needed during free-beta | v1.1+ once product-market-fit signal |
| Trademark Filing | Workshop after launch | post-launch |
| Mobile-Responsive Layouts (beyond band-aid) | Engineer-tool, desktop-first | not on roadmap (per `prd.md`) |
| i18n | English first | v2+ |
| Formal a11y Audit (WCAG AA+) | Best-effort via shadcn defaults | v2+ |
| Bug Bounty Program | Premature for v1 audience size | post-traction |
| Liability Insurance for SaaS | When revenue starts | post-monetization |

---

## 6. Distribution Strategy

Three primary channels at launch. Marketing-effort-budget is **smaller than build-effort** — distribution is mostly built into the product mechanics, not paid acquisition.

### (a) HN-style launch

Hacker News + r/programming + dev.to + DevTwitter coordinated launch. Content:

- HN-Title: *"Show HN: apiq — Find what's wrong with your OpenAPI spec"*
- Tweet-thread anchor: *"I asked Claude to write me an OpenAPI spec. apiq found 14 things wrong with it. Here's what was wrong + how I fixed it in 60 seconds."*
- Demo-loom video (~60s) showing Magic Moments
- Links to public-share-link of a famous public API analysis (e.g., GitHub, Stripe — picked carefully for content + lawful-comment angles)

### (b) npm + MCP distribution

- Publish `@apiq/cli` to npm — listed on [openapi.tools](https://openapi.tools/), awesome-openapi
- Publish `@apiq/mcp-server` to npm — listed in MCP-server registries (Anthropic's catalog, awesome-mcp-servers)
- Release-notes / changelog on GitHub for both

Engineers discover apiq through their existing npm + AI-tool flow, not just through marketing.

### (c) Score-Badge viral

Every README that embeds an apiq Score Badge is passive advertising. Codecov / Coveralls established this pattern; apiq applies it to API quality. Click-through from badge → public-share-link → conversion.

### What we explicitly do NOT do

- Paid ads (no budget; audience is too narrow for ROI)
- Influencer outreach (premature)
- Cold sales / enterprise pitches (out of audience for v1)
- Conference-talks (timing wrong for v1; consider post-launch)
- Open-source community-events / contributing to other OSS projects as marketing (post-launch)

---

## 7. Success Metrics

What "good" looks like 30 days after launch.

### Primary metrics

| Metric | Bear | Base | Bull |
|---|---|---|---|
| Total signups in 30d | 100 | 500 | 2,000 |
| % completing first analysis | 50% | 70% | 80% |
| % applying ≥1 finding | 30% | 50% | 65% |
| % returning within 7 days of signup | 10% | 20% | 35% |
| Public-share-links created | 50 | 200 | 800 |
| Score-badges embedded in public repos | 5 | 25 | 100 |
| MCP-server installs (npm downloads/week) | 50 | 250 | 1,000 |
| CLI installs (npm downloads/week) | 30 | 150 | 600 |

### Secondary metrics

- Mean Quality-Score-improvement per Apply session (signal: are findings actually valuable?)
- LLM-cost per active user per month (signal: is the unit-economy viable for monetization later?)
- Time-from-signup-to-first-Apply (signal: is the funnel friction-free?)
- Stale-finding rate (signal: are LLM patches well-calibrated?)

### What "this didn't work" looks like

- <100 signups in 30 days = positioning didn't resonate, retry positioning before more launches
- <30% completing first analysis = onboarding broken
- <10% retention at 7 days = product is genuinely one-shot, retention-feature-development needed
- Cost per active user >$5/month with <10% paid-conversion-prospect = unit-economy doesn't work, monetization-pivot needed

---

## 8. Risks & Mitigations

### High-impact risks

**(R1) Big-AI-Lab launches "review my OpenAPI" feature.**
- Probability: 30% within 12 months
- Impact: high (eats half the differentiation)
- Mitigation: ship MCP server early to integrate INTO their workflows; emphasize structured / measurable / live-preview differentiators that don't replicate cleanly in chat; position apiq as adjacent specialty, not a competitor

**(R2) Spike Phase 0 fails — no architecture works for big specs.**
- Probability: 10% (multiple paths in Phase 0; one will work)
- Impact: high (limits TAM to small specs, hurts Stripe/GitHub gallery demo)
- Mitigation: fall back to enforcing 200-endpoint cap explicitly; communicate as v1 limitation; gallery uses smaller specs

**(R3) LLM costs spiral with anonymous-demo abuse.**
- Probability: 30%
- Impact: medium (operating costs, not existential)
- Mitigation: IP rate-limit (1/IP/24h) + workspace-cap ($10/24h) + cost-alarm; aggressive ban-list for repeat-abuse IPs; can switch to BYOK if it gets bad

**(R4) GDPR / privacy complaint from EU user.**
- Probability: 15%
- Impact: high (legal cost, brand damage)
- Mitigation: full Critical-Gap-Fix in v1 (cookie banner, data-export, account-delete, sub-processor-disclosure)

**(R5) Audience just doesn't show up.**
- Probability: 30%
- Impact: critical (no validation = no business case)
- Mitigation: success-metrics define "didn't work"; after 30 days re-evaluate positioning before reinvesting

### Medium-impact risks

- Naming-workshop yields no acceptable name with available domain → use `apiqual.dev` or similar interim, defer rebrand
- Stoplight Elements has breaking changes → pin version in package.json
- Prism mock-server resource cost > expected → Vercel function timeout instead of always-on
- Onboarding email blacklisted → setup SPF/DKIM/DMARC; warm up sender domain

### Low-impact risks

- Open-source-license incompatibilities → audit dependencies post-launch
- Performance issue at >100k specs → DB indexes audit + caching layer (post-launch concern)
- One-shot-product-fatigue → roadmap items (v0.4 drift detection) directly address

---

## 9. Timeline

Realistic estimate. Can compress by 1–2 weeks with full focus + no surprises.

```
Week 1:        Spike Phase 0 (Big-Spec Architecture)
Week 2:        Spike Phase 1 (Capability-Gap-Generation, conditional)
                + Naming Workshop (parallel)
Weeks 3–4:     Foundation + Distribution & Viral
                + Logo / Brand Assets (parallel)
Weeks 5–6:     Security + Auth & Account + Privacy & Legal + UI Redesign
Week 7:        Operational & Hygiene + Marketing Surfaces
                + Spike Phase 2/3 implementation (if conditional success)
Week 8:        Production Setup + Smoke-Test + Launch-Prep + Final Brand-Polish
                  → LAUNCH

Post-launch Week 1:    Monitor metrics, on-call for issues
Post-launch Week 2-4:  Iterate based on user feedback
```

**Earliest possible launch:** ~5 weeks (no spike-conditional features, all critical-gap-fix done, lucky).
**Realistic launch:** ~7–8 weeks.
**Conservative launch:** ~10 weeks (Phase 0 has surprises, naming workshop drags, UI redesign needs second pass).

---

## 10. Open Questions for Implementation

These are decisions that should be made *during* the build phase, not before. Listed here so they don't get lost.

1. **Naming workshop output** — pending; happens after PRD approval.
2. **Big-Spec architecture winner** — pending Phase 0 spike.
3. **Capability-Gap implementation** — pending Phase 1 spike.
4. **Pricing-page exact wording** — *"Free during beta"* + future-pricing-teaser; tone tbd.
5. **Sub-processor disclosure list** — definitive list of who actually receives spec data (currently: OpenRouter + Anthropic; verify if others e.g. Vercel-edge-cache, Sentry, PostHog).
6. **Sample-spec-picker default** — OpenWeatherMap (current sample) + which 2-3 others? Petstore is obvious; Stripe/Twilio risky-but-impressive.
7. **MCP-server tool surface** — minimum viable: `analyze`, `apply`, `get_findings`. Should we also expose `share` (return public-link) and `score` (just the number)?
8. **CLI auth-mechanism** — `~/.apiqrc` with API key; how does API-key revocation work? Settings page?
9. **Public-share-link expiration policy** — never? 1 year? 90 days?
10. **Score-badge cache TTL** — 30min? 1 hour? Trade-off freshness vs CDN-load.
11. **Anonymous-demo cleanup** — anonymous analyses kept how long? Per IP? Auto-delete after N days?
12. **Onboarding loading-hints** — exact wording per phase + animation timing.

These will be resolved in the relevant epic specs derived from this PRD.

---

## 11. Roadmap (post-v1)

Post-launch direction, in rough priority order. Decisions on what ships in v1.1 / v1.2 / v2 are made *after* v1 launch based on usage data.

### v1.1 candidates (3-month-post-launch window)

- Capability-Gap-Generation implementation (if Phase 1 spike defers)
- Business-Improvements implementation (if Phase 2 spike defers)
- BYOK (Bring Your Own OpenRouter Key)
- Multi-File Spec Upload
- TypeSpec Roundtrip
- GitHub PR Integration / GitHub App
- Stripe-Metered Billing
- Server-Stub-Codegen download

### v1.2 candidates (6-month-post-launch window)

- Implementation-Hints (if Phase 3 spike defers)
- Drift Detection (re-analysis on schedule)
- Multi-User per workspace (Audit Log + roles)

### v2 candidates (12-month-post-launch window)

- Cross-Spec / Landscape
- Code-First mode (stack-specific code patches)
- Self-Hosted / Enterprise edition
- 2FA / SSO / SAML
- i18n
- Mobile-responsive proper redesign
- Generation (net-new endpoints from gaps)

### Direction-shifting items (revisit-only-with-data)

- Pivot to OSS distribution (CLI-first, web-app secondary)
- Pivot to vertical-specific tooling (e.g., apiq-for-banking, apiq-for-e-commerce)
- Sunset and pivot to adjacent product

---

## Document control

| Version | Date | Author | Notes |
|---|---|---|---|
| Draft v1 | 2026-05-03 | Claude Code | Derived from `prd-launch-brainstorming.md` |

**Approval-state:** awaiting user review.
**Upstream-context:** `prd.md`, `prd-launch-brainstorming.md`, `prd-decisions.md`, `tech-stack.md`, `CLAUDE.md`.
**Downstream-artefacts:** Epic 09+ specs derived via `/spec prd-launch.md`.
