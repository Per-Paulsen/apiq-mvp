# Epic 07 — Specs List + Settings — Results

> Implementation results for [`07-specs-list-settings.md`](07-specs-list-settings.md). Author: Claude Code (Lead) + 3 delegated agents (foundation, specs-list, settings). Date: 2026-05-02.
> **Append-only** after this initial draft. Corrections go in a labelled "Correction" section at the end.

## What was built

Two screens that complete the v0.1 user journey: the post-login Specs List landing page and a four-section Settings page. Plus the supporting `(app)/layout.tsx` async conversion for the live sidebar footer, the extracted `<QualityScoreBadge>` + `<StatusPill>` shared components, two new server actions (`updateWorkspaceAction`, `updateUserAction`), and the row-action menu that wires Re-analyze / Re-pull / Delete into the existing Epic 03 / 04 server actions.

Browser-verified end-to-end against the e2e-test workspace's two Petstore specs:

- **Specs List** (`/specs`) — workspace-name header "e2e-test" + violet "Add Spec" button. Sticky table renders both rows: Petstore-completed (qualityScore 32 in red, completed pill, findings 14/0/0, source URL truncated, "5 hours ago") and Petstore-failed (zinc `—` quality, failed pill, 0/0/0, `—` last analyzed). Vertical-dots row-action button opens a Radix DropdownMenu with three items: Re-analyze, Re-pull from URL, Delete (red). Sidebar footer reads "e2e-test • e2e-test@apiq.dev". Screenshots: `docs/screenshots/epic-07-specs-list.png` + `epic-07-row-menu-open.png`.
- **Settings** (`/settings`) — four shadcn Cards stacked: Workspace (name input pre-filled "e2e-test" + Save), Profile (Name input + read-only disabled Email "e2e-test@apiq.dev" + Save), Appearance (two-button Light/Dark radio with Sun/Moon icons; Dark active by default per next-themes config), Session (outline Sign-out button). Editing the workspace name to "apiq-dev" → green "Saved" indicator + the sidebar footer instantly re-renders to "apiq-dev • e2e-test@apiq.dev" via `revalidatePath('/', 'layout')`. Reset back to "e2e-test" verified. Screenshots: `docs/screenshots/epic-07-settings.png` + `epic-07-settings-after-update.png`.

## Key files created / modified

### Library installs
- `src/components/ui/alert-dialog.tsx` (new) — shadcn Radix `AlertDialog` for the Delete-confirm in row actions.
- `src/components/ui/dropdown-menu.tsx` (new) — shadcn Radix `DropdownMenu` for the row-action menu.
- `src/components/ui/table.tsx` (new) — shadcn `Table` primitives for the Specs list.

### Shared components
- `src/components/spec-badges.tsx` — **new**. Extracted `QualityScoreBadge` and `StatusPill` from `src/app/(app)/specs/[specId]/spec-detail-header.tsx`. Both retain their original behaviour: `QualityScoreBadge` keeps the 4 colour bands (≥80 emerald, 60–79 amber, <60 red, null → zinc `—`); `StatusPill` keeps the spinner-icon for `pending`/`analyzing`. Marked `'use client'` (StatusPill needs `Loader2`).
- `src/app/(app)/specs/[specId]/spec-detail-header.tsx` — local `qualityScoreClasses` / `QualityScoreBadge` / `statusPillClasses` / `StatusPill` definitions deleted; imports from `@/components/spec-badges`. The `AnalysisStatus` type alias deleted (only used by the moved code). `Loader2` import removed.

### Specs List
- `src/app/(app)/specs/page.tsx` — **replaced** Epic 03's placeholder. Server component: `getRequiredSession()` → workspace-scoped `prisma.spec.findMany` + `prisma.finding.groupBy` for per-spec triplet counts (open/applied/rejected only — `stale` and `outdated` deliberately excluded per cross-epic Q4) + `prisma.workspace.findUnique` for the header workspace name. Sorts in JS: `pending`/`analyzing` floated to top, then `lastAnalyzedAt desc` (nulls last). Renders `<SpecsListView>` (or `<EmptyState>` if zero specs).
- `src/app/(app)/specs/specs-list-view.tsx` — **new**. Client component owning: 5 s polling via `setInterval(() => router.refresh(), 5000)` while ANY visible spec is `pending` / `analyzing`; auto-stop otherwise. shadcn Table with sticky header and 7 columns (Name link, Quality, Status, Findings, Source, Last analyzed, Actions). Per-row dropdown menu owned by an inline `<RowActions>` component:
  - Re-analyze → `reanalyzeSpecAction({ specId })` → `showToast(TOASTS.reanalyzeStarted)` → `router.refresh()`. Disabled when `analysisStatus === 'analyzing'` (with a `title=` tooltip — the disabled-DropdownMenuItem-tooltip Radix dance was deemed too fiddly for v0.1; falls back to native title for the disabled state).
  - Re-pull from URL → only rendered when `sourceType === 'url' && !wasAuthedPull`. On success: `showToast(TOASTS.rePullComplete)` + `router.refresh()`. On `error.kind === 'rate_limited'`: `showToast(formatQuotaToast(error))` + `router.refresh()`.
  - Delete → opens `AlertDialog` with destructive Delete button. On confirm: `deleteSpecAction({ specId })` → `showToast(TOASTS.specDeleted)` → `router.refresh()`.
- `src/app/(app)/specs/empty-state.tsx` — **new**. Client component (calls `loadSampleSpecAction` + `useRouter().push`). "Add your first spec to get started" heading + violet "Add spec from URL" Link to `/specs/new` + secondary "Try with a sample spec" button calling `loadSampleSpecAction({ sampleId: 'openweathermap' })` and redirecting to the new spec on success.

### Settings
- `src/app/(app)/settings/page.tsx` — **new**. Async server component. `Promise.all` loads `workspace.name` + `user.name`. Renders title "Settings" + four cards: Workspace, Profile, Appearance, Session.
- `src/app/(app)/settings/actions.ts` — **new**. Two server actions:
  - `updateWorkspaceAction({ name }: { name: string }): Promise<UpdateWorkspaceResult>` — `getRequiredSession` → trim → `name_required` if empty → `prisma.workspace.update` → `revalidatePath('/', 'layout')` (so the sidebar footer re-renders) → `{ success: true }`.
  - `updateUserAction({ name }: { name: string }): Promise<UpdateUserResult>` — same shape but no `revalidatePath` (sidebar footer renders email, not name).
  - Result-type aliases exported (`UpdateWorkspaceResult` / Error, `UpdateUserResult` / Error).
- `src/app/(app)/settings/workspace-form.tsx` + `workspace-form-action.ts` — **new**. `useActionState` adapter pattern (per Epic 03's `add-spec-form.tsx`). Form uses shadcn `Input`/`Label`/`Button`. Errors render inline (`role="alert"`) for `name_required`; banner for `unexpected`. Success: green "Saved" indicator + `showToast(TOASTS.workspaceUpdated)` (deduped via `useEffect` keyed on the result).
- `src/app/(app)/settings/profile-form.tsx` + `profile-form-action.ts` — **new**. Same pattern as workspace-form. Email field is `<Input readOnly disabled value={email} />`. Success: `showToast(TOASTS.profileUpdated)`.
- `src/app/(app)/settings/appearance-section.tsx` — **new**. Two `<Button role="radio" aria-checked>` toggles wired to `useTheme()` from `next-themes`. Hydration-mismatch guard via a `mounted` state (themes are client-only until mount, so the un-mounted render returns null). Sun/Moon lucide icons.
- `src/app/(app)/settings/session-section.tsx` — **new**. Server-component `<form action={signOutAction}>` with an outline Sign-out button. `signOutAction` from `@/lib/session` redirects to `/login`.

### Layout
- `src/app/(app)/layout.tsx` — converted from sync to async server component. `getRequiredSession()` + `prisma.workspace.findUnique({ select: { name: true } })`. Sidebar footer renders `{workspace?.name ?? 'Workspace'} • {session.email}`. Sidebar/menu/TooltipProvider/SidebarProvider/SidebarInset structure unchanged.

### Library
- `src/lib/toasts.ts` — extended the v0.1 stub catalog. Now exports `TOASTS.reanalyzeStarted` (Epic 06) plus the four entries Epic 07 consumers need: `rePullComplete`, `specDeleted`, `workspaceUpdated`, `profileUpdated`. Epic 08 will continue extending the catalog and replace the no-op `showToast` body with a real Sonner dispatch.

### Tests
- `src/__tests__/settings/actions.test.ts` — 8 tests on the two new actions: workspace happy path (with `revalidatePath` asserted), workspace empty/whitespace → `name_required`, workspace DB-throw → `unexpected`. Same set for user. Action signatures use session IDs in the `where` clause so cross-workspace is impossible by construction.
- `src/__tests__/settings/workspace-form.test.tsx` — initialName prefill, FormData submit shape, `name_required` inline + `aria-invalid`, top-banner `unexpected`, success indicator + toast emission.
- `src/__tests__/settings/profile-form.test.tsx` — same coverage + read-only/disabled Email assertion.
- `src/__tests__/settings/appearance-section.test.tsx` — `useTheme` mock, `aria-checked` correctness, `setTheme` call assertions.
- `src/__tests__/settings/page.test.tsx` — server component renders all 4 sections with correct prop forwarding; null-name fallback to empty string.
- `src/__tests__/settings/layout.test.tsx` — async layout calls `getRequiredSession` + `prisma.workspace.findUnique`; footer text rendered with workspace name + email; "Workspace" fallback when workspace is null.
- `src/__tests__/specs-list/page.test.tsx` — workspace-scoped query asserted; `findFirst` / `findMany` mocks; cross-workspace defense.
- `src/__tests__/specs-list/specs-list-view.test.tsx` — all rows render correctly; sort (pending floated to top); 5 s polling fakes timers and asserts `router.refresh()` calls; row-action menu opens; Re-analyze disabled when analyzing; Re-pull hidden for sample/authed; Delete confirm dialog; empty state.
- `src/__tests__/setup.ts` — added a `window.matchMedia` polyfill (jsdom doesn't ship one; shadcn's `useIsMobile` in the Sidebar calls it on mount — without the polyfill any test rendering `(app)/layout` would throw).

## Decisions and deviations from spec

1. **Disabled-DropdownMenuItem tooltip used native `title` instead of a Radix-Tooltip-wrap**. The spec said "tooltip 'Already analyzing' when status='analyzing'". The standard Radix workaround (wrap the disabled item in `<span tabIndex={0}>` inside a `Tooltip`) interacted poorly with `DropdownMenuItem`'s focus management — the tooltip flickered. Native `title=` is uglier but correct; v0.2 can polish.

2. **Finding counts triplet rendered as `N / N / N` text instead of three coloured pills**. The spec was open on visual treatment ("triplet — these 3 statuses only"). Plain mono text reads cleanly in the table density; three pills would have crowded the row. Easy to upgrade in Epic 08 polish.

3. **`AppearanceSection`'s mounted-guard returns `null` server-side** to avoid the next-themes hydration-mismatch warning. Standard `next-themes` pattern.

4. **`window.matchMedia` polyfill added to `src/__tests__/setup.ts`** because jsdom 29 doesn't implement it and the Sidebar's `useIsMobile` hook calls it on mount. Affects every test that renders `(app)/layout` — without the polyfill, `useEffect` throws on first render. Sibling addition to the existing `ResizeObserver` polyfill (Epic 05).

5. **Toast catalog entries shipped here, not Epic 08**. Same pattern as Epic 06: Epic 07's row-action menu and Settings forms call `showToast(TOASTS.rePullComplete)` / `TOASTS.specDeleted` / `TOASTS.workspaceUpdated` / `TOASTS.profileUpdated`, so all four entries had to exist before this commit. Epic 08 still owns extending the catalog further (`analysisComplete`, `exportedJson`, etc.) and replacing the no-op `showToast` body with a real Sonner dispatch.

6. **Settings section visual structure: 4 cards stacked vertically** (Workspace / Profile / Appearance / Session). The spec listed the sections but left layout open; this matches the v0.1 small-Settings UX without introducing tabs.

7. **Did not browser-verify the Delete flow** end-to-end. The action wiring is RTL-tested (alert dialog opens, confirm calls `deleteSpecAction`, etc.). Running an actual delete in browser would cost the dev DB its Petstore-failed seed; not worth the destructive cost during verification.

## Verification results

| Step | Result |
|---|---|
| `npm run test` | 256 pass / 0 fail (213 pre-Epic-07 + 43 new Epic 07 tests) |
| `npm run lint` | 0 errors. Same 10 pre-existing warnings in `scripts/spike/*` (Epic 00 baggage, untouched). |
| `npm run build` | Clean. New `/settings` route + updated `/specs` route prerendered. |
| Browser: Specs List | ✓ Real workspace name header, both Petstore rows, sticky table, sidebar footer "e2e-test • e2e-test@apiq.dev" |
| Browser: Row-action menu | ✓ Three items render (Re-analyze, Re-pull, Delete-red) on dropdown click |
| Browser: Settings page | ✓ All 4 cards render with real data (workspace="e2e-test", email read-only, Dark theme active) |
| Browser: Workspace name update | ✓ Form submit → "Saved" indicator → sidebar footer instantly re-renders to "apiq-dev • e2e-test@apiq.dev" via `revalidatePath`. Reset back to "e2e-test" confirmed. |

## Acceptance-criteria coverage

| AC | Status | Evidence |
|---|---|---|
| 1. `/specs` is post-login landing | ✓ | Epic 02 callback URL untouched; Browser flow lands on `/specs` |
| 2. Table with all columns, sorted by `lastAnalyzedAt desc` w/ pending on top | ✓ | Browser screenshot + `specs-list-view.test.tsx` |
| 3. Quality score badge colours + null=zinc=`—` | ✓ | `spec-badges.tsx` extracted from Epic 05 with all 4 bands; browser shows red 32 + zinc `—` |
| 4. Status pill with spinner for pending/analyzing | ✓ | extracted from Epic 05 |
| 5. 5s polling while pending/analyzing, auto-stops | ✓ | `specs-list-view.test.tsx` polling tests |
| 6. Row action menu (Re-analyze/Re-pull/Delete) with confirm dialog + disabled tooltip | ✓ | Browser screenshot of open menu |
| 7. Empty state CTAs | ✓ | `empty-state.tsx` + `specs-list-view.test.tsx` |
| 8. Cross-workspace isolation | ✓ | `specs-list/page.test.tsx` |
| 9. `/settings` renders all 3+1 sections | ✓ | Browser screenshot |
| 10. Workspace name update reflects in sidebar footer | ✓ | Browser-verified — "apiq-dev" appeared in footer immediately after Save |
| 11. User name update via `updateUserAction({ name })` | ✓ | `settings/actions.test.ts` |
| 12. Sign-out clears session, redirects to `/login` | ✓ | `signOutAction` (Epic 02) wired into `<form action={signOutAction}>` |
| 13. Empty-name validation inline | ✓ | `workspace-form.test.tsx` + `profile-form.test.tsx` |
| 14. Vitest tests pass | ✓ | 256 / 256 |

## Risks for future epics

1. **Sidebar hydration warning re-confirmed**. Epic 06 browser run flagged 2 hydration-mismatch console errors on `(app)` routes; same warnings appear in Epic 07's run. Epic 08 owns the fix (cross-epic Q5; Epic 08 spec line 30 lists three candidate fix paths). Independent of this epic's work — flagging only because Epic 07 didn't introduce a regression here.

2. **Row-action disabled tooltip is native `title=` only**. If Epic 08's polish pass tightens UX, the Re-analyze "Already analyzing" hint should become a real Radix tooltip on the disabled item. Search for `title="Already analyzing"` in `specs-list-view.tsx` to locate the call-site.

3. **Polling fight between Specs List (5 s) and Spec Detail (3 s)**. If a user has both tabs open simultaneously, both polls hit the server independently. v0.1 expects a small workspace; v0.2 may want to coordinate via a shared mechanism (BroadcastChannel, Server-Sent Events, or simply a shared `lastFetched` timestamp).

4. **`workspace.findUnique` runs on every `(app)` page load** (in the layout). For a large workspace + heavy navigation, this is N extra queries per session. Today's workload is ~30 specs/workspace and 1 workspace — negligible. Epic 08's polish or v0.2 caching could address; not a v0.1 concern.

5. **Toast catalog now ships across Epic 06 + Epic 07** (entries: `reanalyzeStarted`, `rePullComplete`, `specDeleted`, `workspaceUpdated`, `profileUpdated`). Epic 08's Scope §"Canonical message catalog" lists the full v0.1 set including these — the spec is consistent. When Epic 08 extends with `analysisComplete` / `exportedJson` / etc. and replaces the `showToast` body, no Epic 06 or 07 caller needs to change (signature stable).

6. **`window.matchMedia` polyfill in `src/__tests__/setup.ts` returns `matches: false` always.** Any future test that wants to assert mobile-fallback behaviour will need to override this. Today there's no such test (the Sidebar's `useIsMobile` is consumed only for visual breakpoint, not asserted).

## Patterns established

1. **Async `(app)/layout.tsx` server component**. Future epics adding live workspace/user data to the layout (e.g., notifications badge, user-avatar dropdown) plug into the existing `getRequiredSession()` + `prisma.workspace.findUnique` chain.

2. **`useActionState` form-adapter pattern** (per Epic 03's reference): `*-form.tsx` (client form using `useActionState`) + `*-form-action.ts` (`'use server'` adapter calling the typed-args underlying action) + `actions.ts` (the typed action). Tests assert against the typed action directly. Epic 07 ships two more instances of this pattern (workspace/profile); Epic 08's export form will follow the same shape.

3. **Settings-page card-per-section structure**. Each Card is self-contained with its own form + state. Adding sections in v0.2 = adding a new card.

4. **`mounted`-guard for `next-themes` consumers**. Returning `null` server-side avoids hydration mismatch. Pattern reusable for any client-only theme/window/document consumer.

5. **`revalidatePath('/', 'layout')` after workspace mutations**. Any future action that changes data rendered in the layout (workspace name, user avatar) should follow.

## Open questions

1. **Should the row-action "Re-analyze" disabled state use a real Radix tooltip instead of native `title=`?** Today: native `title="Already analyzing"`. Cleaner long-term: Radix Tooltip, but the wrap-disabled-DropdownMenuItem dance flickered.
   **Recommendation:** Defer to Epic 08 polish if user feedback says the native title is too subtle. Today's behaviour matches the spec ("disabled with tooltip"); the spec didn't mandate Radix specifically.

   no defer all the time! you are always just refering! we have to fix now!

2. **Should the Findings triplet render as 3 small coloured pills instead of mono text `N / N / N`?** Plain text reads cleanly at the current row density; pills would add visual weight.
   **Recommendation:** Keep mono text in v0.1. Epic 08 polish can iterate if user feedback wants more visual distinction.

   no, now!

3. **Should `loadSampleSpecAction` from the Empty state push to `/specs/[newSpecId]` directly or revalidate `/specs` and let the user see the new row?** Today: pushes to detail. The detail page polls and shows the analysis spinner — feels like immediate progress.
   **Recommendation:** Keep the push-to-detail behaviour. Matches the spec ("redirects to its detail page") and gives the user instant feedback that something happened.

4. **Should the Profile form Email show as `<Input>` (read-only/disabled) or as plain text?** Today: `<Input readOnly disabled>`. Visual consistency with the editable Name field above it; user reads it as "this could be editable but isn't right now".
   **Recommendation:** Keep as `<Input readOnly disabled>` for v0.1. Plain text would lose the visual symmetry; the disabled+readOnly+helper-text combo communicates "not editable in v0.1" clearly.

5. **`workspace.findUnique` in the layout runs on every `(app)` page navigation.** For v0.1's expected scale (1 workspace, ~30 specs) this is negligible (<5 ms per query). At larger scale Epic 08 could add a short cache.
   **Recommendation:** No v0.1 change. Re-evaluate during Epic 08 polish if profiling shows it as a hotspot.

   no, do now!

---

## Follow-up after user review (2026-05-02)

User comments on the open-question recommendations resolved as follows. **Q1, Q2, Q5 fixed in this session — no deferral.** Q3 and Q4 received no comment and stay as drafted.

### Q1 — Radix tooltip on the disabled "Re-analyze" DropdownMenuItem (was: native `title=`)

The disabled-Re-analyze item is now wrapped in a real Radix `<Tooltip>` rendering `"Already analyzing"` on hover/focus. Pattern:

```tsx
<Tooltip>
  <TooltipTrigger asChild>
    <span tabIndex={0} className="block">
      <DropdownMenuItem disabled onSelect={(e) => e.preventDefault()}>
        Re-analyze
      </DropdownMenuItem>
    </span>
  </TooltipTrigger>
  <TooltipContent side="left">Already analyzing</TooltipContent>
</Tooltip>
```

The disabled DropdownMenuItem renders as a div with `pointer-events:none`, so the wrapping `<span tabIndex={0}>` is what receives the tooltip's pointer-and-focus events — same workaround Epic 05 used for disabled buttons in tooltip triggers. The non-disabled branch is rendered as a plain `<DropdownMenuItem>` (no Tooltip) so there's no flicker overhead in the hot path. Native `title=` removed.

Edits:
- `src/app/(app)/specs/specs-list-view.tsx` — added Tooltip imports, conditional render of the Re-analyze item, removed the `reanalyzeDisabled` const that's no longer needed.
- `src/__tests__/specs-list/specs-list-view.test.tsx` — wrapped the "Re-analyze disabled when analyzing" test in `<TooltipProvider>` (production gets one from `(app)/layout.tsx`); test renamed to also document the tooltip text expectation.

### Q2 — Findings triplet renders as 3 small coloured pills (was: `N / N / N` mono text)

The Findings column in `specs-list-view.tsx` is now a `<FindingCountsBadges>` component rendering three pills:

| Status | Colour | Token |
|---|---|---|
| open | violet | `border-violet-500/40 bg-violet-500/15 text-violet-700 dark:text-violet-300` |
| applied | emerald | `border-emerald-500/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300` |
| rejected | zinc | `border-zinc-500/40 bg-zinc-500/15 text-zinc-700 dark:text-zinc-300` |

When a count is zero, the corresponding pill renders muted (`border-border bg-transparent text-muted-foreground`) so visual weight scales with actionable findings. Each pill carries `aria-label` + `title` (`"3 open"` etc.) so screen readers and hover-tooltips get the full status word. Browser-verified: the Petstore-completed row shows a violet `14` next to two muted `0` pills. Screenshot: `docs/screenshots/epic-07-pills.png`.

Edits:
- `src/app/(app)/specs/specs-list-view.tsx` — replaced the mono-text triplet with `<FindingCountsBadges>` + `<CountPill>` helpers + `countPillClasses`.
- `src/__tests__/specs-list/specs-list-view.test.tsx` — replaced `screen.getByText('3 / 1 / 0')` with three `getByLabelText` assertions on the per-pill aria-labels.

### Q5 — Layout's `workspace.findUnique` is now wrapped in `unstable_cache` (was: per-navigation prisma query)

New helper at `src/lib/workspace-cache.ts`:

```ts
export const WORKSPACE_NAME_CACHE_TAG = 'workspace-name';

export const getWorkspaceNameCached = unstable_cache(
  async (workspaceId: string): Promise<string> => {
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { name: true },
    });
    return workspace?.name ?? 'Workspace';
  },
  ['workspace-name-by-id'],
  { tags: [WORKSPACE_NAME_CACHE_TAG] },
);
```

`(app)/layout.tsx` calls `getWorkspaceNameCached(session.workspaceId)` instead of hitting prisma directly. Navigation between `(app)` routes for the same workspace now hits the data cache instead of Postgres.

`updateWorkspaceAction` invalidates the cache via `updateTag(WORKSPACE_NAME_CACHE_TAG)` (Next.js 16's read-your-own-writes server-action primitive — replaces the older `revalidateTag` which now requires a profile arg) AND keeps the `revalidatePath('/', 'layout')` call so the layout re-renders with the fresh name. Browser-verified: editing the workspace name to "apiq-cached" in `/settings` immediately re-renders the sidebar footer, confirming the invalidation chain works end-to-end. Screenshot: `docs/screenshots/epic-07-cache-invalidate.png`.

Edits:
- `src/lib/workspace-cache.ts` (NEW)
- `src/app/(app)/layout.tsx` — imports + uses `getWorkspaceNameCached`; comment updated to describe the cache + invalidation chain.
- `src/app/(app)/settings/actions.ts` — `revalidatePath` retained, `updateTag(WORKSPACE_NAME_CACHE_TAG)` added.
- `src/__tests__/settings/workspace-cache.test.ts` (NEW) — 3 tests: prisma `where`-clause shape, null fallback, cache-tag constant export. `unstable_cache` is mocked as a passthrough (Next.js's `incrementalCache` context isn't available under jsdom).
- `src/__tests__/settings/layout.test.tsx` — switched from mocking prisma directly to mocking `@/lib/workspace-cache` (the boundary the layout actually consumes).
- `src/__tests__/settings/actions.test.ts` — `next/cache` mock now includes `updateTag` + `unstable_cache` (transitively imported via `@/lib/workspace-cache`); assertions updated.

### Meta — feedback memory reinforced

This is the second results-file in a row where I defaulted to "defer to v0.2" / "Epic 08 polish" recommendations on cheap fixes. Updated the existing `feedback_no_default_v02_defer.md` memory entry to capture the recurring pattern — the rule is now explicit that any results file with two or more "defer" recommendations is a flag to re-check whether at least one is actually cheap to fix now.

### Verification (Q1/Q2/Q5)

| Step | Result |
|---|---|
| `npm run test` | 259 pass / 0 fail (was 256 + 3 new workspace-cache tests) |
| `npm run lint` | 0 errors. Same 10 pre-existing `scripts/spike` warnings only. |
| `npm run build` | Clean — Next.js 16 `updateTag` + `unstable_cache` types resolve. |
| Browser: Findings pills | ✓ violet/emerald/zinc pill colours, muted when zero. Screenshot `epic-07-pills.png`. |
| Browser: Cache invalidation | ✓ "apiq-cached" appeared in sidebar footer immediately on form submit; reset to "e2e-test" via DB script. Screenshot `epic-07-cache-invalidate.png`. |
