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
- **Phase 2 — Reader:** add a URL-to-clean-format capability (Markdown / HTML /
  structured JSON) powered by Jina Reader. Implemented after Phase 1. See the
  "Phase 2" section below.

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

# Phase 2: Reader (URL → clean formats via Jina Reader)

## Goal

Add a general "Reader" capability: paste any URL and get its main content back
as clean **Markdown**, **HTML**, or **structured JSON** — the LLM-ready reader
pattern (à la Firecrawl / Jina Reader). Implemented after Phase 1.

## Scope decisions (settled during brainstorming)

- **Extraction engine:** integrate **Jina Reader** (`https://r.jina.ai/<url>`).
  Works keyless for MVP. It renders JavaScript, so it handles SPA/JS-heavy pages.
- **Structured JSON:** deterministic metadata only (no AI/LLM). Jina's
  `Accept: application/json` response already provides this
  (`title`, `description`, `url`, `content`, `publishedTime`, `metadata`,
  `links`).
- **Positioning:** a new capability *alongside* the novel crawler, reachable
  from its own `/reader` page and sidebar entry — not a replacement.

## Verified facts (probed against the live service 2026-07-13)

- `GET https://r.jina.ai/https://example.com` → Markdown, no API key required.
- `Accept: application/json` → `{ code, status, data: { title, description,
  url, content, publishedTime, metadata, links?, images?, usage } }`.
- `X-Return-Format: html` → cleaned HTML of the page.
- Jina renders JS and returns the **decrypted** wtr-lab chapter text as clean
  Markdown (the encrypted `arr:…` body that a plain server fetch cannot read).
  This is the basis for the "bonus" note below.
- Jina can leave site-injected watermark lines (e.g. "【…remember our domain
  name…】"); `finalizeText()`-style artifact stripping can scrub them.

## Non-goals (Phase 2)

- LLM-based schema extraction (deliberately excluded to preserve the no-AI
  direction from Phase 1). Left as a possible future phase.
- Multi-page crawling / site mapping. Single URL → single result only.
- Rewiring the novel `clean-chapter` flow through Jina (see bonus below) — a
  separate follow-up, not part of Phase 2.

## Changes

### A. New API route — `src/app/api/read/route.ts`
- `POST { url: string, format: 'markdown' | 'html' | 'json' }`.
- Validate `url` with `new URL()`; 400 on invalid/missing.
- Proxy to `https://r.jina.ai/${url}` with per-format headers:
  - `markdown` → no special header (Jina default).
  - `html` → `X-Return-Format: html`.
  - `json` → `Accept: application/json` + `X-With-Links-Summary: true`; return
    the parsed `data` object.
- Send `Authorization: Bearer ${process.env.JINA_API_KEY}` only if the env var
  is set (keyless otherwise). This is the seam for lifting rate limits later.
- Use an `AbortController` timeout (~30s) and map failures to helpful messages,
  mirroring the error style of the (now-deleted) `/api/scrape` route.
- Return `{ format, content }` for markdown/html, or `{ format, data }` for json.

### B. New UI — `/reader`
- `src/app/(app)/reader/page.tsx` (server component, under the authed `(app)`
  group) rendering `ReaderClient.tsx`.
- `src/app/(app)/reader/ReaderClient.tsx` (client):
  - URL input.
  - Format tabs: Markdown / HTML / JSON.
  - Submit → `POST /api/read`.
  - Output pane (monospace / `chapter-output` styling) with **Copy** and
    **Download** (`.md` / `.html` / `.json`) buttons and a word/char count.
  - Reuse existing `card`, `input-field`, `btn-primary`, `spinner` classes and
    `react-hot-toast` for feedback.

### C. Navigation — `src/components/Sidebar.tsx`
- Add a "Reader" nav item pointing to `/reader`.

## Bonus / future (out of Phase 2 scope, flagged)

Because Jina decrypts JS-rendered pages, the novel `clean-chapter` path could
later route through Jina to fetch wtr-lab (and similar) chapter text
server-side, replacing the fragile browser-beam script. Cheap to add once the
Jina integration exists, but intentionally deferred.

## Verification (Phase 2)

1. `npm run lint` — clean.
2. `npm run build` — clean.
3. Smoke test `/reader`:
   - example.com → Markdown, HTML, and JSON all return content.
   - A JS-heavy URL (wtr-lab chapter) → real decrypted prose comes back.
   - Copy + Download buttons produce correct file contents/extensions.

## Files touched (Phase 2)

New:
- `src/app/api/read/route.ts`
- `src/app/(app)/reader/page.tsx`
- `src/app/(app)/reader/ReaderClient.tsx`

Modified:
- `src/components/Sidebar.tsx`
- `.env.local` / deployment env: optional `JINA_API_KEY` (documented, not
  required for MVP).
