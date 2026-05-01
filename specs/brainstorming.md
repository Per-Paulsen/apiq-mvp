# Brainstorming — apiq MVP

> Phase 1 of `/spec`. Fragen, die für saubere Epic-Specs noch geklärt werden müssen.
> Append-only. Antworten bitte direkt unter den jeweiligen Block schreiben.

Quellen, die ich gelesen habe:
- `prd.md`
- `tech-stack.md`
- `CLAUDE.md`
- `openapi-examples/README.md` (leer, wird in Epic 00 befüllt)
- `prd-decisions.md` — existiert nicht

Die folgenden Punkte sind weder im PRD noch im Tech-Stack klar genug für eine Epic-Spec.

> Format: Jede Frage hat einen Empfehlungs-Block (`→ Empfehlung`). Antworte mit "ack" / Abweichung / Erweiterung — oder schreib eigene Antworten direkt darunter.

---

## A. Spec Ingestion (relevant für Epic 03)

A1. **Größenlimits.** Was ist die obere Grenze für v0.1?
- Maximale Dateigröße (MB)?
- Maximale Endpoint-Zahl, ab der das Hochladen blockiert wird (PRD nennt 50 nur als Schwelle für eine spätere Two-Call-Architektur, nicht als Upload-Cap)?
- Soll es einen weichen Warn-Threshold und einen harten Block-Threshold geben?

→ **Empfehlung:** Hard Limit **5 MB Dateigröße** und **200 Endpoints**. Soft-Warn ab **100 Endpoints** ("große Specs liefern ggf. weniger präzise Findings"). Begründung: Stripe (~7 MB / ~500 Endpoints) ist sowieso v0.2-Material; Single-Call-Architektur passt zu ≤200. Begrenzung ist im UI sichtbar (nicht nur im Server-Code).

A2. **Multi-File-Specs.** Stripe veröffentlicht u. a. eine gesplittete Spec mit externen `$ref`s. Unterstützen wir in v0.1
- (a) nur Single-File JSON/YAML,
- (b) Single-File + URL-pull der referenzierten Files, oder
- (c) ZIP-Upload mit Root-File-Auswahl?

→ **Empfehlung:** **(a) Single-File JSON oder YAML.** Multi-File und ZIP sind out of scope. Wenn beim Dereferencing externe `$ref`s gefunden werden → Validierungsfehler mit klarer Meldung "External `$ref`s are not supported in v0.1". Begründung: Multi-File verdoppelt Upload- und Lifecycle-Komplexität ohne klaren MVP-Nutzen.

A3. **Wiederholtes Hochladen derselben Spec.** Wenn der Nutzer eine Spec mit identischem `info.title`/`info.version` (oder identischem Dateinamen) erneut hochlädt:
- (a) ersetzt sie die bestehende Spec (currentJson überschreiben, Findings invalidieren)?
- (b) wird sie als neue Spec angelegt?
- (c) gibt es einen Dialog "ersetzen / als neu anlegen / abbrechen"?

→ **Empfehlung:** **(b) Immer als neue Spec anlegen.** Keine Identitäts-Erkennung. Begründung: `info.title` / `info.version` sind unzuverlässige Identitäten (viele Nutzer lassen sie auf Default), Dateinamen erst recht. Linearer Mental-Model: "ein Upload = eine Spec". Alte Spec kann manuell gelöscht werden.

aber wie wird dann eine spec gesynct?

→ **Antwort:** Berechtigte Frage — bei strict "neue Spec pro Upload" gibt es **kein** Sync, und die Apply-History wird abgeschnitten. Pragmatischer Mittelweg für v0.1:

- **File-Upload-Specs:** kein Sync möglich (keine Quelle bekannt). Re-Upload = neue Spec. Saubere Trennung.
- **URL-Pull-Specs:** zusätzlicher **"Re-pull from URL"-Button** auf dem Spec Detail. Wirkt in-place: holt die Spec erneut von der gespeicherten URL, erzeugt eine neue `SpecVersion` mit `label = "Re-pulled from URL"`, **invalidet alle offenen Findings** (sie werden archiviert mit Status `outdated` analog zu `stale`) und triggert eine frische Analyse. Apply-History bleibt im SpecVersion-Tree erhalten, aber Findings werden komplett neu erzeugt.
- **Open-Findings-Erhalt** beim Re-pull (Hash-Mapping "altes Finding existiert in neuer Version noch") ist v0.2 — siehe D4: Hash-Mapping ist heuristisch.

Damit ist "Sync" für den realistischen Hauptfall (Spec liegt unter URL und wird vom Team aktualisiert) gelöst. Für File-Uploads ist der Workaround "neuen Upload anlegen, alte Spec löschen". **A3-Empfehlung damit erweitert um Re-pull-Button für URL-Specs.**

A4. **URL-Pull.**
- Werden authentifizierte URLs unterstützt (z. B. Header-Token, Basic-Auth) oder nur öffentliche URLs?
- Was passiert bei Redirects, 401, Timeouts?
- Welcher Content-Type wird akzeptiert (`application/json`, `application/yaml`, `text/yaml`, sonstiges via Datei-Endung)?

→ **Empfehlung:** **Nur öffentliche URLs** (kein Auth-Header in v0.1). Redirects bis 5 Hops folgen (`fetch` Default). Timeout **30 s**. Format-Erkennung: zuerst Content-Type, fallback auf URL-Extension (`.json` / `.yaml` / `.yml`), fallback auf Sniff (erstes non-whitespace = `{` / `[` ⇒ JSON). 401/403/404/5xx ⇒ klarer Fehler im Upload-Dialog ("URL nicht erreichbar — Status 401").

können wir nicht auch header auth oder so machen? oder bringt das keinen mehrwert?

→ **Antwort:** Mehrwert ist real — viele OpenAPI-Specs liegen hinter Auth (interne Spec-Hosts, GitHub Enterprise, Postman-Workspaces, Bitbucket-Repos via Raw-URL). Engineer-Workaround "lokal mit `curl` ziehen, dann File-Upload" funktioniert, ist aber Reibung. Vorschlag für v0.1:

- **Ein optionales `Authorization`-Header-Feld** im URL-Pull-Form (Free-Text, z. B. `Bearer xyz` oder `Basic <base64>`). Wird beim Pull als HTTP-Header mitgeschickt.
- **Token wird NICHT persistent gespeichert** — nur für den einen Pull-Request verwendet, danach verworfen. Damit kein Token-Storage, keine Verschlüsselungs-Pflicht, keine Audit-Surface.
- **Konsequenz für Re-pull (siehe A3):** "Re-pull from URL" funktioniert dann nur bei **public URLs**. Authed URL-Pulls sind one-shot — nach dem ersten Pull verhalten sie sich wie File-Uploads (kein Re-pull-Button). Im UI klar kommunizieren: "Re-pull is only available for public URLs."
- **Mehr-Header-Felder, OAuth-Flows, Token-Storage** sind v0.2.

Trade-off: ein Eingabefeld + ein Code-Pfad zusätzlich, ohne neue Storage- oder Security-Surface. Kosten/Nutzen positiv. Kannst du mit "ack" oder "doch out of scope" entscheiden.

A5. **Dereferencing.**
- Externe `$ref`s (auf andere URLs/Files): in v0.1 unterstützt oder explizit "nur lokale `$ref`s"?
- Verhalten bei zyklischen Refs: ablehnen oder mit Cycle-Marker auflösen?
- Wenn das Dereferencing fehlschlägt: Spec gar nicht speichern, oder als "ungültig" speichern und in der Liste markieren?

→ **Empfehlung:** **Nur lokale `$ref`s** (`#/components/...`). Externe Refs ⇒ Validierungsfehler. **Zyklische Refs:** erkennen, beim ersten erneuten Vorkommen mit `$ref`-Marker stehen lassen (kein Stack-Overflow); Spec gilt als gültig. **Failure beim Dereferencing:** Spec wird **nicht** gespeichert, Upload-Dialog zeigt strukturierte Fehlerliste. Begründung: "invalid Spec im Workspace" verkompliziert UI ohne Mehrwert.

A6. **Swagger 2.0.** PRD sagt "read-only, no patches".
- Heißt das: Upload erlaubt, Analyse erlaubt, aber Apply-Buttons komplett ausgeblendet?
- Oder: Upload erlaubt, aber gar keine Analyse (nur Anzeige)?
- Oder: Upload mit Hinweis "Bitte zu OpenAPI 3.x konvertieren" und keine Verarbeitung?

→ **Empfehlung:** **Komplett out of scope für v0.1.** Beim Upload Swagger-2.0-Erkennung (`swagger: "2.0"` Feld) → freundlicher Block: "Swagger 2.0 wird in v0.1 nicht unterstützt. Bitte mit `swagger2openapi` zu OpenAPI 3.x konvertieren." Begründung: Read-only-Modus ist ein zweiter UI-State (Apply ausgegraut, Findings ohne Patches), der LLM-Prompt müsste das berücksichtigen — verdoppelt Test-Surface ohne MVP-Nutzen. **Klare Abweichung vom PRD-Wording — bitte explizit bestätigen.**

A7. **Validierungsfehler.** Wenn Validate-as-OpenAPI-3.x fehlschlägt:
- Wird die Spec nicht gespeichert und der User sieht einen Fehler im Upload-Dialog?
- Oder gespeichert mit Status "invalid", damit der User die Fehler sieht?
- Welche Fehler-Granularität ist nötig (nur "ungültig" vs. konkrete Liste der Validation-Issues)?

→ **Empfehlung:** **Spec wird nicht gespeichert.** Upload-Dialog zeigt strukturierte Fehlerliste (max. 10 Issues, Ellipsis bei mehr) aus dem OpenAPI-Validator. Begründung: Engineer-Zielgruppe will "fix locally and re-upload", nicht "im Workspace einen kaputten Stub haben". Konkrete Issues > Generic-Failure — sonst frustriert der Validator-Pass ohne Hinweis.

A8. **Originalformat.** Wenn der Nutzer YAML hochlädt:
- Wird `originalJson` immer als JSON gespeichert (nach Konvertierung)?
- Oder gibt es ein zusätzliches Feld `originalRaw` (String) für späteren Roundtrip-Export im Originalformat?
- Tangentiale Frage: ist `originalJson` ein `Json`-Feld (strukturiert) oder ein `String`-Feld (raw)?

→ **Empfehlung:** `originalJson` ist Prisma `Json` (strukturiert, immer JSON-normalisiert nach YAML→JSON-Parse). Zusätzliches Feld `sourceFormat: 'json' | 'yaml'` (String) als Default-Hinweis für Export. **Kein** `originalRaw`-Stringfeld — Roundtrip-Treue (Kommentare, Key-Order) ist explizit out of scope.

---

### Scope-Update Sektion A — URL-Only Ingestion (vom User per "ack" bestätigt)

**Entscheidung:** v0.1 unterstützt **ausschließlich URL-Pull** als Spec-Ingestion. Kein File-Upload. Begründung: Sync wird sauber lösbar (jede Spec hat eine Quelle → "Re-pull" funktioniert universal), kein A3-Dilemma, kleinere Upload-UI, keine Multipart-Form. Engineer-Workaround für lokale Specs: gist.github.com oder Commit in ein public Repo.

**PRD-Abweichung:** `prd.md` sagt "User uploads a JSON/YAML file or provides a URL" — wir gehen "URL only". Diese Abweichung wird in der Epic-03-Spec explizit vermerkt.

**Revisionen der A-Empfehlungen unter dieser Entscheidung:**
- **A1:** Größenlimits gelten weiter (5 MB / 200 Endpoints), Prüfung erfolgt nach dem Pull.
- **A2:** Komplett **obsolet** — eine URL = ein File. Externe `$ref`s bleiben aus A5 ein Validierungsfehler.
- **A3:** Dilemma "Re-Upload-Verhalten" entfällt komplett. Stattdessen: **Re-pull-Button** auf jeder Spec (in-place, neue `SpecVersion` mit `label = "Re-pulled from URL"`, alle offenen Findings werden invalidiert und neu erzeugt). Apply-History bleibt im SpecVersion-Tree erhalten.
- **A4:** wird der zentrale Ingestion-Pfad. Optionales `Authorization`-Header-Feld bleibt (one-shot, Token NICHT persistent gespeichert). Authed URL-Pulls können **nicht** re-pulled werden (kein Token-Storage) — UI-Hinweis: "Re-pull is only available for public URLs."
- **A5:** unverändert.
- **A6:** unverändert (Swagger 2.0 out of scope).
- **A7:** unverändert (strukturierte Fehlerliste im URL-Pull-Dialog statt im Upload-Dialog).
- **A8:** unverändert. `sourceFormat` bleibt relevant für Export.

**Konsequenzen für andere Sektionen:**
- **E5 / Empty State:** CTA wird zu **"Add spec from URL"** + Secondary-Link **"Try with a sample spec"**.
- **I5 / Rate-Limiting:** "Uploads: 20/Stunde" wird zu "URL-Pulls: 20/Stunde". "Re-pulls" zählen ins selbe Bucket.
- **I6 / Sample-Specs:** "Try with a sample spec" wird server-seitig als Pseudo-URL-Pull implementiert (kopiert die statische Datei aus `openapi-examples/`, setzt `sourceUrl` auf einen sentinel-Wert wie `apiq:sample/openweathermap`, kein Re-pull-Button).
- **PRD-Schema `sourceType (upload|url)`:** wird zu `sourceType (url|sample)`. `sample` markiert die "Try with a sample"-Specs.
- **Screen "Upload"** aus PRD wird zu **"Add Spec"** mit URL-Input + optionalem Header-Feld.

---

## B. Analyse-Trigger und -Ausführung (relevant für Epic 04)

B1. **Trigger.** Wird die Analyse
- (a) automatisch direkt nach erfolgreichem Upload gestartet,
- (b) erst durch einen "Analyze"-Button auf dem Spec-Detail-Screen gestartet, oder
- (c) automatisch beim ersten Aufruf der Spec-Detail-Seite?

→ **Empfehlung:** **(a) automatisch nach Upload.** Begründung: das Trigger-Moment im PRD ist "ich will eine Zweitmeinung jetzt" — manueller Button verzögert den Wert. Re-Upload (A3) startet ebenfalls automatisch.

B2. **Ausführungsmodell.** Vercel-Server-Actions haben harte Timeout-Grenzen (Hobby ~10 s, Pro ~60 s). Eine Sonnet-Single-Call-Analyse kann je nach Spec-Größe deutlich länger dauern.
- Synchron im Server-Action mit großzügigem Timeout (z. B. Background-Function bis 5 min auf Vercel Pro)?
- Asynchron via Background-Job (z. B. Inngest, Trigger.dev, eigener Worker)?
- Soll für v0.1 ein Polling-Mechanismus reichen, oder Server-Sent-Events / WebSocket?

→ **Empfehlung:** Server-Action upserted Spec + `analysisStatus: 'pending'` und triggert per `fetch` (fire-and-forget) eine **interne API-Route mit `export const maxDuration = 300`** (5 min, Vercel Pro). Diese Route führt den LLM-Call aus und schreibt das Ergebnis in die DB. Client polled die Spec-Row alle **3 s** (auto-stop bei `completed | failed`). **Kein** Inngest / Trigger.dev für v0.1 — wird in v0.2 evaluiert, falls 5 min nicht reichen oder Cold-Start-Probleme auftauchen. Begründung: ein Provider weniger, kein zusätzliches Abo, keine Webhook-Integration.

B3. **Statusanzeige während Analyse.** Welche States sieht der Nutzer auf dem Spec-Detail-Screen?
- `pending | analyzing | completed | failed`?
- Mit Fortschrittsanzeige (z. B. "Analysiere 23/47 Endpunkte")? In v0.1 mit Single-Call ist Fortschritt nicht granular verfügbar — also nur Spinner?
- Wird die Analyse-Dauer vom Server abgeschätzt und angezeigt?

→ **Empfehlung:** States: `pending | analyzing | completed | failed`. Spinner ohne Fortschritt (Single-Call hat keinen Fortschritt). Geschätzte Restzeit als grobe Faustregel (z. B. "Typically 30–90 s") als statischer Text — keine Live-ETA.

B4. **Endpoint-Cap pro Spec für v0.1.** Stripe hat ~500 Endpoints, GitHub mehrere hundert.
- Hard-Cap (z. B. "v0.1 unterstützt Specs mit max. 100 Endpoints")?
- Oder akzeptieren und die Single-Call-Architektur Token-Budget-Begrenzungen entscheiden lassen (mit klarem Fehler bei Überschreitung)?

→ **Empfehlung:** **Hard-Cap 200 Endpoints** (siehe A1). Soft-Warn ab 100. Begründung: deterministische UX statt zufälligen Token-Limit-Fehlern; gibt klare v0.2-Demarkationslinie.

B5. **Re-Analyse nach Patch.**
- (a) Nach jedem Apply automatisch komplette Re-Analyse?
- (b) Nur manueller "Re-Analyze"-Button, getrennt von Apply?
- (c) Inkrementell: nur betroffene Endpoints / nur betroffene Findings?
- Hinweis: Re-Analyse bedeutet erneuter LLM-Cost. Was ist der MVP-Default?

→ **Empfehlung:** **(b) Manueller "Re-Analyze"-Button.** Apply ändert nur den Status der betroffenen Findings auf `applied`. Andere Findings bleiben unverändert. Inkrementelle Re-Eval ist v0.2-Material. Begründung: Cost-Kontrolle, klarer Mental-Model "Findings sind Snapshots der zuletzt analysierten Spec-Version". Zusätzlich: Re-Analyze Button zeigt Banner "Spec hat sich seit letzter Analyse geändert (3 Patches)".

B6. **Cost-Guardrails.** Sind für v0.1 nötig?
- Pro-Workspace-Limit für LLM-Calls pro Tag/Monat?
- Anzeige des Token-Verbrauchs für den Nutzer?
- Oder explizit "out of scope, in v0.1 verlassen wir uns auf das App-Budget"?

→ **Empfehlung:** Soft-Limit pro Workspace: **max. 50 LLM-Calls pro 24 h** (Schutz vor Misuse). Bei Überschreitung: 429-artige UI-Meldung "Daily analysis limit reached, try again tomorrow". **Keine** Token-Anzeige für den Nutzer, **kein** Billing. Begründung: Engineer-Tool, MVP-Skala ist klein, App-Budget genügt.

B7. **OpenRouter-Key.**
- App-managed (eine Server-Env-Variable für alle Nutzer)?
- Oder pro Workspace einstellbar (Bring-Your-Own-Key)?
- BYOK ist für Engineering-Tool-Zielgruppe attraktiv, vergrößert aber den Settings-Scope.

→ **Empfehlung:** **App-managed in v0.1** (`OPENROUTER_API_KEY` Env-Var, ein Key für alle Workspaces). BYOK ist v0.2 — verdoppelt Settings-UI, Error-Handling und Test-Surface ohne MVP-Nutzen.

B8. **Fehlerverhalten.** Wenn der LLM-Call fehlschlägt (Timeout, 5xx, JSON nicht parsebar):
- Gibt es Auto-Retry mit Backoff (Tech-Stack erwähnt das)?
- Wenn alle Retries scheitern: Spec-Status auf `failed`, sichtbarer Retry-Button?
- Werden Teil-Ergebnisse gespeichert oder ist es alles-oder-nichts?

→ **Empfehlung:** **3 Retries** mit exponential backoff (1 s, 4 s, 16 s) nur bei retry-würdigen Fehlern (Network-Timeout, 5xx, 429). 4xx-Fehler ⇒ kein Retry. JSON-Parse-Fehler nach JSON-Fence-Strip ⇒ 1 Retry mit gleichem Prompt. Bei Total-Failure: `analysisStatus = 'failed'` + `errorMessage`, sichtbarer "Retry analysis"-Button auf Spec Detail. **Alles-oder-nichts** — keine Teil-Ergebnisse (Single-Call ist atomar).

---

## C. Finding-Datenmodell und -UI (relevant für Epic 04 + 05)

C1. **Multi-Endpoint-Findings.** Im PRD steht "Endpoint(s) affected" (Plural) und Sort-Hinweis "Number of endpoints affected shown as evidence". Aber das Schema hat `endpointPath`/`endpointMethod` (Singular).
- Ist ein Finding immer 1:1 mit genau einem Endpoint?
- Oder gibt es ein zweites, übergreifendes Finding-Format (Spec-Level, "betrifft 30 Endpoints")?
- Wenn ja: Schema-Änderung — z. B. `affectedEndpoints: { path, method }[]` als `Json`-Feld?

→ **Empfehlung:** **Multi-Endpoint unterstützen.** Schema-Änderung: ersetze `endpointPath`/`endpointMethod` durch `affectedEndpoints: Json` (Array von `{ path, method }`). Spec-Level-Findings (kein konkreter Endpoint) ⇒ leeres Array + zusätzliches Flag `scope: 'spec' | 'endpoint'`. Begründung: PRD spricht explizit "Endpoint(s)" Plural; ein Finding wie "no consistent error envelope across endpoints" ist Spec-Level. Sort by "Number of affected endpoints" wird damit trivial.

C2. **Quality Score.**
- Wird er vom LLM emittiert (z. B. 0–100) oder deterministisch aus Findings abgeleitet (gewichtete Severity-Summe)?
- Anzeige als Zahl, Buchstaben-Grade (A/B/C/D/F), Farb-Badge oder Kombination?
- Was passiert in der Specs-List, wenn die Spec noch nicht analysiert wurde — leer / "—" / "pending"?

→ **Empfehlung:** **Deterministisch ableiten.** Formel: `score = clamp(100 - (15·critical + 7·high + 3·medium + 1·low), 0, 100)`. Anzeige: **Zahl 0–100 mit Farb-Badge** (≥80 grün, 60–79 gelb, <60 rot). In Specs-List vor Analyse: "—" mit Status-Pill ("pending" / "analyzing" / "failed"). Begründung: deterministisch = reproduzierbar, kein zusätzlicher LLM-Drift, Faktoren sind transparent.

C3. **Findings-Liste — Größe und Pagination.**
- Realistische Größenordnung pro Spec: 5–20, 20–100, oder 100+?
- Brauchen wir Pagination / Virtual-Scroll, oder reicht eine vollständige Liste mit Filter+Sort?
- Standard-Sortierung: Severity desc, dann Category asc — bestätigt?

→ **Empfehlung:** Erwartung: **20–80 Findings pro Spec.** Vollständige Liste mit Filter+Sort, **kein Pagination, kein Virtual-Scroll** für v0.1 (bei Bedarf später nachrüsten). Standard-Sort: Severity desc → Category asc → Endpoint-Path asc.

C4. **Filter-Optionen auf Spec Detail.**
- Pflicht für v0.1: Filter nach Severity und Category?
- Optional: Filter nach Status (open / applied / rejected)?
- Optional: Suche nach Endpoint-Pfad?

→ **Empfehlung:** Alle drei: **Severity (Multi-Select), Category (Multi-Select), Status (Toggle: open / applied / rejected — Default: nur "open")**. Endpoint-Path-Suche als Free-Text-Input. Begründung: Engineer-UX — Filter sind billig zu implementieren bei shadcn-Komponenten.

C5. **Patch-Preview / Diff-Stil.**
- (a) Side-by-side Text-Diff (vor/nach), z. B. mit `react-diff-viewer-continued`?
- (b) Inline JSON-Tree mit Highlight der geänderten Pfade?
- (c) Reine Anzeige der JSON-Patch-Operationen (`op`, `path`, `value`)?
- Empfohlen: side-by-side für Engineers — bestätigt?

→ **Empfehlung:** **(a) Side-by-side Text-Diff** (vor/nach) auf JSON-stringified-Subtree (nur die betroffenen Pfade, nicht ganze Spec). Plus collapsible "Show JSON Patch operations"-Detail-Panel mit (c). **Library:** `react-diff-viewer-continued` (oder `monaco-diff-editor`, falls schon im Stack — sonst `react-diff-viewer-continued`).

C6. **Patch-Narration.** Soll zusätzlich zur Operationsliste eine kurze, menschen-lesbare Beschreibung pro Patch existieren ("Adds `cursor` query parameter to `/orders` for stable pagination")? Das würde eher in `narration` oder ein separates Feld passen.

→ **Empfehlung:** Eigenes Feld **`patchSummary: String`** (1 Satz, ≤120 Zeichen) im Finding-Schema. LLM emittiert es als Teil des strukturierten Outputs. UI: über dem Diff angezeigt als Headline. Begründung: trennt "warum es ein Problem ist" (`narration`) von "was der Patch tut" (`patchSummary`) — beides ist relevant.

---

## D. Patch-Loop und Versionierung (relevant für Epic 06)

D1. **Apply-Granularität.** Im PRD: "Apply / Reject buttons" pro Finding.
- Gibt es zusätzlich einen "Apply all of severity X" oder Bulk-Apply für v0.1?
- Oder strikt eine-nach-der-anderen?

→ **Empfehlung:** **Strikt eine-nach-der-anderen** in v0.1. Bulk-Apply ist verlockend, aber mit Patch-Konflikten (D3) im Real-World hochriskant. v0.2-Material.

D2. **SpecVersion-Erzeugung.**
- Jede Apply-Aktion erzeugt eine neue `SpecVersion`?
- Oder werden mehrere Applys innerhalb eines kurzen Zeitfensters zu einer Version zusammengefasst?
- Hat `SpecVersion` zusätzlich ein Label wie "Applied: Add cursor pagination to /orders" (PRD-Schema hat `label`-Feld)?

→ **Empfehlung:** **Jede Apply-Aktion = neue SpecVersion.** Kein Batch. `label` = Finding-Title (z. B. "Add cursor pagination to /orders"). Initial-Upload-Version: `label = "Initial upload"`. Rollback erzeugt Version mit `label = "Rolled back to vN"`.

D3. **Patch-Konflikt.** Wenn Patch-Op B einen Pfad referenziert, der durch Patch A bereits verändert/entfernt wurde:
- Apply blockieren mit Fehler "patch no longer applicable"?
- Auto-rebase versuchen?
- Finding als `stale` markieren?
- Findings nach jedem Apply automatisch re-evaluieren (siehe B5)?

→ **Empfehlung:** **Apply blockieren mit klarer Fehlermeldung** ("Patch can no longer be applied — the spec has changed. Re-analyze to refresh findings."). Finding-Status wird auf neuen Wert **`stale`** gesetzt. Auto-Rebase ist v0.2. Schema-Änderung: `status: open | applied | rejected | stale`. Status `stale` ist read-only — User kann nur Re-Analyze triggern.

D4. **Rejected Findings.**
- Können sie wieder geöffnet werden ("undo reject")?
- Werden sie auf Spec Detail standardmäßig versteckt oder mit "Show rejected" einblendbar?
- Beim Re-Analyze: tauchen vorher rejected Findings wieder auf, oder werden sie über einen Hash/Fingerabdruck als "schon abgelehnt" beibehalten?

→ **Empfehlung:** Default-Filter zeigt nur `open`. Toggle "Show rejected" und "Show applied" einblendbar (siehe C4). **Undo Reject** als Button auf rejected Findings (setzt zurück auf `open`). Beim **Re-Analyze**: alte `applied`/`rejected`/`stale`-Findings werden zur SpecVersion-History; LLM erzeugt frische Findings ohne Hash-Mapping. Begründung: Hash-Mapping ist heuristisch und fehleranfällig — v0.1 keeps it simple.

D5. **Rollback.**
- Einzeln pro Patch (Apply rückgängig machen) oder nur "Zurück zu SpecVersion X"?
- Ist die Versionshistorie als Liste sichtbar im Spec Detail oder eher versteckt unter einem Drop-Down?
- Reaktiviert ein Rollback automatisch das Finding (Status zurück auf `open`)?

→ **Empfehlung:** **Per-Finding "Undo Apply"-Button** auf applied Findings. Erzeugt neue SpecVersion mit dem vorigen Zustand des betroffenen Subtrees, setzt Finding zurück auf `open`. **Rollback-zu-Version** (full-history-rewind) ist v0.2. Versions-History ist sichtbar als read-only Drop-Down/Drawer im Spec Detail. Begründung: Per-Finding-Undo ist mental linear ("ich nehme den letzten Patch zurück") und deckt 95 % der Real-World-Cases.

D6. **Manuelles Editieren der Spec.** In v0.1 explizit nicht erwähnt.
- Bestätigung: Der Nutzer kann die Spec im UI **nicht** manuell bearbeiten — nur via Patch-Apply.
- Re-Upload mit derselben Identität verhält sich wie A3.

→ **Empfehlung:** **Bestätigt — kein manuelles Editieren.** Nur Apply / Undo Apply / Reject / Re-Upload. Manueller Inline-Editor ist v0.2 oder später.

---

## E. Auth, Workspace, Onboarding (relevant für Epic 02)

E1. **Auth-Methoden.** Tech-Stack nennt Auth.js v5 mit Credentials. Bestätigung:
- Nur Credentials (E-Mail + Passwort) für v0.1?
- Keine OAuth-Provider, kein Magic Link?

→ **Empfehlung:** **Nur Credentials** für v0.1, bestätigt. OAuth (GitHub-Login wäre für die Engineer-Zielgruppe attraktiv) ist v0.2-Material.

E2. **E-Mail-Verifizierung und Passwort-Reset.**
- E-Mail-Verifizierung beim Signup: ja/nein?
- Password-Reset-Flow: ja/nein?
- Falls ja: brauchen wir einen Mail-Provider (Resend, Postmark, …)? Welcher?
- Falls nein für v0.1: explizit "out of scope, dafür ist Re-Signup über Support nötig"?

→ **Empfehlung:** **Beides out of scope für v0.1.** Keine Mail-Verifikation, kein Password-Reset. Begründung: kein Mail-Provider im Stack, Engineer-Zielgruppe nutzt Password-Manager. Bei vergessenem Passwort: Hinweis-Text "contact support" (= manuelles DB-Reset durch Lead). v0.2 mit Resend.

E3. **Workspace-Setup beim Signup.**
- Wird automatisch ein Workspace mit Default-Name (z. B. E-Mail-Local-Part oder "Personal Workspace") angelegt?
- Oder gibt es einen Onboarding-Schritt, in dem der Nutzer den Workspace-Namen wählt?

→ **Empfehlung:** **Auto-Erstellung mit Default-Name = E-Mail-Local-Part** (z. B. `per.paulsen@…` ⇒ `per.paulsen`). Editierbar in Settings. Kein Onboarding-Flow.

E4. **Mehrere Workspaces pro User.** PRD: "v0.1 supports one user per workspace".
- Heißt das auch: ein User gehört zu **genau einem** Workspace? Kein Workspace-Switcher?
- Oder: ein User kann theoretisch in mehrere Workspaces, aber jeder Workspace hat genau einen User?

→ **Empfehlung:** **Strict 1:1 in v0.1** — ein User → genau ein Workspace. Kein Switcher. Schema erlaubt aber Many-to-Many (`UserWorkspace`-Join-Tabelle) als Vorbereitung auf v0.2 (Team-Features), nur die Constraint wird auf "max. 1 aktiver Workspace pro User" gesetzt. Begründung: Schema-Future-Proofing kostet wenig, vermeidet Migration in v0.2.

E5. **Erste Erfahrung nach Login.** Empty Specs List:
- CTA "Upload your first spec"?
- Optional: Sample-Spec laden (z. B. einer aus `openapi-examples/`)?
- Tour / Hinweis-Banner: ja/nein für v0.1?

→ **Empfehlung:** Empty State mit großem CTA **"Upload your first spec"** + Secondary-Link **"Try with a sample spec"** (lädt z. B. die OpenWeatherMap-Spec aus `openapi-examples/` als neue Spec). **Kein Tour-Banner**, keine Modals — Engineer-UX ist self-service.

---

## F. Settings (relevant für Epic 07)

F1. **Inhalt der Settings-Page für v0.1.** PRD: "Account info, sign-out, (later) integrations".
- Editierbare Felder: nur Workspace-Name? Auch User-Name? E-Mail?
- Passwort-Änderung: ja/nein?
- Account-Löschung: ja/nein für v0.1?
- BYOK OpenRouter-Key (siehe B7): hier oder out of scope?

→ **Empfehlung:**
- **Editierbar:** Workspace-Name, User-Display-Name.
- **Read-only:** E-Mail.
- **Sign-Out:** ja.
- **Passwort-Änderung:** out of scope (siehe E2).
- **Account-Löschung:** out of scope für v0.1 (manuell durch Lead).
- **BYOK:** out of scope (siehe B7).

---

## G. Export (relevant für Epic 08)

G1. **Export-Formate.**
- JSON und YAML beide für v0.1, bestätigt?
- YAML: Preserve Original-Key-Reihenfolge und Kommentare nicht möglich (LLM-Patches mutieren JSON), also normalisiert? Bestätigung, dass Roundtrip-Treue out of scope ist?

→ **Empfehlung:** **JSON und YAML beide** unterstützt. YAML wird normalisiert (kein Roundtrip mit Kommentaren / Original-Order). Default-Format = `sourceFormat` (siehe A8). Bestätigt: Roundtrip-Treue out of scope.

G2. **Export-Inhalt.**
- Export der `currentJson` (dereferenced) oder Re-Bundling der `$ref`s?
- Re-Bundling ist nicht trivial. Empfehlung: dereferenced exportieren — bestätigt?
- Export einer spezifischen Version (`SpecVersion.id`) oder nur der aktuellen?

→ **Empfehlung:** **Dereferenced `currentJson`** wird exportiert. Re-Bundling der `$ref`s ist v0.2 (Lib `@apidevtools/swagger-parser` kann das, aber Roundtrip-Stabilität ist heikel). **Nur aktuelle Version** für v0.1 — Specific-Version-Export ist v0.2.

G3. **Filename-Konvention.** `<spec-name>-<timestamp>.json`/`.yaml`? `<spec-name>-v<n>.json`?

→ **Empfehlung:** `<slug(spec.name)>-v<n>.<ext>`, wobei `n` der laufende SpecVersion-Counter ist (initial = 1, jedes Apply +1). Beispiel: `petstore-v3.yaml`. Begründung: Versions-Counter ist deterministisch und für Engineer-Workflows klarer als Timestamp.

---

## H. Phase 0 — Research Spike (relevant für Epic 00)

H1. **Spec-Auswahl für den Spike.** PRD nennt Stripe / OpenWeatherMap / Twilio / PagerDuty / GitHub / APIs.guru.
- Ist die Auswahl eine Aufgabe der Spike-Kickoff-Phase (Selektion in `specs/research-spike.md` dokumentieren)?
- Oder soll das Epic 00 die Auswahl als Vorgabe enthalten?

→ **Empfehlung:** Epic 00 enthält **konkrete Vorgabe von 4 Specs**: (1) **OpenWeatherMap** als kleine Reference-Spec (Reference-Target hier), (2) **Stripe (Slice ≤200 Endpoints)** für "what good looks like", (3) **PagerDuty** für mid-sized real-world, (4) **eine APIs.guru-Spec** für Messiness. Auswahl + Begründung wird in `specs/research-spike.md` dokumentiert; Spike-Kickoff darf umstellen (mit Begründung). Begründung: Definitive Vorgabe vermeidet Bikeshedding, behält aber Anpassungsfreiheit.

H2. **Reference Target Output.**
- Für **eine** ausgewählte Spec: ein manuell verfasstes "Gold-Standard" Findings-Dokument als Kalibrierziel — bestätigt.
- Größenordnung: 5 Findings, 15, 30?
- Format: Markdown nach derselben Struktur, die das LLM emittieren soll?

→ **Empfehlung:** Reference-Spec = **OpenWeatherMap** (klein, überschaubar). **15 Findings** als Ziel — verteilt 3 Critical, 5 High, 5 Medium, 2 Low; alle drei Kategorien (Clarity / Design / Risk) abgedeckt. Format: Markdown mit denselben Feldern wie das LLM-Output-Schema (`title`, `narration`, `rationale`, `category`, `severity`, `affectedEndpoints`, `patchOps`, `patchSummary`). Datei: `openapi-examples/openweathermap/reference/findings-target.md`.

H3. **Spike-Ergebnis-Format.**
- Liefert der Spike nur Markdown (`research-spike.md`)?
- Oder zusätzlich ein lauffähiges Test-Harness (Skript, das die proven Prompt-Variante gegen alle Sample-Specs laufen lässt)?
- Falls Harness: in welcher Form (Standalone-Script, Vitest-Suite, Notebook)?

→ **Empfehlung:** **Beides.** Markdown (`specs/research-spike.md`) plus minimales **Standalone-Script** `scripts/spike/run-prompt.ts` (TypeScript, ausführbar via `npx tsx`). Output: `specs/research-spike-runs/<run-name>.json` (Findings + Tokens + Cost + Patch-Apply-Validierungs-Report). **Kein Vitest** — Iterations-Geschwindigkeit zählt, Test-Suite ist v0.2.

H4. **Spike-Abschlusskriterien.**
- Welche konkreten "Pass"-Kriterien sind im Spike-Erfolg verankert? Beispiele:
  - Mindestens 80 % der Patches gegen die Sample-Specs gelten ohne Konflikt
  - Findings-Output für die Reference-Spec deckt mindestens X der manuell identifizierten Findings ab
  - Keine halluzinierten Pfade in N Sample-Specs
- Brauchen wir formale Pass-Kriterien, oder reicht qualitative Kalibrierung durch den Lead?

→ **Empfehlung:** **3 harte Kriterien + 1 qualitatives:**
1. **≥80 % der LLM-emittierten Patches** auf den 4 Sample-Specs gelten ohne Konflikt (apply-valid via `fast-json-patch`).
2. **≥70 % Coverage**: Findings für die Reference-Spec decken ≥70 % der 15 manuell identifizierten Reference-Findings ab (Mapping per Title-Similarity + Endpoint-Match, manuell verifiziert).
3. **0 halluzinierte Pfade** in allen 4 Specs (jeder `op.path` referenziert einen existenten Pfad oder ist eindeutig als `add` neuer Pfad markiert).
4. **Qualitative Approval** durch Lead: Narrationen lesen sich engineering-grade, nicht Spectral-style.

H5. **Spike-Output-Schema.**
- PRD-Schema enthält `narration` und `rationale` getrennt — ist das fix oder offen für die Spike?
- Bestätigt der Spike auch den Quality-Score (siehe C2)?

→ **Empfehlung:** **PRD-Schema ist Default-Hypothese, Spike darf es ändern** mit Begründung in `research-spike.md`. Konkret darf der Spike `narration` und `rationale` zusammenfassen, falls die Trennung in der Praxis nicht trägt. **Quality-Score wird nicht vom Spike bestätigt** — er ist deterministisch (siehe C2) und unabhängig vom Prompt. Aber: Spike darf die **Severity-Kalibrierung** vorschlagen (welcher Finding-Typ ist `critical` vs. `high`).

---

## I. Cross-cutting / Operationelles

I1. **Logging und Observability.**
- LLM-Call-Logs (Prompt, Response, Tokens, Cost) — gespeichert pro Call für Debugging?
- In v0.1: nur Server-Logs, oder eine `LLMCall`-Tabelle mit Foreign Key auf Spec/SpecVersion?

→ **Empfehlung:** **`LLMCall`-Tabelle** (workspace-scoped):
```
LLMCall { id, workspaceId, specId?, specVersionId?,
          model, prompt (Json), responseRaw (Text),
          tokensIn, tokensOut, costUSD, durationMs,
          status, errorMessage?, createdAt }
```
Wird pro LLM-Call (auch Retries) geschrieben. Im UI v0.1 nicht sichtbar — interne Debugging-Tabelle. Begründung: vor Live-Debugging schützen, Kosten-Audit ermöglichen.

I2. **Background-Jobs / Queue.**
- Falls B2 → asynchron: Welcher Anbieter? Inngest, Trigger.dev, QStash, eigene Lösung mit Vercel Cron + DB?
- Tech-Stack erwähnt keinen Job-Provider — sollen wir einen wählen oder pro-Epic 04 entscheiden?

→ **Empfehlung:** **Kein externer Job-Provider** in v0.1 (siehe B2: interne API-Route mit `maxDuration = 300`). Falls 5 min in der Praxis nicht reichen oder Cold-Starts problematisch werden: Inngest in v0.2 evaluieren (Vercel-Integration, Generous-Free-Tier).

I3. **Browser- und Device-Support.**
- Targets: Chrome / Firefox / Safari aktuelle Versionen?
- Mobil/Tablet: out of scope laut PRD; bestätigen wir Desktop-only mit Mindest-Viewport (z. B. 1280px)?

→ **Empfehlung:** **Latest 2 Versionen** von Chrome / Firefox / Safari / Edge. Desktop-only, **Mindest-Viewport 1280 × 800**. Mobile zeigt ein "Best on desktop"-Fallback-Banner (rendert die App, aber ohne Layout-Garantie). Begründung: PRD sagt "Engineering tool, desktop-first".

I4. **Accessibility / i18n.**
- Für v0.1: WCAG AA als Ziel oder out of scope?
- i18n: Englisch-only, bestätigt?

→ **Empfehlung:** **i18n: Englisch-only**, bestätigt. **A11y: WCAG AA als Best-Effort** (shadcn-Defaults reichen weitgehend), aber kein formales Audit für v0.1. Keyboard-Navigation und Screen-Reader-Labels sind Pflicht für Forms und Apply/Reject-Buttons.

I5. **Rate-Limiting.**
- Für API-Routes (Upload, URL-Pull, Apply): Rate-Limit pro User notwendig in v0.1, oder out of scope?

→ **Empfehlung:** **DB-basiertes Soft-Rate-Limit** pro Workspace:
- Uploads: 20 / Stunde
- URL-Pulls: 20 / Stunde
- LLM-Calls: 50 / 24 h (siehe B6)
Bei Überschreitung: 429-artige Server-Action-Response mit `{ error: 'rate_limited', retryAt }`. Kein Upstash / external Limiter. Begründung: MVP-Schutz vor Misuse, ohne neue Infrastruktur.

I6. **Sample-Specs in der App.**
- Sind die `openapi-examples/`-Dateien nur Entwicklungs-Fixtures, oder werden sie als "Try a sample" auch in der UI verfügbar gemacht?

→ **Empfehlung:** **Beides.** Dev-Fixtures + 1 ausgewählte Sample (OpenWeatherMap) als "Try with a sample spec" auf dem Empty-State der Specs-List (siehe E5). Klick erzeugt eine neue Spec im aktuellen Workspace, indem die Datei aus `openapi-examples/` kopiert wird (server-seitig, nicht client-seitig).

I7. **Scope-Bestätigung für Phasen-Reihenfolge.**
- Die im PRD vorgeschlagene Epic-Sequenz (00 → 08) soll 1:1 in `specs/`-Files überführt werden?
- Oder sollen wir Epics anders zuschneiden (z. B. Settings + Specs-List zusammen, Patch-Apply zusammen mit Spec-Detail)?

→ **Empfehlung:** **PRD-Sequenz 1:1 übernehmen** (Epic 00 bis 08, neun Files). Begründung: PRD-Sequenz ist gut zugeschnitten — jede Phase hat klare Test-Surface. Epic 07 fasst Specs-List und Settings bewusst zusammen (beide sind klein, gehören zur "Workspace-Übersicht"-UI). Epic 06 (Patch Apply) ist bewusst getrennt von Epic 05 (Spec Detail Read), weil Apply die größere Komplexität (SpecVersion, Konflikte, Undo) trägt.

---

## Antworten

> Bitte hier oder direkt unter den jeweiligen Block schreiben. Ich erweitere dann ggf. mit Folgefragen, bevor ich Phase 2 (Epic-Derivation) starte.
