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
return real content. Implemented after Phase 1.

## Scope decisions (settled during brainstorming)

- **Engine:** integrate **Firecrawl** via its REST API
  (`POST https://api.firecrawl.dev/v1/scrape`, `Authorization: Bearer <key>`).
  The in-environment Firecrawl MCP tools are for the agent only; the deployed app
  uses the HTTP API.
- **Toggle:** a per-request on/off switch, **defaulting off** to protect credits.
  Off = cheerio server-fetch; On = Firecrawl. Ephemeral UI state (not persisted);
  the boolean is passed to the API per call.
- **Shared engine:** one helper (`src/lib/contentFetcher.ts`) is used by BOTH the
  novel chapter flow (`clean-chapter`) and the Reader (`read`). Single place that
  branches on the toggle and normalizes output.
- **API key:** stored **per-user** in Settings, in a new
  `user_settings.firecrawl_api_key` column (mirrors the existing
  `scraper_cookies`). Each user spends their own Firecrawl credits.
- **Structured JSON:** deterministic metadata only (no AI/LLM). Built from
  Firecrawl's `metadata` + `links` (toggle on) or cheerio (toggle off). The
  Firecrawl `json`/`jsonOptions` LLM-extraction feature is deliberately NOT used.
- **Positioning:** the Reader is a new capability *alongside* the novel crawler,
  reachable from its own `/reader` page + sidebar entry.

## Verified facts (probed against live Firecrawl 2026-07-13)

- `firecrawl_scrape` on the wtr-lab chapter (JS-rendered, encrypted body)
  returned clean Markdown of the real chapter prose — it even followed the
  infinite-scroll reader and captured chapters 1–3 in one call.
- Response shape: `{ markdown, html?, links?, metadata: { title, description,
  statusCode, sourceURL, creditsUsed, ... } }`.
- **Cost: 1 credit per scrape** on the `basic` proxy. `waitFor` (e.g. 6000ms)
  helps JS render; `onlyMainContent: true` trims nav/chrome.
- Firecrawl still leaves site watermark / "Ad Blocker Detected" lines →
  `finalizeText()`-style artifact stripping (Phase 1, section D) scrubs them.

## Non-goals (Phase 2)

- Firecrawl's LLM `json` schema extraction (would reintroduce an LLM; excluded).
- Multi-page `crawl`/`map` (single URL → single result only). The existing
  `crawl-novel` TOC discovery is unchanged; Firecrawl is only for content fetch.
- Persisting the toggle as a saved default, and an env-level shared key. Both are
  easy later additions but out of scope now.
- Auto-fallback (silently switching to Firecrawl when cheerio yields too little).
  The switch is explicit/user-controlled for now.

## Changes

### A. Shared content engine — `src/lib/contentFetcher.ts` (new)
- Export `fetchContent(url, opts)` where
  `opts = { useFirecrawl: boolean, firecrawlKey?: string, formats?: Format[] }`.
- **Firecrawl path** (`useFirecrawl && firecrawlKey`):
  - `POST https://api.firecrawl.dev/v1/scrape` with body
    `{ url, formats: ['markdown','html','links'], onlyMainContent: true,
    waitFor: 6000 }` and `Authorization: Bearer <firecrawlKey>`.
  - If `useFirecrawl` is true but no key is present, throw a clear error
    ("Firecrawl is enabled but no API key is set in Settings").
- **Cheerio path** (toggle off): reuse Phase 1's `scraper.ts`. Produce:
  - `markdown` via `turndown` (small dep) applied to the extracted content
    subtree; `html` = that subtree's HTML; plain text via existing cleaning.
- **Normalize** both paths to a common shape:
  `{ markdown, html, text, metadata: { title, description, sourceUrl, links? },
  engine: 'firecrawl' | 'cheerio' }`. Run the result text through the shared
  artifact-stripping so watermarks are removed regardless of engine.

### B. `clean-chapter` — route through the shared engine
- `src/app/api/clean-chapter/route.ts`:
  - Accept a `useFirecrawl?: boolean` field in the POST body.
  - Load the user's `firecrawl_api_key` from `user_settings` (alongside the
    existing `scraper_cookies` lookup).
  - Call `fetchContent(url, { useFirecrawl, firecrawlKey })`; return the cleaned
    text (`.text`/`.markdown`) as it does today so the save flow is unchanged.
  - Toggle-off behavior is byte-for-byte the current behavior.

### C. Novel crawler UI — `src/components/ChapterProcessor.tsx`
- Add a **"Use Firecrawl"** toggle (switch), default off, visible across the
  single / bulk / crawl modes.
- Include `useFirecrawl` in the `/api/clean-chapter` request bodies (single +
  bulk loops).
- Small helper text noting Firecrawl uses credits + requires a key in Settings.

### D. Reader — new API route `src/app/api/read/route.ts`
- `POST { url, format: 'markdown' | 'html' | 'json', useFirecrawl?: boolean }`.
- Validate `url`; load the user's `firecrawl_api_key`.
- Call `fetchContent(url, { useFirecrawl, firecrawlKey })` and shape the response
  to the requested format:
  - `markdown` → `{ format, content: result.markdown }`.
  - `html` → `{ format, content: result.html }`.
  - `json` → `{ format, data: { title, description, url, text, links } }`
    (deterministic metadata).
- `AbortController` timeout (~30s); map failures to helpful messages.

### E. Reader UI — `/reader`
- `src/app/(app)/reader/page.tsx` (server component under the authed `(app)`
  group) rendering `ReaderClient.tsx`.
- `src/app/(app)/reader/ReaderClient.tsx` (client):
  - URL input, format tabs (Markdown / HTML / JSON), and the **Use Firecrawl**
    toggle (default off).
  - Submit → `POST /api/read`.
  - Output pane with **Copy** and **Download** (`.md` / `.html` / `.json`)
    buttons and a word/char count.
  - Reuse `card`, `input-field`, `btn-primary`, `spinner`, `react-hot-toast`.

### F. Settings — Firecrawl API key
- **DB:** add one column (non-destructive):
  `ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS firecrawl_api_key text;`
  Run via the Supabase SQL editor (or dashboard). This is the one required DB
  change in the whole design; documented for the user to apply.
- `src/types/index.ts`: add `firecrawl_api_key: string | null` to `UserSettings`
  (which Phase 1 already trimmed of the AI fields).
- `src/app/(app)/settings/SettingsClient.tsx` (+ its `page.tsx` select): add a
  Firecrawl API key input next to the scraper-cookies field, saved to
  `user_settings.firecrawl_api_key`.

### G. Navigation — `src/components/Sidebar.tsx`
- Add a "Reader" nav item pointing to `/reader`.

### H. Dependency
- Add `turndown` (+ `@types/turndown`) for HTML→Markdown on the cheerio path.

## Verification (Phase 2)

1. `npm run lint` — clean.
2. `npm run build` — clean.
3. Smoke test with toggle **off** (cheerio): a simple page (example.com) returns
   Markdown / HTML / JSON in the Reader; a novel chapter on a simple site cleans
   and saves as before.
4. Smoke test with toggle **on** (Firecrawl, key set in Settings): a wtr-lab
   chapter returns real decrypted prose in both the Reader and the novel crawler;
   watermark lines are stripped.
5. Toggle on with no key set → clear "set your key in Settings" error, no crash.

## Files touched (Phase 2)

New:
- `src/lib/contentFetcher.ts`
- `src/app/api/read/route.ts`
- `src/app/(app)/reader/page.tsx`
- `src/app/(app)/reader/ReaderClient.tsx`

Modified:
- `src/app/api/clean-chapter/route.ts`
- `src/components/ChapterProcessor.tsx`
- `src/app/(app)/settings/SettingsClient.tsx` and `settings/page.tsx`
- `src/types/index.ts` (add `firecrawl_api_key` to `UserSettings`)
- `src/components/Sidebar.tsx`
- `package.json` (add `turndown`, `@types/turndown`)

Database (one-time, run by user):
- `ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS firecrawl_api_key text;`
