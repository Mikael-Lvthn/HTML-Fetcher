'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase';
import { Project, ProcessingStep } from '@/types';
import toast from 'react-hot-toast';
import { QueueIcon, CrawlIcon, FlameIcon, LinkIcon, DocumentTextIcon, AlertIcon, CheckCircleIcon, XCircleIcon, SparklesIcon, ClipboardIcon } from '@/components/icons';

interface Props {
  projects: Project[];
  preselectedProjectId?: string;
}

type Mode = 'single' | 'bulk' | 'crawl';

export default function ChapterProcessor({ projects, preselectedProjectId }: Props) {
  const supabase = createClient();
  const [mode, setMode] = useState<Mode>('single');
  const [urlInput, setUrlInput] = useState('');
  const [manualMode, setManualMode] = useState(false);
  const [manualText, setManualText] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState(preselectedProjectId || '');
  const [cleanedText, setCleanedText] = useState('');
  const [wordCount, setWordCount] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [steps, setSteps] = useState<ProcessingStep[]>([]);
  const [error, setError] = useState('');
  const [bulkUrls, setBulkUrls] = useState('');
  const [useFirecrawl, setUseFirecrawl] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ current: number; total: number; results: { url: string; status: string; message?: string }[] } | null>(null);
  const outputRef = useRef<HTMLDivElement>(null);

  const updateStep = useCallback((id: string, status: ProcessingStep['status']) => {
    setSteps(prev => prev.map(s => s.id === id ? { ...s, status } : s));
  }, []);

  const handleProcess = async () => {
    setIsProcessing(true); setError(''); setCleanedText(''); setWordCount(0);

    const pSteps: ProcessingStep[] = !manualMode && urlInput
      ? [
          { id: 'fetch', label: 'Fetching & Cleaning...', status: 'pending' },
          { id: 'save', label: 'Saving to history...', status: 'pending' },
        ]
      : [
          { id: 'clean', label: 'Cleaning text...', status: 'pending' },
          { id: 'save', label: 'Saving to history...', status: 'pending' },
        ];
    setSteps(pSteps);

    try {
      let finalCleaned = '';
      const chapterUrl = !manualMode ? urlInput : '';

      if (!manualMode && urlInput) {
        updateStep('fetch', 'active');
        const res = await fetch('/api/clean-chapter', { 
          method: 'POST', 
          headers: { 'Content-Type': 'application/json' }, 
          body: JSON.stringify({ url: urlInput, useFirecrawl })
        });
        const data = await res.json();
        if (data.error) { updateStep('fetch', 'error'); throw new Error(data.error); }
        finalCleaned = data.cleanedText;
        setCleanedText(finalCleaned);
        updateStep('fetch', 'done');
      } else {
        updateStep('clean', 'active');
        const res = await fetch('/api/clean-chapter', { 
          method: 'POST', 
          headers: { 'Content-Type': 'application/json' }, 
          body: JSON.stringify({ rawHtml: manualText }) 
        });
        const data = await res.json();
        if (data.error) { updateStep('clean', 'error'); throw new Error(data.error); }
        finalCleaned = data.cleanedText;
        setCleanedText(finalCleaned);
        updateStep('clean', 'done');
      }

      const projId = selectedProjectId;
      const project = projects.find(p => p.id === projId);
      if (!project) throw new Error('Please select a project');

      updateStep('save', 'active');
      const wc = finalCleaned.split(/\s+/).filter(Boolean).length;
      setWordCount(wc);
      const authRes = await supabase.auth.getUser();
      const user = authRes?.data?.user;
      if (user) {
        let existingId: string | null = null;
        if (chapterUrl) {
          const { data: existing } = await supabase
            .from('chapters')
            .select('id')
            .eq('project_id', projId)
            .eq('chapter_url', chapterUrl)
            .limit(1)
            .maybeSingle();
          if (existing) existingId = existing.id;
        }

        if (existingId) {
          const { error: updateErr } = await supabase.from('chapters').update({
            cleaned_text: finalCleaned,
            word_count: wc,
            detected_at: new Date().toISOString()
          }).eq('id', existingId);
          if (updateErr) toast.error('Cleaned but failed to update'); else toast.success('Chapter updated!');
        } else {
          const { error: saveErr } = await supabase.from('chapters').insert({ 
            user_id: user.id, 
            project_id: projId, 
            chapter_url: chapterUrl || null, 
            raw_text: manualText || '', // We don't have the original raw html if we fetched it on server
            cleaned_text: finalCleaned, 
            word_count: wc 
          });
          if (saveErr) toast.error('Cleaned but failed to save'); else toast.success('Chapter saved!');
        }
      }
      updateStep('save', 'done');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message); toast.error(message);
    } finally { setIsProcessing(false); }
  };

  const handleBulkProcess = async () => {
    const urls = bulkUrls.split('\n').map(u => u.trim()).filter(u => u.length > 0);
    if (!urls.length) { toast.error('Enter at least one URL'); return; }
    if (!selectedProjectId) { toast.error('Select a project'); return; }
    
    setIsProcessing(true);
    setBulkProgress({ current: 0, total: urls.length, results: [] });

    for (let i = 0; i < urls.length; i++) {
      setBulkProgress(prev => ({ ...prev!, current: i + 1 }));
      try {
        const res = await fetch('/api/clean-chapter', { 
          method: 'POST', 
          headers: { 'Content-Type': 'application/json' }, 
          body: JSON.stringify({ url: urls[i], useFirecrawl })
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);

        const cleaned = data.cleanedText;
        const bulkAuthRes = await supabase.auth.getUser();
        const user = bulkAuthRes?.data?.user;
        if (user) {
          const { data: existing } = await supabase
            .from('chapters')
            .select('id')
            .eq('project_id', selectedProjectId)
            .eq('chapter_url', urls[i])
            .limit(1)
            .maybeSingle();

          if (existing) {
            await supabase.from('chapters').update({
              cleaned_text: cleaned,
              word_count: cleaned.split(/\s+/).filter(Boolean).length,
              detected_at: new Date().toISOString()
            }).eq('id', existing.id);
          } else {
            await supabase.from('chapters').insert({ 
              user_id: user.id, 
              project_id: selectedProjectId, 
              chapter_url: urls[i], 
              cleaned_text: cleaned, 
              word_count: cleaned.split(/\s+/).filter(Boolean).length 
            });
          }
        }

        setBulkProgress(prev => ({ ...prev!, results: [...prev!.results, { url: urls[i], status: 'success' }] }));
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        setBulkProgress(prev => ({ ...prev!, results: [...prev!.results, { url: urls[i], status: 'error', message }] }));
      }
    }
    toast.success('Bulk processing complete!');
    setIsProcessing(false);
  };

  const [manualIndexMode, setManualIndexMode] = useState(false);
  const [manualIndexHtml, setManualIndexHtml] = useState('');

  const handleCrawlIndex = async () => {
    if (!manualIndexMode && !urlInput) { toast.error('Enter novel index URL'); return; }
    if (manualIndexMode && !manualIndexHtml) { toast.error('Paste index HTML source'); return; }
    
    setIsProcessing(true);
    setError('');
    try {
      const res = await fetch('/api/crawl-novel', { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ 
          url: urlInput,
          rawHtml: manualIndexMode ? manualIndexHtml : undefined,
          useFirecrawl
        }) 
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      
      const urls = (data.chapters as { url: string }[]).map(c => c.url).join('\n');
      setBulkUrls(urls);
      setMode('bulk');
      toast.success(`Discovered ${data.chapters.length} chapters!`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      toast.error(message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCopy = () => { navigator.clipboard.writeText(cleanedText); toast.success('Copied!'); };
  const handleReset = () => {
    setCleanedText('');
    setUrlInput('');
    setManualText('');
    setManualIndexHtml('');
    setWordCount(0);
    setSteps([]);
    setError('');
    setBulkProgress(null);
  };

  useEffect(() => { if (outputRef.current && cleanedText) outputRef.current.scrollTop = outputRef.current.scrollHeight; }, [cleanedText]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => setMode('single')} className={`inline-flex items-center gap-2 cursor-pointer px-4 py-2 rounded-lg text-sm font-medium transition-all ${mode === 'single' ? 'bg-accent/15 text-accent border border-accent/20' : 'text-text-muted hover:text-text-primary border border-transparent'}`}>Single Chapter</button>
        <button onClick={() => setMode('bulk')} className={`inline-flex items-center gap-2 cursor-pointer px-4 py-2 rounded-lg text-sm font-medium transition-all ${mode === 'bulk' ? 'bg-accent/15 text-accent border border-accent/20' : 'text-text-muted hover:text-text-primary border border-transparent'}`}><QueueIcon /> Bulk Queue</button>
        <button onClick={() => setMode('crawl')} className={`inline-flex items-center gap-2 cursor-pointer px-4 py-2 rounded-lg text-sm font-medium transition-all ${mode === 'crawl' ? 'bg-accent/15 text-accent border border-accent/20' : 'text-text-muted hover:text-text-primary border border-transparent'}`}><CrawlIcon /> Crawl Novel</button>
      </div>

      <div className="card flex items-center justify-between gap-4 py-3">
        <div>
          <p className="text-sm font-medium text-text-primary"><span className="inline-flex items-center gap-1.5"><FlameIcon className="w-4 h-4 text-warning" /> Use Firecrawl</span></p>
          <p className="text-xs text-text-muted">
            Renders JavaScript &amp; bypasses anti-bot protection. Uses Firecrawl credits and requires an API key in Settings.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={useFirecrawl}
          onClick={() => setUseFirecrawl(!useFirecrawl)}
          disabled={isProcessing}
          className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 cursor-pointer ${useFirecrawl ? 'bg-accent' : 'bg-bg-elevated border border-border'}`}
        >
          <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${useFirecrawl ? 'translate-x-5' : ''}`} />
        </button>
      </div>

      {mode === 'crawl' && (
        <div className="space-y-4">
          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-text-primary">Novel Index Crawler</h3>
              <button
                onClick={() => setManualIndexMode(!manualIndexMode)}
                className={`inline-flex items-center gap-1.5 cursor-pointer text-xs px-3 py-1.5 rounded-lg ${manualIndexMode ? 'bg-warning/15 text-warning border border-warning/20' : 'text-text-muted bg-bg-elevated border border-transparent'}`}
              >
                {manualIndexMode ? <><LinkIcon className="w-3.5 h-3.5" /> URL Mode</> : <><DocumentTextIcon className="w-3.5 h-3.5" /> Manual Paste HTML</>}
              </button>
            </div>
            
            <p className="text-xs text-text-muted mb-4">
              {manualIndexMode 
                ? "Paste the HTML source of the novel's Table of Contents page. (Inspect -> Copy outerHTML of the list container)"
                : "Enter the root URL of a novel (e.g. from fanmtl.com) to automatically discover all chapters."
              }
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5">Novel URL (for link resolution)</label>
                <input 
                  type="url" 
                  value={urlInput} 
                  onChange={e => setUrlInput(e.target.value)} 
                  className="input-field" 
                  placeholder="https://wtr-lab.com/en/novel/4131/..."
                  disabled={isProcessing}
                />
              </div>

              {manualIndexMode && (
                <div>
                  <label className="block text-xs font-medium text-text-secondary mb-1.5">Page HTML Source</label>
                  <textarea 
                    value={manualIndexHtml} 
                    onChange={e => setManualIndexHtml(e.target.value)} 
                    className="input-field h-48 resize-none font-mono text-sm" 
                    placeholder="Paste <div class='toc'>...</div> or full page HTML here..."
                    disabled={isProcessing}
                  />
                </div>
              )}
            </div>
            
            {error && <div className="mt-3 p-3 rounded-lg bg-error/10 border border-error/20 text-error text-sm"><span className="inline-flex items-start gap-2"><AlertIcon className="w-4 h-4 mt-0.5 flex-shrink-0" /> {error}</span></div>}
          </div>
          <button 
            onClick={handleCrawlIndex} 
            disabled={isProcessing || (!urlInput && !manualIndexHtml)} 
            className="btn-primary w-full justify-center py-3 text-base"
          >
            {isProcessing ? <><div className="spinner" /> Processing...</> : <><CrawlIcon className="w-5 h-5" /> {manualIndexMode ? 'Extract Chapters from HTML' : 'Crawl & Discover Chapters'}</>}
          </button>
        </div>
      )}

      {mode === 'bulk' && (
        <div className="space-y-4">
          <div className="card">
            <label className="block text-sm font-medium text-text-secondary mb-2">Chapter URLs (one per line)</label>
            <textarea value={bulkUrls} onChange={e => setBulkUrls(e.target.value)} className="input-field h-60 resize-none font-mono text-sm" placeholder={"https://fanmtl.com/chapter/story/ch-1\nhttps://fanmtl.com/chapter/story/ch-2"} />
          </div>
          <div className="card">
            <label className="block text-sm font-medium text-text-secondary mb-2">Target Project</label>
            <select value={selectedProjectId} onChange={e => setSelectedProjectId(e.target.value)} className="input-field">
              <option value="">Select...</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
            </select>
          </div>
          {bulkProgress && (
            <div className="card space-y-3">
              <div className="flex items-center justify-between"><span className="text-sm font-medium">Processing {bulkProgress.current}/{bulkProgress.total}</span><span className="text-xs text-text-muted">{Math.round((bulkProgress.results.length / bulkProgress.total) * 100)}%</span></div>
              <div className="w-full h-2 bg-bg-primary rounded-full overflow-hidden"><div className="h-full bg-gradient-to-r from-accent to-purple-500 rounded-full transition-all duration-500" style={{ width: `${(bulkProgress.results.length / bulkProgress.total) * 100}%` }} /></div>
              <div className="space-y-1 max-h-40 overflow-y-auto">{bulkProgress.results.map((r, i) => <div key={i} className="flex items-center gap-2 text-xs"><span>{r.status === 'success' ? <CheckCircleIcon className="w-3.5 h-3.5 text-success flex-shrink-0" /> : <XCircleIcon className="w-3.5 h-3.5 text-error flex-shrink-0" />}</span><span className="truncate text-text-muted">{r.url}</span>{r.message && <span className="text-error ml-auto">{r.message}</span>}</div>)}</div>
            </div>
          )}
          <button onClick={handleBulkProcess} disabled={isProcessing || !selectedProjectId || !bulkUrls} className="btn-primary w-full justify-center py-3 text-base">{isProcessing ? <><div className="spinner" /> Processing...</> : <><QueueIcon className="w-5 h-5" /> Start Bulk Fetching</>}</button>
        </div>
      )}

      {mode === 'single' && (
        <div className="space-y-4">
          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2">Input</h3>
              <button onClick={() => setManualMode(!manualMode)} className={`inline-flex items-center gap-1.5 cursor-pointer text-xs px-3 py-1.5 rounded-lg ${manualMode ? 'bg-warning/15 text-warning border border-warning/20' : 'text-text-muted bg-bg-elevated border border-transparent'}`}>{manualMode ? <><LinkIcon className="w-3.5 h-3.5" /> URL Mode</> : <><DocumentTextIcon className="w-3.5 h-3.5" /> Manual Paste</>}</button>
            </div>
            {!manualMode ? <input type="url" value={urlInput} onChange={e => setUrlInput(e.target.value)} className="input-field" placeholder="Paste chapter URL..." disabled={isProcessing} /> : <textarea value={manualText} onChange={e => setManualText(e.target.value)} className="input-field h-48 resize-none font-mono text-sm" placeholder="Paste raw chapter text or HTML..." disabled={isProcessing} />}
            {error && <div className="mt-3 p-3 rounded-lg bg-error/10 border border-error/20 text-error text-sm"><span className="inline-flex items-start gap-2"><AlertIcon className="w-4 h-4 mt-0.5 flex-shrink-0" /> {error}</span></div>}
          </div>

          <div className="card">
            <h3 className="text-sm font-semibold text-text-primary mb-3">Project</h3>
            <select value={selectedProjectId} onChange={e => setSelectedProjectId(e.target.value)} className="input-field" disabled={isProcessing}><option value="">Select a project...</option>{projects.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}</select>
          </div>

          <button onClick={handleProcess} disabled={isProcessing || (!urlInput && !manualText) || !selectedProjectId} className="btn-primary w-full justify-center py-3.5 text-base glow-accent">{isProcessing ? <><div className="spinner" /> Processing...</> : <><SparklesIcon className="w-5 h-5" /> Fetch &amp; Clean Chapter</>}</button>

          {steps.length > 0 && <div className="card space-y-2">{steps.map(step => <div key={step.id} className={`flex items-center gap-3 py-2 px-3 rounded-lg text-sm ${step.status === 'active' ? 'bg-accent/10 text-accent' : step.status === 'done' ? 'text-success' : step.status === 'error' ? 'text-error' : 'text-text-muted'}`}>{step.status === 'active' ? <div className="spinner" /> : step.status === 'done' ? <CheckCircleIcon className="w-4 h-4" /> : step.status === 'error' ? <XCircleIcon className="w-4 h-4" /> : <span className="w-1.5 h-1.5 rounded-full bg-current opacity-40" />}<span className={step.status === 'active' ? 'pulse-dot' : ''}>{step.label}</span></div>)}</div>}

          {cleanedText && (
            <div className="animate-fade-in space-y-4">
              <div className="card">
                <div className="flex items-center justify-between mb-4"><h3 className="text-sm font-semibold text-text-primary flex items-center gap-2">Cleaned Output</h3><span className="text-xs text-text-muted">{wordCount.toLocaleString()} words</span></div>
                <div ref={outputRef} className="chapter-output max-h-[500px] overflow-y-auto p-6 rounded-xl bg-bg-primary border border-border">{cleanedText.split('\n').map((p, i) => <p key={i}>{p}</p>)}</div>
                <div className="flex gap-3 mt-4"><button onClick={handleCopy} className="btn-primary"><ClipboardIcon /> Copy to Clipboard</button><button onClick={handleReset} className="btn-secondary">Process Another</button></div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
