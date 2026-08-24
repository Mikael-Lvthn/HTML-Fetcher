'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase';
import ChapterHistory from '@/components/ChapterHistory';
import { Project, Chapter } from '@/types';
import toast from 'react-hot-toast';

interface Props {
  project: Project;
  chapters: Chapter[];
}

export default function ProjectDetailClient({ project: initialProject, chapters: initialChapters }: Props) {
  const router = useRouter();
  const supabase = createClient();
  const [project, setProject] = useState(initialProject);
  const [chapters, setChapters] = useState(initialChapters);
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(project.title);
  const [editSubtitle, setEditSubtitle] = useState(project.subtitle || '');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const saveProjectDetails = async () => {
    const { error } = await supabase.from('projects').update({
      title: editTitle, subtitle: editSubtitle || null,
    }).eq('id', project.id);
    if (error) { toast.error('Failed to save'); return; }
    setProject(prev => ({ ...prev, title: editTitle, subtitle: editSubtitle }));
    setIsEditing(false);
    toast.success('Project updated!');
  };

  const deleteProject = async () => {
    const { error } = await supabase.from('projects').delete().eq('id', project.id);
    if (error) { toast.error('Failed to delete'); return; }
    toast.success('Project deleted');
    router.push('/dashboard');
  };

  const deleteChapters = async (ids: string[]) => {
    const { error } = await supabase.from('chapters').delete().in('id', ids);
    if (error) { toast.error(`Failed to delete ${ids.length > 1 ? 'chapters' : 'chapter'}`); return; }
    toast.success(`${ids.length} chapter${ids.length > 1 ? 's' : ''} deleted`);
    setChapters(prev => prev.filter(c => !ids.includes(c.id)));
  };

  const editChapter = async (chapterId: string, newText: string) => {
    const wordCount = newText.split(/\s+/).filter(Boolean).length;
    const { error } = await supabase.from('chapters').update({ cleaned_text: newText, word_count: wordCount }).eq('id', chapterId);
    if (error) { toast.error('Failed to save chapter changes'); return; }
    toast.success('Chapter updated!');
    setChapters(prev => prev.map(c => c.id === chapterId ? { ...c, cleaned_text: newText, word_count: wordCount } : c));
  };

  const totalWords = chapters.reduce((sum, c) => sum + (c.word_count || 0), 0);

  return (
    <div>
      <div className="mb-8">
        <div className="flex items-start justify-between">
          <div>
            {isEditing ? (
              <div className="space-y-3 mb-4">
                <input value={editTitle} onChange={e => setEditTitle(e.target.value)} className="input-field text-xl font-bold" />
                <input value={editSubtitle} onChange={e => setEditSubtitle(e.target.value)} className="input-field text-sm" placeholder="Subtitle" />
                <div className="flex gap-2">
                  <button onClick={saveProjectDetails} className="btn-primary text-sm">Save</button>
                  <button onClick={() => setIsEditing(false)} className="btn-secondary text-sm">Cancel</button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-3 mb-1">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: project.color }} />
                  <h1 className="text-2xl font-bold text-text-primary">{project.title}</h1>
                </div>
                {project.subtitle && <p className="text-text-secondary text-sm ml-6">{project.subtitle}</p>}
                <div className="flex items-center gap-4 mt-3 ml-6 text-xs text-text-muted">
                  <span>📄 {chapters.length} chapters</span>
                  <span>📝 {totalWords.toLocaleString()} total words</span>
                </div>
              </>
            )}
          </div>
          <div className="flex gap-2 shrink-0">
            <Link href={`/process?project=${project.id}`} className="btn-primary text-sm">⚡ Process Chapter</Link>
            <button onClick={() => setIsEditing(!isEditing)} className="btn-secondary text-sm">✏️ Edit</button>
            <button onClick={() => setShowDeleteConfirm(true)} className="btn-danger text-sm">🗑</button>
          </div>
        </div>
      </div>

      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="card max-w-md w-full space-y-4">
            <h3 className="text-lg font-bold text-text-primary">Delete Project?</h3>
            <p className="text-sm text-text-secondary">This will permanently delete &quot;{project.title}&quot; and all {chapters.length} chapters. This cannot be undone.</p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowDeleteConfirm(false)} className="btn-secondary">Cancel</button>
              <button onClick={deleteProject} className="btn-danger">Delete Project</button>
            </div>
          </div>
        </div>
      )}


      <section className="mt-8 pt-8 border-t border-border">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-text-primary flex items-center gap-2">🚀 Browser Crawler (Bypass Security)</h2>
          <span className="px-2 py-0.5 rounded bg-accent/10 text-accent text-[10px] font-bold uppercase tracking-wider">Automated</span>
        </div>
        <div className="card bg-bg-elevated/30 border-dashed">
          <p className="text-sm text-text-secondary mb-4">
            If the automated server scraper is being blocked, use your own browser to &quot;beam&quot; chapters here.
          </p>
          <div className="flex gap-4 mb-4">
              <div className="flex-1">
                <label className="text-[10px] uppercase tracking-wider text-text-muted mb-1 block">Start Chapter #</label>
                <input type="number" id="crawl-start" defaultValue="1" className="w-full bg-black/20 border border-white/10 rounded px-2 py-1 text-xs" />
              </div>
              <div className="flex-1">
                <label className="text-[10px] uppercase tracking-wider text-text-muted mb-1 block">End Chapter #</label>
                <input type="number" id="crawl-end" defaultValue="50" className="w-full bg-black/20 border border-white/10 rounded px-2 py-1 text-xs" />
              </div>
            </div>

            <div className="bg-black/40 rounded-lg p-4 font-mono text-[11px] text-accent/90 overflow-x-auto max-h-64">
              <pre>{`async function stealthCrawler() {
  const projectId = "${project.id}";
  const startIdx = parseInt(document.getElementById('crawl-start')?.value || '1') - 1;
  const endIdx = parseInt(document.getElementById('crawl-end')?.value || '50');
  
  const links = Array.from(document.querySelectorAll('a'))
    .filter(a => {
      const href = a.href.toLowerCase();
      return href.includes('/chapter/') || href.includes('/chapter-') || a.innerText.toLowerCase().includes('chapter ');
    })
    .map(a => ({ title: a.innerText.trim(), url: a.href }));

  const uniqueLinks = Array.from(new Map(links.map(l => [l.url, l])).values())
    .slice(startIdx, endIdx);

  console.log(\`🚀 Popup Crawler: Processing \${uniqueLinks.length} chapters\`);

  // Create a visible progress overlay
  const overlay = document.createElement('div');
  overlay.style.position = 'fixed'; overlay.style.top = '10px'; overlay.style.left = '10px';
  overlay.style.zIndex = '99999'; overlay.style.background = '#000'; overlay.style.color = '#0f0';
  overlay.style.padding = '15px'; overlay.style.border = '2px solid #0f0'; overlay.style.fontFamily = 'monospace';
  overlay.style.boxShadow = '0 0 20px rgba(0,255,0,0.3)';
  document.body.appendChild(overlay);

  for (let i = 0; i < uniqueLinks.length; i++) {
    const link = uniqueLinks[i];
    overlay.innerHTML = \`<div style="font-weight:bold;margin-bottom:5px">SUPER CRAWLER ACTIVE</div>
                        <div>[ \${i+1} / \${uniqueLinks.length} ]</div>
                        <div style="color:#aaa">Loading: \${link.title}</div>\`;
    
    // Open chapter in a new tab
    const win = window.open(link.url, '_blank');
    if (!win) {
      overlay.style.background = 'red';
      overlay.innerText = '🛑 POPUPS BLOCKED! Click "Allow" in address bar.';
      alert('Please allow popups for this site to continue.');
      break;
    }

    // Wait for the new tab to load and render (10 seconds for safety)
    await new Promise(r => setTimeout(r, 10000)); 
    
    try {
      const html = win.document.documentElement.innerHTML;
      
      if (html.includes('Security Check') || html.includes('cf-turnstile')) {
        overlay.style.background = 'red';
        overlay.innerText = '🛑 CAPTCHA detected in popup! Solve it manually.';
        alert('CAPTCHA detected in the popup tab. Please solve it, then restart.');
        break;
      }

      await fetch('http://localhost:3000/api/ingest-browser-content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, url: link.url, html, title: link.title })
      });
      console.log(\`✅ Beamed \${link.title}\`);
      win.close(); // Close the tab after beaming
    } catch (e) {
      console.error('Failed to access popup content. Ensure same-origin.', e);
      overlay.innerText = '❌ Error accessing tab content.';
    }
    
    // Random delay between 2-4 seconds before next tab
    await new Promise(r => setTimeout(r, 2000 + Math.random() * 2000));
  }
  
  overlay.innerText = '✅ Batch complete!';
}

stealthCrawler();`}</pre>
            </div>
            <div className="flex flex-col gap-2">
              <p className="text-xs text-text-muted italic">
                Tip: If you see a CAPTCHA, open any chapter in a new tab, solve it, and then restart this script.
              </p>
              <button 
                onClick={() => {
                  const code = `async function stealthCrawler() { const projectId = "${project.id}"; const startInput = document.getElementById('crawl-start'); const endInput = document.getElementById('crawl-end'); const startIdx = parseInt(startInput?.value || '1') - 1; const endIdx = parseInt(endInput?.value || '50'); const links = Array.from(document.querySelectorAll('a')).filter(a => a.href.toLowerCase().includes('/chapter/') || a.href.toLowerCase().includes('/chapter-')).map(a => ({ title: a.innerText.trim(), url: a.href })); const uniqueLinks = Array.from(new Map(links.map(l => [l.url, l])).values()).slice(startIdx, endIdx); const overlay = document.createElement('div'); overlay.style.position = 'fixed'; overlay.style.top = '10px'; overlay.style.left = '10px'; overlay.style.zIndex = '99999'; overlay.style.background = '#000'; overlay.style.color = '#0f0'; overlay.style.padding = '15px'; overlay.style.border = '2px solid #0f0'; overlay.style.fontFamily = 'monospace'; document.body.appendChild(overlay); for (let i = 0; i < uniqueLinks.length; i++) { const link = uniqueLinks[i]; overlay.innerHTML = \`<div style="font-weight:bold;margin-bottom:5px">SUPER CRAWLER ACTIVE</div><div>[ \${i+1} / \${uniqueLinks.length} ]</div><div style="color:#aaa">Loading: \${link.title}</div>\`; const win = window.open(link.url, '_blank'); if (!win) { alert('Please allow popups!'); break; } await new Promise(r => setTimeout(r, 10000)); try { const html = win.document.documentElement.innerHTML; if (html.includes('Security Check')) { alert('CAPTCHA detected!'); break; } await fetch('http://localhost:3000/api/ingest-browser-content', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId, url: link.url, html, title: link.title }) }); win.close(); } catch (e) { console.error(e); } await new Promise(r => setTimeout(r, 2000 + Math.random() * 2000)); } overlay.innerText = '✅ Batch complete!'; } stealthCrawler();`;
                  navigator.clipboard.writeText(code);
                  toast.success('Batch script copied!');
                }}
                className="btn-secondary w-full"
              >
                📋 Copy Full Automation Script
              </button>
            </div>
          </div>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">📚 Chapter History</h2>
        <ChapterHistory chapters={chapters} searchEnabled onDeleteChapters={deleteChapters} onEditChapter={editChapter} />
      </section>
    </div>
  );
}
