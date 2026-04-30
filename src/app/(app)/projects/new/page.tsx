'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import Header from '@/components/Header';
import toast from 'react-hot-toast';

const PRESET_COLORS = ['#6366f1', '#f97316', '#a855f7', '#ef4444', '#3b82f6', '#22c55e', '#f59e0b', '#ec4899'];

export default function NewProjectPage() {
  const router = useRouter();
  const supabase = createClient();
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [fandomsInput, setFandomsInput] = useState('');
  const [keywordsInput, setKeywordsInput] = useState('');
  const [color, setColor] = useState('#6366f1');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) { toast.error('Title is required'); return; }
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { toast.error('Not logged in'); return; }

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

    if (error) { toast.error('Failed to create project'); setLoading(false); return; }
    toast.success('Project created!');
    router.push(`/projects/${data.id}`);
  };

  return (
    <div>
      <Header title="New Project" subtitle="Create a new translation project" />
      <form onSubmit={handleSubmit} className="card max-w-2xl space-y-6">
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1.5">Title *</label>
          <input type="text" value={title} onChange={e => setTitle(e.target.value)} className="input-field" placeholder='e.g. "Naruto × Kamen Rider"' required />
        </div>
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1.5">Subtitle</label>
          <input type="text" value={subtitle} onChange={e => setSubtitle(e.target.value)} className="input-field" placeholder='e.g. "Protagonist: Mufasa"' />
        </div>
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1.5">Fandoms (comma-separated)</label>
          <input type="text" value={fandomsInput} onChange={e => setFandomsInput(e.target.value)} className="input-field" placeholder="Naruto, Kamen Rider" />
        </div>
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1.5">Detection Keywords (comma-separated)</label>
          <input type="text" value={keywordsInput} onChange={e => setKeywordsInput(e.target.value)} className="input-field" placeholder="Mufasa, Konoha, chakra, Hashirama" />
          <p className="text-xs text-text-muted mt-1">Used to auto-detect which project a chapter belongs to</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-2">Project Color</label>
          <div className="flex gap-2">
            {PRESET_COLORS.map(c => (
              <button key={c} type="button" onClick={() => setColor(c)} className={`w-8 h-8 rounded-lg transition-all ${color === c ? 'ring-2 ring-white ring-offset-2 ring-offset-bg-card scale-110' : 'hover:scale-105'}`} style={{ backgroundColor: c }} />
            ))}
          </div>
        </div>
        <div className="flex gap-3 pt-2">
          <button type="submit" disabled={loading} className="btn-primary">{loading ? <><div className="spinner" /> Creating...</> : '+ Create Project'}</button>
          <button type="button" onClick={() => router.back()} className="btn-secondary">Cancel</button>
        </div>
      </form>
    </div>
  );
}
