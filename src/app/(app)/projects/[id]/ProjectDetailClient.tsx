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
  const [appUrl, setAppUrl] = useState('');
  const [startCh, setStartCh] = useState('1');
  const [endCh, setEndCh] = useState('50');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setAppUrl(window.location.origin);
    }
  }, []);

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
              <input 
                type="number" 
                value={startCh} 
                onChange={e => setStartCh(e.target.value)} 
                className="w-full bg-black/20 border border-white/10 rounded px-2 py-1 text-xs" 
              />
            </div>
            <div className="flex-1">
              <label className="text-[10px] uppercase tracking-wider text-text-muted mb-1 block">End Chapter #</label>
              <input 
                type="number" 
                value={endCh} 
                onChange={e => setEndCh(e.target.value)} 
                className="w-full bg-black/20 border border-white/10 rounded px-2 py-1 text-xs" 
              />
            </div>
          </div>

          <div className="bg-black/40 rounded-lg p-4 font-mono text-[11px] text-accent/90 overflow-x-auto max-h-64 mb-4">
            <pre>{crawlerScript}</pre>
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-xs text-text-muted italic">
              Tip: Copy this script, open the novel Table of Contents page on FanMTL, open Browser Console (F12 $\rightarrow$ Console), paste and press Enter!
            </p>
            <button 
              onClick={() => {
                navigator.clipboard.writeText(crawlerScript);
                toast.success('Automation script copied!');
              }}
              className="btn-secondary w-full"
            >
              📋 Copy Automation Script
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
