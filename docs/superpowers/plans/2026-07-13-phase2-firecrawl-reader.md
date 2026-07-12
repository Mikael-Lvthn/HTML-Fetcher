# Phase 2 — Firecrawl Engine + Reader Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a toggleable Firecrawl-backed content engine (off = existing cheerio server-fetch, on = Firecrawl for JS-heavy/encrypted sites like wtr-lab) shared by the novel crawler and a new URL→clean-format Reader (Markdown / HTML / structured JSON).

**Architecture:** On the crawler path Firecrawl replaces ONLY the `fetch()` step: it returns fully-rendered raw HTML that flows through the EXISTING `cleanChapterHtml()` → `finalizeText()` pipeline, guaranteeing identical output regardless of engine. A single shared helper (`contentFetcher.ts`) fetches rendered HTML. The Firecrawl key is a single global value in a one-row `app_settings` table, editable in Settings.

**Tech Stack:** Next.js 16.2.4 (App Router), React 19, TypeScript 5, Supabase, cheerio, Firecrawl REST API, turndown (new dep).

## Global Constraints

- **Prerequisite:** Phase 1 (`2026-07-13-phase1-pivot.md`) is merged. This plan assumes `finalizeText` already has the artifact-stripping from Phase 1 and that `UserSettings` no longer has AI fields.
- **Modified Next.js:** Next.js **16.2.4** with breaking changes from stock (`AGENTS.md`). Before writing/altering any route handler, `metadata`, or server component, read the relevant guide in `node_modules/next/dist/docs/`. Match the existing route-handler shape in `src/app/api/clean-chapter/route.ts`.
- **No test framework:** do NOT add one. Per-task verification is `npm run lint` + `npx tsc --noEmit`, plus the manual/curl smoke test written into the task. Final `npm run build` at the end.
- **Branch first:** `git checkout -b phase2-firecrawl-reader`.
- **Toggle default OFF** everywhere (protects Firecrawl credits). The toggle is ephemeral UI state passed per request; it is not persisted.
- **Output parity is a hard requirement:** the crawler's cleaned text must be identical in shape whether the toggle is on or off. This is achieved by routing Firecrawl's `rawHtml` through the unchanged `cleanChapterHtml`.
- **Key is global, not per-user:** stored in `app_settings` row `id = 1`. Never store it per-user.
- **Style:** match existing code — 2-space indent, single quotes, semicolons, existing Tailwind classes.

---

### Task 1: Fix the content selector + watermark stripping in `scraper.ts`

The wtr-lab content container is now `<div class="chapter-body">` (verified against Firecrawl's rendered HTML), not the stale `#read-content`. Extracting `.chapter-body` also keeps the inline "Ad Blocker Detected" notice out of the extracted subtree, so `finalizeText`'s empty-string guard never mis-fires. This is what makes the parity guarantee hold on Firecrawl-rendered HTML.

**Files:**
- Modify: `src/lib/scraper.ts` (`WTR_SELECTORS` near line 96; `finalizeText` from Phase 1)

**Interfaces:**
- Consumes: nothing new.
- Produces: `cleanChapterHtml` extracts `.chapter-body`; `finalizeText` also strips bracketed promo/watermark lines.

- [ ] **Step 1: Add `.chapter-body` to `WTR_SELECTORS`**

Change (near line 96):
```ts
  const WTR_SELECTORS = ['#read-content', '.read-content', '.chapter-content'];
```
to:
```ts
  const WTR_SELECTORS = ['.chapter-body', '#read-content', '.read-content', '.chapter-content'];
```

- [ ] **Step 2: Extend `finalizeText` to strip watermark lines**

In `finalizeText` (in `src/lib/scraper.ts`), add these two `.replace(...)` calls to the chain, immediately after the existing "Support the author by reading on" replace:
```ts
    // Site-injected promo / watermark lines
    .replace(/【[^】]*】/g, '')
    .replace(/[a-z0-9̀-ͯ]{2,}\.com\s+Read anytime\.?/gi, '')
```

- [ ] **Step 3: Sanity-check the selector against captured HTML (manual)**

Create a throwaway check (do NOT commit it):
```bash
node -e "const {cleanChapterHtml}=require('./src/lib/scraper.ts')" 2>/dev/null || echo "TS file — verify via tsc instead"
```
Since `scraper.ts` is TypeScript, rely on the type check in Step 4 and the end-to-end smoke test in Task 4. The `.chapter-body` string was confirmed present in Firecrawl's rendered wtr-lab HTML during design.

- [ ] **Step 4: Verify lint + types pass**

Run: `npm run lint && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/scraper.ts
git commit -m "fix: target .chapter-body container and strip watermark lines"
```

---

### Task 2: Shared content engine (`contentFetcher.ts`) + turndown dep

One module that produces (a) rendered HTML for the crawler and (b) markdown/html/text for the Reader, branching on the Firecrawl toggle.

**Files:**
- Create: `src/lib/contentFetcher.ts`
- Modify: `package.json` (via npm install)

**Interfaces:**
- Consumes: `cleanChapterHtml` from `@/lib/scraper` (only used by callers, not here).
- Produces:
  - `fetchRenderedHtml(url: string, opts: { useFirecrawl: boolean; firecrawlKey?: string; cookies?: string }): Promise<string>` — returns raw (rendered) page HTML.
  - `fetchForReader(url: string, opts: { useFirecrawl: boolean; firecrawlKey?: string }): Promise<ReaderResult>` where
    `ReaderResult = { markdown: string; html: string; text: string; metadata: { title: string; description: string; sourceUrl: string; links?: string[] } }`.

- [ ] **Step 1: Install turndown**

Run:
```bash
npm install turndown && npm install -D @types/turndown
```
Expected: `package.json` gains `turndown` and `@types/turndown`.

- [ ] **Step 2: Create `src/lib/contentFetcher.ts`**

```ts
import * as cheerio from 'cheerio';
import TurndownService from 'turndown';
import { cleanChapterHtml } from '@/lib/scraper';

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const FIRECRAWL_ENDPOINT = 'https://api.firecrawl.dev/v1/scrape';

export interface ReaderResult {
  markdown: string;
  html: string;
  text: string;
  metadata: { title: string; description: string; sourceUrl: string; links?: string[] };
}

async function firecrawlScrape(
  url: string,
  key: string,
  formats: string[]
): Promise<any> {
  const res = await fetch(FIRECRAWL_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({ url, formats, onlyMainContent: true, waitFor: 6000 }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Firecrawl request failed (${res.status}): ${detail.slice(0, 200)}`);
  }
  const json = await res.json();
  if (!json?.success) throw new Error(`Firecrawl returned an error: ${JSON.stringify(json).slice(0, 200)}`);
  return json.data;
}

// Rendered-HTML fetch — the drop-in replacement for a plain fetch().
// Used by the crawler so output stays identical via cleanChapterHtml().
export async function fetchRenderedHtml(
  url: string,
  opts: { useFirecrawl: boolean; firecrawlKey?: string; cookies?: string }
): Promise<string> {
  if (opts.useFirecrawl) {
    if (!opts.firecrawlKey) {
      throw new Error('Firecrawl is enabled but no API key is set in Settings');
    }
    // rawHtml is the fully rendered DOM (JS executed, content decrypted).
    const data = await firecrawlScrape(url, opts.firecrawlKey, ['rawHtml']);
    const html = data?.rawHtml;
    if (!html) throw new Error('Firecrawl returned no HTML for this URL');
    return html;
  }

  const res = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept:
        'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      Referer: 'https://wtr-lab.com/',
      Origin: 'https://wtr-lab.com',
      ...(opts.cookies ? { Cookie: opts.cookies } : {}),
    },
  });
  if (!res.ok) throw new Error(`Failed to fetch chapter: ${res.status}`);
  return res.text();
}

// Reader fetch — produces markdown / html / text + metadata.
export async function fetchForReader(
  url: string,
  opts: { useFirecrawl: boolean; firecrawlKey?: string }
): Promise<ReaderResult> {
  if (opts.useFirecrawl) {
    if (!opts.firecrawlKey) {
      throw new Error('Firecrawl is enabled but no API key is set in Settings');
    }
    const data = await firecrawlScrape(url, opts.firecrawlKey, ['markdown', 'html', 'links']);
    const markdown: string = data?.markdown ?? '';
    const html: string = data?.html ?? '';
    const meta = data?.metadata ?? {};
    return {
      markdown,
      html,
      text: markdown.replace(/[#>*_`]/g, '').trim(),
      metadata: {
        title: meta.title ?? '',
        description: meta.description ?? '',
        sourceUrl: meta.sourceURL ?? url,
        links: Array.isArray(data?.links) ? data.links : undefined,
      },
    };
  }

  // Off path: server fetch → cheerio extraction → turndown for markdown.
  const rawHtml = await fetchRenderedHtml(url, { useFirecrawl: false });
  const $ = cheerio.load(rawHtml);
  const title = $('title').first().text().trim();
  const description = $('meta[name="description"]').attr('content')?.trim() ?? '';
  const links = $('a[href]')
    .map((_, el) => $(el).attr('href') || '')
    .get()
    .filter(Boolean)
    .slice(0, 200);

  const text = cleanChapterHtml(rawHtml); // identical extraction to the crawler
  const contentHtml =
    $('article').first().html() ||
    $('main').first().html() ||
    $('body').html() ||
    '';
  const turndown = new TurndownService({ headingStyle: 'atx' });
  const markdown = turndown.turndown(contentHtml);

  return {
    markdown,
    html: contentHtml,
    text,
    metadata: { title, description, sourceUrl: url, links },
  };
}
```

- [ ] **Step 3: Verify lint + types pass**

Run: `npm run lint && npx tsc --noEmit`
Expected: no errors. If tsc complains about `TurndownService` types, confirm `@types/turndown` installed.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json src/lib/contentFetcher.ts
git commit -m "feat: add shared content engine (server-fetch + Firecrawl) with turndown"
```

---

### Task 3: Global `app_settings` key + Settings UI

Create the one-row global config table, add the `AppSettings` type, and let Settings read/edit the single Firecrawl key.

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/app/(app)/settings/page.tsx`
- Modify: `src/app/(app)/settings/SettingsClient.tsx`
- DB: `app_settings` table (run SQL manually in Supabase)

**Interfaces:**
- Consumes: nothing new.
- Produces: `AppSettings = { firecrawl_api_key: string | null }`; Settings page loads/saves `app_settings` row `id = 1`.

- [ ] **Step 1: Create the DB table (run once in Supabase SQL editor)**

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
Verify: `select * from app_settings;` returns one row with `id = 1`.

- [ ] **Step 2: Add the `AppSettings` type to `src/types/index.ts`**

Append:
```ts
export interface AppSettings {
  firecrawl_api_key: string | null;
}
```

- [ ] **Step 3: Load the global key in `src/app/(app)/settings/page.tsx`**

After the existing `user_settings` query, add an `app_settings` fetch and pass it down:
```tsx
  const { data: settings } = await supabase
    .from('user_settings')
    .select('*')
    .eq('user_id', user.id)
    .single();

  const { data: appSettings } = await supabase
    .from('app_settings')
    .select('firecrawl_api_key')
    .eq('id', 1)
    .single();

  return (
    <SettingsClient
      userEmail={user.email || ''}
      settings={settings || {}}
      firecrawlKey={appSettings?.firecrawl_api_key || ''}
    />
  );
```

- [ ] **Step 4: Add the Firecrawl key field in `src/app/(app)/settings/SettingsClient.tsx`**

Extend the `Props` interface:
```ts
interface Props {
  userEmail: string;
  settings: UserSettings;
  firecrawlKey: string;
}
```
Destructure it and add state (near the existing `cookies` state):
```ts
export default function SettingsClient({ userEmail, settings, firecrawlKey }: Props) {
```
```ts
  const [fcKey, setFcKey] = useState(firecrawlKey || '');
  const [isSavingKey, setIsSavingKey] = useState(false);
```
Add a save handler (next to `handleSaveSettings`):
```ts
  const handleSaveFirecrawlKey = async () => {
    setIsSavingKey(true);
    const { error } = await supabase
      .from('app_settings')
      .update({ firecrawl_api_key: fcKey || null })
      .eq('id', 1);
    if (error) {
      toast.error('Failed to save Firecrawl key');
    } else {
      toast.success('Firecrawl key saved!');
      router.refresh();
    }
    setIsSavingKey(false);
  };
```
Add a new section in the JSX, immediately after the Scraper Settings `</section>`:
```tsx
        {/* Firecrawl */}
        <section className="card">
          <h2 className="text-base font-semibold text-text-primary mb-3">🔥 Firecrawl</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1.5">
                API Key (shared)
              </label>
              <input
                type="password"
                value={fcKey}
                onChange={(e) => setFcKey(e.target.value)}
                className="input-field font-mono text-xs"
                placeholder="fc-..."
              />
              <p className="text-[10px] text-text-muted mt-2">
                A single shared key. When the Firecrawl toggle is on during crawling, chapters are
                fetched through Firecrawl (renders JS, bypasses protected sites). Swap accounts by
                editing this key. Each scrape uses credits.
              </p>
            </div>
            <button
              onClick={handleSaveFirecrawlKey}
              disabled={isSavingKey}
              className="btn-primary w-full justify-center"
            >
              {isSavingKey ? 'Saving...' : 'Save Firecrawl Key'}
            </button>
          </div>
        </section>
```

- [ ] **Step 5: Verify lint + types pass**

Run: `npm run lint && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Manual smoke**

Run `npm run dev`, go to `/settings`, paste a test string in the Firecrawl key field, save → toast "Firecrawl key saved!". Reload → the value persists (masked). In Supabase, `select firecrawl_api_key from app_settings;` shows it.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add global app_settings Firecrawl key + Settings UI"
```

---

### Task 4: Wire the Firecrawl toggle into the crawler

Route `clean-chapter` through `fetchRenderedHtml` and add the toggle to `ChapterProcessor`. Output parity holds because the same `cleanChapterHtml` runs on the result.

**Files:**
- Modify: `src/app/api/clean-chapter/route.ts`
- Modify: `src/components/ChapterProcessor.tsx`

**Interfaces:**
- Consumes: `fetchRenderedHtml` from `@/lib/contentFetcher`; `cleanChapterHtml` from `@/lib/scraper`.
- Produces: `POST /api/clean-chapter` accepts `{ url?, rawHtml?, useFirecrawl? }`.

- [ ] **Step 1: Update `src/app/api/clean-chapter/route.ts`**

Replace the imports + fetch logic. New file body:
```ts
import { NextRequest } from 'next/server';
import { cleanChapterHtml } from '@/lib/scraper';
import { fetchRenderedHtml } from '@/lib/contentFetcher';
import { createServerSupabaseClient } from '@/lib/supabase-server';

export async function POST(request: NextRequest) {
  try {
    const { url, rawHtml, useFirecrawl } = await request.json();
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    let scraperCookies = '';
    if (user) {
      const { data: settings } = await supabase
        .from('user_settings')
        .select('scraper_cookies')
        .eq('user_id', user.id)
        .single();
      if (settings?.scraper_cookies) scraperCookies = settings.scraper_cookies;
    }

    let firecrawlKey = '';
    if (useFirecrawl) {
      const { data: appSettings } = await supabase
        .from('app_settings')
        .select('firecrawl_api_key')
        .eq('id', 1)
        .single();
      firecrawlKey = appSettings?.firecrawl_api_key || '';
    }

    let html = rawHtml;
    if (url && !html) {
      html = await fetchRenderedHtml(url, {
        useFirecrawl: !!useFirecrawl,
        firecrawlKey,
        cookies: scraperCookies,
      });
    }

    if (!html) {
      return Response.json({ error: 'No content provided' }, { status: 400 });
    }

    const cleanedText = cleanChapterHtml(html);
    return Response.json({ cleanedText });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
```

- [ ] **Step 2: Add toggle state in `src/components/ChapterProcessor.tsx`**

Near the other `useState` hooks (after `mode`), add:
```ts
  const [useFirecrawl, setUseFirecrawl] = useState(false);
```

- [ ] **Step 3: Send `useFirecrawl` in all three `clean-chapter` requests**

In `handleProcess`, both fetch calls send a JSON body. Add `useFirecrawl` to each:
```ts
          body: JSON.stringify({ url: urlInput, useFirecrawl })
```
```ts
          body: JSON.stringify({ rawHtml: manualText, useFirecrawl })
```
In `handleBulkProcess`, update the body:
```ts
          body: JSON.stringify({ url: urls[i], useFirecrawl })
```

- [ ] **Step 4: Add the toggle UI control**

Immediately after the mode-buttons `<div>` (the `flex items-center gap-3` block near line 206), add:
```tsx
      <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer select-none">
        <input
          type="checkbox"
          checked={useFirecrawl}
          onChange={e => setUseFirecrawl(e.target.checked)}
          className="accent-accent"
        />
        🔥 Use Firecrawl <span className="text-xs text-text-muted">(renders JS / protected sites — uses credits; requires a key in Settings)</span>
      </label>
```

- [ ] **Step 5: Verify lint + types pass**

Run: `npm run lint && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Parity + Firecrawl smoke test (manual)**

Run `npm run dev`.
1. **Parity (toggle OFF):** clean a chapter from a simple, non-JS site; note the saved text.
2. Save a valid Firecrawl key in `/settings`.
3. **Firecrawl (toggle ON):** enable the toggle, clean a wtr-lab chapter URL (e.g. `https://wtr-lab.com/en/novel/40817/.../chapter-1`) → real decrypted prose appears, ads/watermarks stripped, no "Ad Blocker Detected" text.
4. Toggle ON with the key field emptied in Settings → the process step errors with "Firecrawl is enabled but no API key is set in Settings" (no crash).

- [ ] **Step 7: Commit**

```bash
git add src/app/api/clean-chapter/route.ts src/components/ChapterProcessor.tsx
git commit -m "feat: add Firecrawl toggle to the novel crawler"
```

---

### Task 5: Reader feature (`/api/read` + `/reader` page + nav)

The standalone URL→format tool, sharing the same engine + toggle.

**Files:**
- Create: `src/app/api/read/route.ts`
- Create: `src/app/(app)/reader/page.tsx`
- Create: `src/app/(app)/reader/ReaderClient.tsx`
- Modify: `src/components/Sidebar.tsx`

**Interfaces:**
- Consumes: `fetchForReader` from `@/lib/contentFetcher`.
- Produces: `POST /api/read` with `{ url, format: 'markdown'|'html'|'json', useFirecrawl? }` → `{ format, content }` (markdown/html) or `{ format, data }` (json).

- [ ] **Step 1: Create `src/app/api/read/route.ts`**

```ts
import { NextRequest } from 'next/server';
import { fetchForReader } from '@/lib/contentFetcher';
import { createServerSupabaseClient } from '@/lib/supabase-server';

export async function POST(request: NextRequest) {
  try {
    const { url, format, useFirecrawl } = await request.json();

    if (!url) return Response.json({ error: 'URL is required' }, { status: 400 });
    try { new URL(url); } catch { return Response.json({ error: 'Invalid URL format' }, { status: 400 }); }
    const fmt = format === 'html' || format === 'json' ? format : 'markdown';

    const supabase = await createServerSupabaseClient();
    let firecrawlKey = '';
    if (useFirecrawl) {
      const { data: appSettings } = await supabase
        .from('app_settings')
        .select('firecrawl_api_key')
        .eq('id', 1)
        .single();
      firecrawlKey = appSettings?.firecrawl_api_key || '';
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    try {
      const result = await fetchForReader(url, { useFirecrawl: !!useFirecrawl, firecrawlKey });
      if (fmt === 'html') return Response.json({ format: fmt, content: result.html });
      if (fmt === 'json') {
        return Response.json({
          format: fmt,
          data: {
            title: result.metadata.title,
            description: result.metadata.description,
            url: result.metadata.sourceUrl,
            text: result.text,
            links: result.metadata.links ?? [],
          },
        });
      }
      return Response.json({ format: fmt, content: result.markdown });
    } finally {
      clearTimeout(timeout);
    }
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
```

- [ ] **Step 2: Create `src/app/(app)/reader/page.tsx`**

```tsx
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';
import ReaderClient from './ReaderClient';

export default async function ReaderPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/auth/login');
  return <ReaderClient />;
}
```

- [ ] **Step 3: Create `src/app/(app)/reader/ReaderClient.tsx`**

```tsx
'use client';

import { useState } from 'react';
import Header from '@/components/Header';
import toast from 'react-hot-toast';

type Format = 'markdown' | 'html' | 'json';

export default function ReaderClient() {
  const [url, setUrl] = useState('');
  const [format, setFormat] = useState<Format>('markdown');
  const [useFirecrawl, setUseFirecrawl] = useState(false);
  const [output, setOutput] = useState('');
  const [loading, setLoading] = useState(false);

  const run = async () => {
    if (!url) { toast.error('Enter a URL'); return; }
    setLoading(true); setOutput('');
    try {
      const res = await fetch('/api/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, format, useFirecrawl }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setOutput(format === 'json' ? JSON.stringify(data.data, null, 2) : data.content);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const copy = () => { navigator.clipboard.writeText(output); toast.success('Copied!'); };
  const download = () => {
    const ext = format === 'json' ? 'json' : format === 'html' ? 'html' : 'md';
    const mime = format === 'json' ? 'application/json' : format === 'html' ? 'text/html' : 'text/markdown';
    const blob = new Blob([output], { type: mime });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `reader-output.${ext}`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const wordCount = output ? output.split(/\s+/).filter(Boolean).length : 0;

  return (
    <div>
      <Header title="Reader" subtitle="Turn any URL into clean Markdown, HTML, or JSON" />
      <div className="space-y-4 max-w-3xl">
        <div className="card space-y-4">
          <input
            type="url"
            value={url}
            onChange={e => setUrl(e.target.value)}
            className="input-field"
            placeholder="https://example.com/article"
            disabled={loading}
          />
          <div className="flex items-center gap-2">
            {(['markdown', 'html', 'json'] as Format[]).map(f => (
              <button
                key={f}
                onClick={() => setFormat(f)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${format === f ? 'bg-accent/15 text-accent border border-accent/20' : 'text-text-muted hover:text-text-primary'}`}
              >
                {f === 'markdown' ? 'Markdown' : f === 'html' ? 'HTML' : 'JSON'}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer select-none">
            <input type="checkbox" checked={useFirecrawl} onChange={e => setUseFirecrawl(e.target.checked)} className="accent-accent" />
            🔥 Use Firecrawl <span className="text-xs text-text-muted">(renders JS / protected sites — uses credits; requires a key in Settings)</span>
          </label>
          <button onClick={run} disabled={loading || !url} className="btn-primary w-full justify-center py-3">
            {loading ? <><div className="spinner" /> Fetching...</> : '✨ Fetch & Convert'}
          </button>
        </div>

        {output && (
          <div className="card space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-text-primary">Output</h3>
              <span className="text-xs text-text-muted">{wordCount.toLocaleString()} words</span>
            </div>
            <pre className="max-h-[500px] overflow-auto p-4 rounded-xl bg-bg-primary border border-border text-xs whitespace-pre-wrap break-words">{output}</pre>
            <div className="flex gap-3">
              <button onClick={copy} className="btn-primary">📋 Copy</button>
              <button onClick={download} className="btn-secondary">⬇ Download</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Add the Reader nav item in `src/components/Sidebar.tsx`**

In the `navItems` array, add this entry after the `/process` item (before `/settings`):
```tsx
  {
    href: '/reader',
    label: 'Reader',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.746 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
      </svg>
    ),
  },
```

- [ ] **Step 5: Verify lint + types pass**

Run: `npm run lint && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Manual smoke test**

Run `npm run dev`, open `/reader` (Reader link appears in the sidebar).
1. Toggle OFF, `https://example.com`, format Markdown → returns clean markdown; try HTML and JSON tabs.
2. Copy and Download buttons produce correct content/extensions.
3. Toggle ON (key set), a wtr-lab chapter → real decrypted prose in Markdown/HTML; JSON shows title/description/text/links.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add Reader (URL to Markdown/HTML/JSON) with Firecrawl toggle"
```

---

## Phase 2 Verification (run after all tasks)

- [ ] `npm run lint` — clean.
- [ ] `npm run build` — clean.
- [ ] `app_settings` table exists with one row; Firecrawl key saves/persists from Settings.
- [ ] **Parity:** same chapter cleaned with toggle off vs on (on a site a plain fetch can read) produces matching cleaned text.
- [ ] **Firecrawl path:** a wtr-lab chapter returns real prose via both the crawler and the Reader; `.chapter-body` extracted; no "Ad Blocker Detected" leakage; watermark lines stripped.
- [ ] Toggle on with no key → clear Settings error, no crash.
