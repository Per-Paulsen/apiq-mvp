# PRD Decisions — Design System

> Detailliert die Design-Entscheidungen für apiq v0.1, die im PRD nur als "deferred" markiert waren.
> Single source of truth für UI-Look in den Epics 01 (Setup), 05 (Spec Detail), 07 (Specs List + Settings).
> Upstream: [`prd.md`](prd.md) §"Four Screens", [`tech-stack.md`](tech-stack.md), [`specs/brainstorming.md`](specs/brainstorming.md) Sektion C/E/I.

## Design-Anker

apiq's Zielgruppe sind **Backend-Engineers** auf der Suche nach einer "knowledgeable second opinion" — nicht Marketing-/Founder-Dashboards. Visueller Anker:

- **Look-und-Feel-Vorbild:** Linear / Vercel Dashboard / GitHub / Stripe Dashboard. Ruhig, dicht, neutral, eine Akzentfarbe, monospace-friendly.
- **Layout-Vorbild:** Fillow-Template (Sidebar-Mini-Variante, Topbar, Card-Grid) — siehe `fillow-template-reference.png` im Repo-Root. Aus Fillow nehmen wir die **Layout-Struktur**, nicht die bunte DexignZone-Aesthetik.
- **Out-of-scope-Stilelemente:** Hero-Cards mit Illustrationen, bunte Akzent-Mischungen (lila + orange + pink + türkis), große Donut/Bar-Charts, Marketing-Banners. Apiq hat keinen Use-Case dafür.

## Color Palette

- **Base:** shadcn `zinc` (neutralere Grautöne als `slate`, weniger blaustichig).
- **Accent:** **`violet`** (eine Farbe, nicht mehrere). Genutzt für: primary buttons, sidebar-active-state, focus-rings, links.
- **Semantic colors** (für Severity-Badges, Status-Pills, Diff-Highlight):
  - `critical` → red-500 (Light) / red-400 (Dark)
  - `high` → orange-500 / orange-400
  - `medium` → amber-500 / amber-400
  - `low` → blue-500 / blue-400
  - `success` (applied finding, completed analysis) → emerald-500 / emerald-400
  - `muted` (rejected, outdated, stale) → zinc-400 / zinc-500
- **Diff-Viewer:** GitHub-Style — `green-500/15` Hintergrund für additions, `red-500/15` für deletions, dünne linke Border in der jeweiligen Vollfarbe.
- **Quality-Score-Badges:** ≥80 → emerald, 60–79 → amber, <60 → red. Keine Tönungen außerhalb dieser drei Farben.

## Theme

- **Dark Mode ist der Default.** Light Mode optional, umschaltbar via `next-themes`. Kein "system"-Dritter-Modus für v0.1.
- Theme-Toggle in Settings (Epic 07) oder im Topbar-User-Menü — Implementierungsdetail.

## Typography

- **UI:** **Geist Sans** (via `next/font` lokal eingebunden — derselbe Default, den shadcn-Examples nutzen). Fallback: Inter, system-ui, sans-serif.
- **Monospace** (für JSON-Pfade, Endpoint-Pfade, Diff-Viewer, Patch-Ops, Code-Snippets): **JetBrains Mono** (via `next/font`). Fallback: ui-monospace, Menlo, Consolas, monospace.
- **Skala:** shadcn-Defaults — `text-xs` (12 px), `text-sm` (14 px, Body-Default), `text-base` (16 px), `text-lg` (18 px), `text-xl` (20 px), `text-2xl` (24 px). Keine größeren Display-Sizes — apiq hat keine Hero-Bereiche.
- **Leading:** shadcn-Defaults (`leading-relaxed` für Narration-Text, `leading-tight` für Titles).

## Layout

- **App-Layout** (`(app)/layout.tsx`):
  - Linke Sidebar, **collapsible Mini-Variante** (Icon-only, ~64 px breit) als Toggle. Persisted in Cookie (shadcn-Default).
  - Topbar oben (~56 px hoch): links Workspace-Name (statisch), rechts User-Avatar mit Drop-Down (Settings, Sign-Out).
  - Content-Grid darunter mit `max-w-7xl` und `px-6`.
- **Sidebar-Items v0.1:** "Specs" (`/specs`), "Settings" (`/settings`). Footer der Sidebar: User-Email + Workspace-Name (klein, muted).
- **Auth-Layout** (`(auth)/layout.tsx`): zentrierter Card-Container, max-w-sm, mittig vertikal. Kein Sidebar/Topbar.
- **Kein Mobile-Layout.** Mobile fallback banner (Epic 08) bei Viewport <1024 px.

## Components

- **Cards (shadcn `Card`):** subtile `border` (1 px, `border-border`-Token), `rounded-lg` (8 px), kein farbiger Header, dezente `shadow-sm` nur in Light-Mode (in Dark transparent). Padding: `p-6` für Content-Cards, `p-4` für kompakte (z. B. Findings-Cards in der Liste).
- **Buttons:** shadcn-Defaults. Primary = `violet` filled. Secondary = ghost. Destructive = red. Niemals zwei Primary-Buttons nebeneinander.
- **Tables (Specs-Liste):** shadcn `Table`. Sticky Header, Row-Hover (`bg-accent/50`), keine Zebra-Streifen. Compact density (`py-2.5` per row).
- **Form-Inputs:** shadcn `Input`, `Label`, `Form`. Errors inline, rot, `text-xs`.
- **Status-Pills:** kompakte Badges (`text-xs`, `px-2 py-0.5`, `rounded-full`), Farbe per Status:
  - `pending` / `analyzing` → blue + Spinner-Icon
  - `completed` → emerald
  - `failed` → red
  - `outdated` / `stale` → zinc (muted)
- **Severity-Badges:** wie Status-Pills, Farbe per Severity (siehe Palette).
- **Diff-Viewer:** `react-diff-viewer-continued` mit Custom-Theme das die Color-Tokens nutzt. Side-by-side, monospace, Zeilennummern an.
- **Tooltips:** shadcn `Tooltip` für truncated URLs, disabled buttons (z. B. "Implemented in Epic 06" in Epic 05), Sidebar-Mini-Icons.
- **Toasts:** shadcn `Toaster` top-right, Default-Position. Success / Error / Info Varianten via Color-Tokens.

## Icons

- **`lucide-react`** (im Tech-Stack). Größen: `size-4` (16 px) Default für Inline-Icons, `size-5` (20 px) für Buttons, `size-6` (24 px) für Sidebar.
- Keine zweite Icon-Bibliothek.

## Density

- **Dicht, nicht spärisch.** Engineer-Tools optimieren auf Information-per-Pixel.
- Default Spacing: shadcn-Defaults (`gap-4` für Stacks, `gap-2` für inline groups). Niemals `gap-12` oder größere Gaps in Content-Bereichen.

## Was wir NICHT übernehmen (aus Fillow oder generischen Admin-Templates)

- Hero-Cards mit "Welcome back, User!"-Banners
- Sparklines neben Stat-Cards
- Donut/Bar-Charts auf der Landing-Seite (Specs-Liste)
- Bunte Akzent-Mischungen (Mehrfach-Akzentfarben)
- Animationen außer den shadcn-Defaults (Fade/Slide bei Toasts, Drawers)
- Floating Action Buttons
- Background-Illustrationen / Pattern-Tiles

## Konkrete Konsequenzen pro Epic

- **Epic 01 — Project Setup:** initialisiert shadcn mit Base = `zinc`, Akzent = `violet`, lädt Geist Sans + JetBrains Mono via `next/font`, setzt `next-themes` mit `defaultTheme="dark"`. Sidebar-Mini-Variante wird in `(app)/layout.tsx` skeleton bereits angelegt.
- **Epic 05 — Spec Detail:** Findings-Cards, Severity-Badges, Diff-Viewer-Theming richten sich nach diesen Tokens. Endpoint-Liste links nutzt monospace für die Pfade.
- **Epic 07 — Specs List + Settings:** Tabelle mit Quality-Score-Badge, Status-Pills, Row-Action-Menüs. Empty State (Engineer-tauglich, kein Illustration-Hero).

## Open follow-ups

- Logo / Wortmarke "apiq" — minimalistisches Wortmark + ein Icon (z. B. `lucide-react Webhook` oder `Network`); Detail in Epic 01.
- Favicon — wird in Epic 08 finalisiert.
- Print-Stylesheet — out of scope für v0.1.
- Höhere a11y-Targets als WCAG AA — out of scope für v0.1.
