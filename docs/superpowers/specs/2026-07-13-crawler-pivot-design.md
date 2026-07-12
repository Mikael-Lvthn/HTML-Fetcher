# Design: Pivot from MTL translation tool to Novel Crawler

**Date:** 2026-07-13
**Status:** Approved (pending spec review)

## Goal

Reorient the app away from any "AI translation" framing and center it on its
web-crawling / scraping / cleaning features. The AI translation layer was never
actually implemented — it exists only as vestigial scaffolding (unused DB
columns, types, and UI fields). This change removes that scaffolding, tightens
the scraping code, and rebrands the product as **Novel Crawler**.

**Phasing / implementation order:**
- **Phase 1 — Pivot (this section):** remove the AI/translation scaffolding,
  consolidate scrapers, rebrand. Implemented first.
- **Phase 2 — Firecrawl engine + Reader:** add a toggleable Firecrawl-backed
  content engine (off = existing cheerio server-fetch, on = Firecrawl for
  JS-heavy / protected sites like wtr-lab), shared by the novel crawler and a
  new URL-to-clean-format Reader (Markdown / HTML / structured JSON). Implemented
  after Phase 1. See the "Phase 2" section below.

## Scope decisions (settled during brainstorming)

- **Core purpose:** Crawl a novel's table of contents → scrape each chapter →
  strip HTML/ads to clean text → store in a per-user library. Keep Supabase,
  auth, and "projects" as organizational folders.
- **Projects become simple folders:** title, subtitle, color. Remove
  `system_prompt`, `keywords`, `fandoms`, and the keyword auto-detection feature.
- **Database:** non-destructive. Leave unused columns/tables in Supabase; only
  remove code references. No migration script.
- **Scrapers:** merge the useful cleaning rules from the unused `textExtractor`
  into `scraper.ts`, then delete the duplicate extractor and its route.
- **Branding:** rename to **Novel Crawler**.

## Non-goals (explicitly out of scope)

- Dropping Supabase columns / tables (left in place, harmless).
- Hardening the `ingest-browser-content` endpoint (service-role key + `*` CORS +
  client-supplied `projectId` with no auth check). Flagged for a separate
  follow-up; not part of this pivot.
- Any new features. This is removal + consolidation + rebrand only.

## Changes

### A. Type layer — `src/types/index.ts`
- `Project`: remove `fandoms`, `keywords`, `system_prompt`. Keep `id`,
  `user_id`, `title`, `subtitle`, `color`, `created_at`, `updated_at`,
  `chapter_count?`, `total_word_count?`.
- `UserSettings`: remove `openrouter_api_key`, `preferred_model`. Keep `id`,
  `user_id`, `scraper_cookies`.
- Delete the `PromptVersion` and `AIModel` interfaces.

### B. Auto-detection removal
- Delete `src/lib/projectDetector.ts`.
- `src/components/ChapterProcessor.tsx`:
  - Remove the `detectProject` import and its call.
  - Remove the `detectedProject` state and the green "Detected" banner in the
    single-chapter Project card.
  - Remove the `detect` step from both `ProcessingStep[]` arrays so the flow is
    `fetch|clean → save`.
  - Single/paste mode already requires a manually selected project (the process
    button is disabled without one), so no functional gap is introduced.

### C. Project CRUD UI
- `src/app/(app)/projects/new/page.tsx`:
  - Remove the **Fandoms** and **Detection Keywords** inputs and their state.
  - Drop `fandoms`, `keywords`, `system_prompt` from the `projects` insert.
  - Update header subtitle copy ("Create a new translation project" → "Create a
    new project").
- `src/app/(app)/projects/[id]/ProjectDetailClient.tsx`:
  - Remove `keywordsInput` and `editFandoms` state and `saveKeywords()`.
  - Remove the fandoms edit input, the fandoms tag row in the header, and the
    entire "🔍 Auto-Detect Keywords" section.
  - Keep `saveProjectDetails()` (now updating only title/subtitle), the
    "🚀 Browser Crawler" beam section, and Chapter History untouched.
- `src/components/ProjectCard.tsx`:
  - Remove the Fandoms tag block.

### D. Scraper consolidation
- `src/lib/scraper.ts`: extend `finalizeText()` with the useful cleaning from
  `textExtractor.ts`:
  - MTL/site-artifact stripping: `(End of this chapter)`, `(End of Chapter)`,
    `Please read on the original site`, `Support the author by reading on`.
  - HTML-entity decoding: `&nbsp;` → space, `&amp;` → `&`, `&lt;` → `<`,
    `&gt;` → `>`.
  - Preserve existing behavior (ad-blocker-warning short-circuit, blank-line
    collapsing, per-line trim).
- Delete `src/lib/textExtractor.ts`.
- Delete `src/app/api/scrape/route.ts`.
- Confirmed via grep: only these two files reference each other; nothing in the
  live UI imports `textExtractor` or calls `/api/scrape`.

### E. Branding / copy (Novel Crawler)
Replace translation/AI wording with crawl-focused copy in:
- `src/app/layout.tsx` — `metadata.title` and `metadata.description`.
- `src/components/Sidebar.tsx` — brand name "MTL Cleaner" and
  "Fanfic Translation Tool" subtitle.
- `src/app/(app)/dashboard/DashboardClient.tsx` — "translation project(s)"
  subtitle and empty-state copy.
- `src/app/auth/login/page.tsx` and `src/app/auth/signup/page.tsx` — brand name
  and tagline.

New brand: **Novel Crawler**. Suggested tagline: "Crawl, clean, and archive web
novels." Package `name` in `package.json` may be left as `mtl-cleaner` (internal
only) unless a rename is trivial.

## Verification

No test framework exists in this repo (no test deps in `package.json`).

1. `npm run lint` — passes clean.
2. `npm run build` — passes clean. A clean type-check across the build proves the
   `Project` / `UserSettings` field removals are consistent everywhere they are
   consumed.
3. Manual smoke test: create a project (no fandoms/keywords fields present) →
   crawl a novel index → clean a chapter → confirm it saves to history.

## Files touched (summary)

Modified:
- `src/types/index.ts`
- `src/components/ChapterProcessor.tsx`
- `src/app/(app)/projects/new/page.tsx`
- `src/app/(app)/projects/[id]/ProjectDetailClient.tsx`
- `src/components/ProjectCard.tsx`
- `src/lib/scraper.ts`
- `src/app/layout.tsx`
- `src/components/Sidebar.tsx`
- `src/app/(app)/dashboard/DashboardClient.tsx`
- `src/app/auth/login/page.tsx`
- `src/app/auth/signup/page.tsx`

Deleted:
- `src/lib/projectDetector.ts`
- `src/lib/textExtractor.ts`
- `src/app/api/scrape/route.ts`

---

# Phase 2: Firecrawl content engine (toggleable) + Reader

## Goal

Add a **Firecrawl-backed content engine** that the app can toggle on and off,
plus a new **Reader** feature that turns any URL into clean **Markdown**,
**HTML**, or **structured JSON**. When the toggle is **off**, the app keeps using
its existing server-fetch + cheerio path (free, works on simple sites). When
**on**, requests go through Firecrawl's REST API, which renders JavaScript and
defeats anti-bot / encrypted content — so protected sites like wtr-lab.com
return real content.

**Output parity is a hard requirement:** on the novel-crawler path, the cleaned
text Firecrawl produces MUST be identical in shape to what the current crawler
produces today (main text only, ads/nav/watermarks removed). This is guaranteed
by design — see the parity approach below. Implemented after Phase 1.

## Scope decisions (settled during brainstorming)

- **Engine:** integrate **Firecrawl** via its REST API
  (`POST https://api.firecrawl.dev/v1/scrape`, `Authorization: Bearer <key>`).
  The in-environment Firecrawl MCP tools are for the agent only; the deployed app
  uses the HTTP API.
- **Output parity (crawler path):** Firecrawl replaces ONLY the `fetch()` step.
  It returns the fully-rendered **raw HTML**, which is then passed through the
  EXISTING `cleanChapterHtml()` → `finalizeText()` pipeline unchanged. Because the
  same cleaning code runs regardless of engine, the stored/displayed text is
  identical in shape (clean prose, ads/watermarks stripped) whether the toggle is
  on or off.
- **Toggle:** a per-request on/off switch, **defaulting off** to protect credits.
  Off = cheerio server-fetch; On = Firecrawl. Ephemeral UI state (not persisted);
  the boolean is passed to the API per call.
- **Shared engine:** one helper (`src/lib/contentFetcher.ts`) fetches rendered
  HTML (server-fetch when off, Firecrawl when on) and is used by BOTH the novel
  chapter flow (`clean-chapter`) and the Reader (`read`).
- **API key:** a **single, editable, shared key — NOT per-user.** Stored in a new
  one-row `app_settings` table and edited from the Settings UI, so it can be
  swapped between different Firecrawl accounts at any time.
- **Structured JSON (Reader):** deterministic metadata only (no AI/LLM). Built
  from Firecrawl's `metadata` + `links` (on) or cheerio (off). Firecrawl's LLM
  `json`/`jsonOptions` extraction is deliberately NOT used.
- **Positioning:** the Reader is a new capability *alongside* the novel crawler,
  reachable from its own `/reader` page + sidebar entry.

## Verified facts (probed against live Firecrawl 2026-07-13)

- `firecrawl_scrape` on the wtr-lab chapter (JS-rendered, encrypted body)
  returned the real chapter prose. `rawHtml` (post-render) contains the decrypted
  text — 60 hits on a known character name, zero remaining `arr:` cipher blobs.
- **Stale selector:** the site's content container is now
  `<div class="chapter-body">` with per-line `<div class="wtr-line">`, NOT the
  `#read-content` that `cleanChapterHtml` currently targets. The selector list
  must add `.chapter-body` for extraction to hit the right node.
- **Ad-blocker trap:** Firecrawl output includes an inline "Ad Blocker Detected"
  notice, and `finalizeText()` currently returns `''` when it detects that text.
  Extracting only `.chapter-body` keeps that notice OUT of the extracted subtree,
  so the trap never fires. Inline watermark lines (`【…domain…】`, obfuscated
  `w?k?n.com`) are removed by the finalizeText artifact rules (extend Phase 1 D).
- Response shape: `{ rawHtml?, markdown?, html?, links?, metadata: { title,
  description, statusCode, sourceURL, creditsUsed, ... } }`.
- **Cost: 1 credit per scrape** on the `basic` proxy. `waitFor` (~6000ms) helps
  JS render; `onlyMainContent` trims nav/chrome for the Reader's markdown/html.

## Non-goals (Phase 2)

- Firecrawl's LLM `json` schema extraction (would reintroduce an LLM; excluded).
- Multi-page `crawl`/`map` (single URL → single result only). The existing
  `crawl-novel` TOC discovery is unchanged; Firecrawl is only for content fetch.
- Persisting the toggle as a saved default. Easy later addition; out of scope now.
- Auto-fallback (silently switching to Firecrawl when cheerio yields too little).
  The switch is explicit/user-controlled for now.

## Changes

### A. Scraper selector fix — `src/lib/scraper.ts`
- Add `.chapter-body` (and `.wtr-line` as a sibling hint) to the `WTR_SELECTORS`
  list in `cleanChapterHtml` so extraction targets the real content container.
- Extend `finalizeText()` artifact stripping (from Phase 1 D) to also drop the
  bracketed watermark lines (`【…】` promo lines) and obfuscated-domain lines.
- This benefits both engines; it is what makes the parity guarantee hold on
  Firecrawl-rendered HTML.

### B. Shared content engine — `src/lib/contentFetcher.ts` (new)
- Export `fetchRenderedHtml(url, opts)` where
  `opts = { useFirecrawl: boolean, firecrawlKey?: string, cookies?: string }`.
  Returns the (rendered) page HTML as a string — this is the drop-in `fetch()`
  replacement that guarantees parity.
  - **Off:** the existing server `fetch()` with UA/referer/cookie headers.
  - **On:** `POST https://api.firecrawl.dev/v1/scrape` with
    `{ url, formats: ['rawHtml'], waitFor: 6000 }` + `Authorization: Bearer <key>`;
    return `data.rawHtml`.
  - If `useFirecrawl` is true but no key is configured, throw a clear error
    ("Firecrawl is enabled but no API key is set in Settings").
- Export `fetchForReader(url, opts)` for the Reader, returning
  `{ markdown, html, text, metadata: { title, description, sourceUrl, links? } }`:
  - **On:** one Firecrawl scrape with `formats: ['markdown','html','links']`,
    `onlyMainContent: true`; map fields directly.
  - **Off:** `fetchRenderedHtml` → cheerio extract → `html` (content subtree),
    `markdown` via `turndown`, `text` via existing cleaning.

### C. `clean-chapter` — swap fetch for the shared engine
- `src/app/api/clean-chapter/route.ts`:
  - Accept a `useFirecrawl?: boolean` field in the POST body.
  - Read the single Firecrawl key from `app_settings` (see F).
  - Replace the inline `fetch(url, …)` with
    `fetchRenderedHtml(url, { useFirecrawl, firecrawlKey, cookies })`, then call
    the SAME `cleanChapterHtml(html)` as today.
  - Toggle-off behavior is byte-for-byte the current behavior; toggle-on differs
    only in where the HTML comes from → identical cleaned output (parity).

### D. Novel crawler UI — `src/components/ChapterProcessor.tsx`
- Add a **"Use Firecrawl"** toggle (switch), default off, visible across the
  single / bulk / crawl modes.
- Include `useFirecrawl` in the `/api/clean-chapter` request bodies (single +
  bulk loops).
- Small helper text noting Firecrawl uses credits + requires a key in Settings.

### E. Reader — new API route `src/app/api/read/route.ts`
- `POST { url, format: 'markdown' | 'html' | 'json', useFirecrawl?: boolean }`.
- Validate `url`; read the Firecrawl key from `app_settings`.
- Call `fetchForReader(url, { useFirecrawl, firecrawlKey })` and shape output:
  - `markdown` → `{ format, content: result.markdown }`.
  - `html` → `{ format, content: result.html }`.
  - `json` → `{ format, data: { title, description, url, text, links } }`.
- `AbortController` timeout (~30s); map failures to helpful messages.

### F. Reader UI — `/reader`
- `src/app/(app)/reader/page.tsx` (server component under the authed `(app)`
  group) rendering `ReaderClient.tsx`.
- `src/app/(app)/reader/ReaderClient.tsx` (client):
  - URL input, format tabs (Markdown / HTML / JSON), and the **Use Firecrawl**
    toggle (default off).
  - Submit → `POST /api/read`.
  - Output pane with **Copy** and **Download** (`.md` / `.html` / `.json`)
    buttons and a word/char count.
  - Reuse `card`, `input-field`, `btn-primary`, `spinner`, `react-hot-toast`.

### G. Settings — single global Firecrawl API key
- **DB:** create a one-row global config table (run once in the Supabase SQL
  editor):
  ```sql
  CREATE TABLE IF NOT EXISTS app_settings (
    id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    firecrawl_api_key text
  );
  INSERT INTO app_settings (id) VALUES (1) ON CONFLICT DO NOTHING;
  ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
  CREATE POLICY app_settings_read  ON app_settings FOR SELECT TO authenticated USING (true);
  CREATE POLICY app_settings_write ON app_settings FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
  ```
  Single row (`id = 1`), so it is global — not per-user. Any authenticated user
  can read/edit it (acceptable for single-operator use; noted as a trade-off).
- `src/types/index.ts`: add an `AppSettings` interface (`{ firecrawl_api_key:
  string | null }`). `UserSettings` is unchanged from Phase 1 (no per-user key).
- `src/app/(app)/settings/SettingsClient.tsx` (+ `settings/page.tsx`): add a
  Firecrawl API key input, loaded from and saved to `app_settings` (row `id = 1`),
  next to the existing scraper-cookies field.

### H. Navigation — `src/components/Sidebar.tsx`
- Add a "Reader" nav item pointing to `/reader`.

### I. Dependency
- Add `turndown` (+ `@types/turndown`) for HTML→Markdown on the Reader's off path.

## Verification (Phase 2)

1. `npm run lint` — clean.
2. `npm run build` — clean.
3. **Parity check (the key one):** pick a simple site a plain fetch CAN read.
   Clean a chapter with the toggle **off**, then **on** (Firecrawl). The saved
   cleaned text should match (same extraction pipeline) — confirm no markdown
   artifacts, no ads, same paragraphing.
4. Toggle **off**: Reader returns Markdown / HTML / JSON for example.com; a normal
   chapter cleans and saves as before.
5. Toggle **on** (key set in Settings): a wtr-lab chapter returns real decrypted
   prose via BOTH the crawler and the Reader; `.chapter-body` is extracted; the
   "Ad Blocker Detected" trap does not fire; watermark lines are stripped.
6. Toggle on with no key configured → clear "set your key in Settings" error.

## Files touched (Phase 2)

New:
- `src/lib/contentFetcher.ts`
- `src/app/api/read/route.ts`
- `src/app/(app)/reader/page.tsx`
- `src/app/(app)/reader/ReaderClient.tsx`

Modified:
- `src/lib/scraper.ts` (add `.chapter-body` selector + watermark stripping)
- `src/app/api/clean-chapter/route.ts`
- `src/components/ChapterProcessor.tsx`
- `src/app/(app)/settings/SettingsClient.tsx` and `settings/page.tsx`
- `src/types/index.ts` (add `AppSettings` interface)
- `src/components/Sidebar.tsx`
- `package.json` (add `turndown`, `@types/turndown`)

Database (one-time, run by user):
- Create the `app_settings` table + RLS policies (SQL in section G).

Database (one-time, run by user):
- `ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS firecrawl_api_key text;`
