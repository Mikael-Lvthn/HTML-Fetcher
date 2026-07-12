# Design: Pivot from MTL translation tool to Novel Crawler

**Date:** 2026-07-13
**Status:** Approved (pending spec review)

## Goal

Reorient the app away from any "AI translation" framing and center it on its
web-crawling / scraping / cleaning features. The AI translation layer was never
actually implemented — it exists only as vestigial scaffolding (unused DB
columns, types, and UI fields). This change removes that scaffolding, tightens
the scraping code, and rebrands the product as **Novel Crawler**.

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
