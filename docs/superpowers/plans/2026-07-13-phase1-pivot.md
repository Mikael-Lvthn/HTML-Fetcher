# Phase 1 — Novel Crawler Pivot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the vestigial AI/translation scaffolding, consolidate the two scrapers, and rebrand the app as "Novel Crawler" — a crawl → clean → store tool.

**Architecture:** Pure code-level removal + copy changes. No DB migration (unused Supabase columns are left in place, harmless). Projects become simple folders (title, subtitle, color). The unused `textExtractor` cleaning rules are folded into `scraper.ts` before deleting it.

**Tech Stack:** Next.js 16.2.4 (App Router), React 19, TypeScript 5, Tailwind v4, Supabase, cheerio.

## Global Constraints

- **Modified Next.js:** This is Next.js **16.2.4** with breaking changes from stock (`AGENTS.md`). Before writing/altering any Next-specific code (route handlers, `metadata`, middleware, dynamic params), read the relevant guide in `node_modules/next/dist/docs/`. Heed deprecation notices.
- **No test framework:** the repo has no test deps. Do NOT add one. The verification cycle for every task is: `npm run lint` and `npx tsc --noEmit` must pass, plus any manual smoke note in the task. A final `npm run build` runs at the end.
- **Branch first:** the repo is on `main`. Before Task 1, create a working branch: `git checkout -b phase1-pivot`.
- **Style:** match existing code — 2-space indent, single quotes, semicolons, existing Tailwind utility classes. Do not reformat untouched lines.
- **DB:** no schema changes in Phase 1. Leaving unused columns (`fandoms`, `keywords`, `system_prompt`, `openrouter_api_key`, `preferred_model`) in the DB is intentional.

---

### Task 1: Scraper consolidation

Fold `textExtractor.ts`'s useful cleaning into `scraper.ts`'s `finalizeText()`, then delete the duplicate extractor and its unused API route. Build stays green (nothing in the live UI imports them).

**Files:**
- Modify: `src/lib/scraper.ts` (the `finalizeText` function, ~lines 156-174)
- Delete: `src/lib/textExtractor.ts`
- Delete: `src/app/api/scrape/route.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `finalizeText` gains MTL-artifact stripping + HTML-entity decoding; `cleanChapterHtml(html: string): string` signature unchanged.

- [ ] **Step 1: Confirm nothing else imports the files being deleted**

Run:
```bash
grep -rn "textExtractor\|api/scrape\|extractChapterText\|extractFromRawHtml" src --include=*.ts --include=*.tsx
```
Expected: matches ONLY inside `src/lib/textExtractor.ts` and `src/app/api/scrape/route.ts`. If anything else matches, stop and reassess.

- [ ] **Step 2: Replace `finalizeText` in `src/lib/scraper.ts`**

Replace the existing `finalizeText` function with:

```ts
function finalizeText(text: string): string {
  const cleaned = text
    .replace(/\r/g, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    // MTL / site artifacts (folded in from the former textExtractor.ts)
    .replace(/\(End of this chapter\)/gi, '')
    .replace(/\(End of Chapter\)/gi, '')
    .replace(/Please read on the original site/gi, '')
    .replace(/Support the author by reading on/gi, '')
    // HTML entities that may survive text extraction
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .split('\n')
    .map(line => line.trim())
    .join('\n')
    .trim();

  // If the content is just an ad-blocker warning, return empty so fallbacks can try
  if (cleaned.toLowerCase().includes('ad blocker detected') ||
      cleaned.toLowerCase().includes('disable your ad blocker')) {
    return '';
  }

  return cleaned;
}
```

- [ ] **Step 3: Delete the duplicate extractor and its route**

Run:
```bash
git rm src/lib/textExtractor.ts src/app/api/scrape/route.ts
```

- [ ] **Step 4: Verify lint + types pass**

Run: `npm run lint && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor: fold textExtractor cleaning into scraper, remove duplicate extractor"
```

---

### Task 2: Remove project auto-detection

Delete the keyword-based project detector and strip its usage from `ChapterProcessor`. Chapters are already required to have a manually selected project, so no functionality is lost.

**Files:**
- Delete: `src/lib/projectDetector.ts`
- Modify: `src/components/ChapterProcessor.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: `ChapterProcessor` no longer imports `detectProject` or references `Project.keywords`.

- [ ] **Step 1: Delete the detector**

Run:
```bash
git rm src/lib/projectDetector.ts
```

- [ ] **Step 2: Remove the import in `src/components/ChapterProcessor.tsx`**

Delete this line (near line 5):
```ts
import { detectProject } from '@/lib/projectDetector';
```

- [ ] **Step 3: Remove the `detectedProject` state (near line 24)**

Delete:
```ts
  const [detectedProject, setDetectedProject] = useState<Project | null>(null);
```

- [ ] **Step 4: Remove the "detect" step from both `ProcessingStep[]` arrays (near lines 41-51)**

In `handleProcess`, both branches of `pSteps` currently include a `detect` step. Remove the detect entries so the arrays read:

```ts
    const pSteps: ProcessingStep[] = !manualMode && urlInput
      ? [
          { id: 'fetch', label: 'Fetching & Cleaning...', emoji: '🌐', status: 'pending' },
          { id: 'save', label: 'Saving to history...', emoji: '💾', status: 'pending' },
        ]
      : [
          { id: 'clean', label: 'Cleaning text...', emoji: '✨', status: 'pending' },
          { id: 'save', label: 'Saving to history...', emoji: '💾', status: 'pending' },
        ];
```

- [ ] **Step 5: Replace the detect block with plain project selection (near lines 84-93)**

Replace:
```ts
      updateStep('detect', 'active');
      let projId = selectedProjectId;
      if (!projId) {
        const det = detectProject(finalCleaned, projects);
        if (det) { setDetectedProject(det); setSelectedProjectId(det.id); projId = det.id; }
      }
      updateStep('detect', 'done');

      const project = projects.find(p => p.id === projId);
      if (!project) throw new Error('Please select a project');
```
with:
```ts
      const projId = selectedProjectId;
      const project = projects.find(p => p.id === projId);
      if (!project) throw new Error('Please select a project');
```

- [ ] **Step 6: Remove `setDetectedProject` from `handleReset` (near line 198)**

Delete the line:
```ts
    setDetectedProject(null);
```

- [ ] **Step 7: Remove the "Detected" banner and simplify the select onChange (near lines 308-309)**

Delete the detected banner line:
```tsx
            {detectedProject && <div className="mb-3 p-3 rounded-lg bg-success/10 border border-success/20 flex items-center gap-2"><span className="text-success text-sm">✅ Detected:</span><span className="text-sm font-medium" style={{ color: detectedProject.color }}>{detectedProject.title}</span></div>}
```
And change the select's onChange from:
```tsx
            <select value={selectedProjectId} onChange={e => { setSelectedProjectId(e.target.value); setDetectedProject(null); }} className="input-field" disabled={isProcessing}>
```
to:
```tsx
            <select value={selectedProjectId} onChange={e => setSelectedProjectId(e.target.value)} className="input-field" disabled={isProcessing}>
```

- [ ] **Step 8: Verify lint + types pass**

Run: `npm run lint && npx tsc --noEmit`
Expected: no errors. (If `Project` is now unused in the imports, remove it from the `@/types` import list — but it is still used by the `projects` prop type, so it should remain.)

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "refactor: remove keyword-based project auto-detection"
```

---

### Task 3: Projects become simple folders

Remove `fandoms`, `keywords`, and `system_prompt` from the `Project` type and every consumer, in one coherent change so the build stays green.

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/app/(app)/projects/new/page.tsx`
- Modify: `src/app/(app)/projects/[id]/ProjectDetailClient.tsx`
- Modify: `src/components/ProjectCard.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: `Project` = `{ id, user_id, title, subtitle, color, created_at, updated_at, chapter_count?, total_word_count? }`. `PromptVersion` and `AIModel` interfaces removed. `UserSettings` loses `openrouter_api_key` and `preferred_model`.

- [ ] **Step 1: Trim `src/types/index.ts`**

In the `Project` interface, remove these three lines:
```ts
  fandoms: string[];
  keywords: string[];
  system_prompt: string;
```
In the `UserSettings` interface, remove:
```ts
  openrouter_api_key: string | null;
  preferred_model: string;
```
Delete the entire `PromptVersion` interface and the entire `AIModel` interface.

- [ ] **Step 2: Update `src/app/(app)/projects/new/page.tsx`**

Remove the two state hooks:
```ts
  const [fandomsInput, setFandomsInput] = useState('');
  const [keywordsInput, setKeywordsInput] = useState('');
```
In `handleSubmit`, remove the parsing lines and the extra insert fields. Replace:
```ts
    const fandoms = fandomsInput.split(',').map(f => f.trim()).filter(Boolean);
    const keywords = keywordsInput.split(',').map(k => k.trim()).filter(Boolean);

    const { data, error } = await supabase.from('projects').insert({
      user_id: user.id,
      title: title.trim(),
      subtitle: subtitle.trim() || null,
      fandoms,
      keywords,
      color,
      system_prompt: '',
    }).select().single();
```
with:
```ts
    const { data, error } = await supabase.from('projects').insert({
      user_id: user.id,
      title: title.trim(),
      subtitle: subtitle.trim() || null,
      color,
    }).select().single();
```
Update the header subtitle and delete the Fandoms + Detection Keywords form blocks. Change:
```tsx
      <Header title="New Project" subtitle="Create a new translation project" />
```
to:
```tsx
      <Header title="New Project" subtitle="Create a new project" />
```
Delete these two `<div>` blocks entirely (the Fandoms input and the Detection Keywords input, near lines 58-66):
```tsx
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1.5">Fandoms (comma-separated)</label>
          <input type="text" value={fandomsInput} onChange={e => setFandomsInput(e.target.value)} className="input-field" placeholder="Naruto, Kamen Rider" />
        </div>
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1.5">Detection Keywords (comma-separated)</label>
          <input type="text" value={keywordsInput} onChange={e => setKeywordsInput(e.target.value)} className="input-field" placeholder="Mufasa, Konoha, chakra, Hashirama" />
          <p className="text-xs text-text-muted mt-1">Used to auto-detect which project a chapter belongs to</p>
        </div>
```

- [ ] **Step 3: Update `src/app/(app)/projects/[id]/ProjectDetailClient.tsx`**

Remove state (near lines 22, 26):
```ts
  const [keywordsInput, setKeywordsInput] = useState(project.keywords.join(', '));
```
```ts
  const [editFandoms, setEditFandoms] = useState(project.fandoms.join(', '));
```
Delete the `saveKeywords` function entirely (near lines 31-37).
Rewrite `saveProjectDetails` to drop fandoms:
```ts
  const saveProjectDetails = async () => {
    const { error } = await supabase.from('projects').update({
      title: editTitle, subtitle: editSubtitle || null,
    }).eq('id', project.id);
    if (error) { toast.error('Failed to save'); return; }
    setProject(prev => ({ ...prev, title: editTitle, subtitle: editSubtitle }));
    setIsEditing(false);
    toast.success('Project updated!');
  };
```
Delete the fandoms edit input in the editing block (near line 83):
```tsx
                <input value={editFandoms} onChange={e => setEditFandoms(e.target.value)} className="input-field text-sm" placeholder="Fandoms (comma-separated)" />
```
Delete the fandoms tag row in the non-editing header (near lines 96-100):
```tsx
                <div className="flex flex-wrap gap-1.5 mt-3 ml-6">
                  {project.fandoms.map((f, i) => (
                    <span key={i} className="px-2 py-0.5 rounded-md text-xs font-medium" style={{ backgroundColor: `${project.color}20`, color: project.color, border: `1px solid ${project.color}30` }}>{f}</span>
                  ))}
                </div>
```
Delete the entire "🔍 Auto-Detect Keywords" `<section>` (near lines 131-140):
```tsx
      <section className="mb-8">
        <h2 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">🔍 Auto-Detect Keywords</h2>
        <div className="card">
          <div className="flex gap-3">
            <input value={keywordsInput} onChange={e => setKeywordsInput(e.target.value)} className="input-field flex-1" placeholder="keyword1, keyword2, keyword3" />
            <button onClick={saveKeywords} className="btn-primary text-sm shrink-0">Save Keywords</button>
          </div>
          <p className="text-xs text-text-muted mt-2">Comma-separated. Used to auto-match chapters to this project.</p>
        </div>
      </section>
```
Leave the "🚀 Browser Crawler (Bypass Security)" section and the Chapter History section untouched.

- [ ] **Step 4: Update `src/components/ProjectCard.tsx`**

Delete the entire Fandoms block (near lines 38-55):
```tsx
        {/* Fandoms */}
        {project.fandoms && project.fandoms.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {project.fandoms.map((fandom, i) => (
              <span
                key={i}
                className="px-2 py-0.5 rounded-md text-xs font-medium"
                style={{
                  backgroundColor: `${project.color}20`,
                  color: project.color,
                  border: `1px solid ${project.color}30`,
                }}
              >
                {fandom}
              </span>
            ))}
          </div>
        )}
```

- [ ] **Step 5: Verify lint + types pass**

Run: `npm run lint && npx tsc --noEmit`
Expected: no errors. If any error mentions `fandoms`, `keywords`, or `system_prompt`, a consumer was missed — grep for it: `grep -rn "fandoms\|\.keywords\|system_prompt" src` and fix.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor: reduce projects to simple folders (drop fandoms/keywords/system_prompt)"
```

---

### Task 4: Rebrand to "Novel Crawler"

Replace translation/AI-flavored copy across the shell and auth pages.

**Files:**
- Modify: `src/app/layout.tsx`
- Modify: `src/components/Sidebar.tsx`
- Modify: `src/app/(app)/dashboard/DashboardClient.tsx`
- Modify: `src/app/auth/login/page.tsx`
- Modify: `src/app/auth/signup/page.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces: user-visible brand is "Novel Crawler"; no translation/AI wording remains in these files.

- [ ] **Step 1: `src/app/layout.tsx` metadata (lines 16-20)**

Replace:
```ts
export const metadata: Metadata = {
  title: 'MTL Cleaner — Fanfic Translation Tool',
  description:
    'Clean machine-translated fanfiction chapters into polished English prose using AI. Manage multiple translation projects with custom system prompts.',
};
```
with:
```ts
export const metadata: Metadata = {
  title: 'Novel Crawler — Crawl, clean & archive web novels',
  description:
    'Crawl web-novel sites, strip ads and boilerplate, and archive clean chapters in an organized library.',
};
```

- [ ] **Step 2: `src/components/Sidebar.tsx` brand block (lines 59-62)**

Replace:
```tsx
            <h1 className="font-bold text-lg text-text-primary leading-tight">
              MTL Cleaner
            </h1>
            <p className="text-xs text-text-muted">Fanfic Translation Tool</p>
```
with:
```tsx
            <h1 className="font-bold text-lg text-text-primary leading-tight">
              Novel Crawler
            </h1>
            <p className="text-xs text-text-muted">Crawl • Clean • Archive</p>
```
(Optional: the logo letter on line 56 is `M`; change `>M<` to `>N<` for "Novel".)

- [ ] **Step 3: `src/app/(app)/dashboard/DashboardClient.tsx` copy (lines 13, 53)**

Change the Header subtitle (line 13) from:
```tsx
        subtitle={`${projects.length} translation project${projects.length !== 1 ? 's' : ''}`}
```
to:
```tsx
        subtitle={`${projects.length} project${projects.length !== 1 ? 's' : ''}`}
```
Change the empty-state copy (line 53) from:
```tsx
          <p className="text-text-muted text-sm mb-6">Create your first translation project to get started</p>
```
to:
```tsx
          <p className="text-text-muted text-sm mb-6">Create your first project to get started</p>
```

- [ ] **Step 4: Auth pages**

In `src/app/auth/login/page.tsx` (line 44), change:
```tsx
          <h1 className="text-2xl font-bold gradient-text">MTL Cleaner</h1>
```
to:
```tsx
          <h1 className="text-2xl font-bold gradient-text">Novel Crawler</h1>
```
In `src/app/auth/signup/page.tsx` (line 49), change:
```tsx
          <p className="text-text-muted text-sm mt-1">Start cleaning MTL fanfiction</p>
```
to:
```tsx
          <p className="text-text-muted text-sm mt-1">Start crawling & archiving web novels</p>
```
Also check line ~44-49 of signup for an "MTL Cleaner" heading; if present, change it to "Novel Crawler" the same way as login.

- [ ] **Step 5: Grep for any remaining translation/MTL branding copy**

Run:
```bash
grep -rni "mtl cleaner\|translation tool\|translation project\|using ai\|system prompt" src
```
Expected: no user-facing matches remain (the word "translated" inside functional cleaning comments/strings is fine; brand copy is not).

- [ ] **Step 6: Verify build**

Run: `npm run lint && npx tsc --noEmit && npm run build`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: rebrand app to Novel Crawler"
```

---

## Phase 1 Verification (run after all tasks)

- [ ] `npm run lint` — clean.
- [ ] `npm run build` — clean (proves type removals are consistent across all consumers).
- [ ] Manual smoke: `npm run dev`, then create a project (confirm no Fandoms/Keywords fields), open it (no Auto-Detect Keywords section, Browser Crawler section still present), and clean a chapter from a simple URL — confirm it saves to history.
- [ ] Sidebar, dashboard, and auth pages show "Novel Crawler" branding.
