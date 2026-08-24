'use client';

import { useState } from 'react';
import Header from '@/components/Header';
import toast from 'react-hot-toast';
import { FlameIcon, AlertIcon, BookOpenIcon, ClipboardIcon, DownloadIcon } from '@/components/icons';

type ReadFormat = 'markdown' | 'html' | 'json';

const FORMAT_TABS: { id: ReadFormat; label: string; ext: string }[] = [
  { id: 'markdown', label: 'Markdown', ext: 'md' },
  { id: 'html', label: 'HTML', ext: 'html' },
  { id: 'json', label: 'JSON', ext: 'json' },
];

export default function ReaderClient() {
  const [url, setUrl] = useState('');
  const [format, setFormat] = useState<ReadFormat>('markdown');
  const [useFirecrawl, setUseFirecrawl] = useState(false);
  const [output, setOutput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleRead = async () => {
    if (!url) { toast.error('Enter a URL'); return; }
    setIsLoading(true); setError(''); setOutput('');

    try {
      const res = await fetch('/api/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, format, useFirecrawl })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      const content = format === 'json'
        ? JSON.stringify(data.data, null, 2)
        : data.content;
      setOutput(content || '');
      if (!content) toast.error('The page returned no readable content');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to read the page';
      setError(message);
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(output);
    toast.success('Copied!');
  };

  const handleDownload = () => {
    const tab = FORMAT_TABS.find(t => t.id === format)!;
    const mime = format === 'json' ? 'application/json' : format === 'html' ? 'text/html' : 'text/markdown';
    const blob = new Blob([output], { type: `${mime};charset=utf-8` });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    let name = 'page';
    try { name = new URL(url).hostname.replace(/^www\./, ''); } catch {}
    a.download = `${name}.${tab.ext}`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const wordCount = output.split(/\s+/).filter(Boolean).length;

  return (
    <div>
      <Header title="Reader" subtitle="Turn any URL into clean Markdown, HTML, or JSON" />

      <div className="space-y-4 max-w-4xl">
        <div className="card space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">Page URL</label>
            <input
              type="url"
              value={url}
              onChange={e => setUrl(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !isLoading) handleRead(); }}
              className="input-field"
              placeholder="https://example.com/article"
              disabled={isLoading}
            />
          </div>

          <div className="flex items-center gap-3">
            {FORMAT_TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setFormat(tab.id)}
                disabled={isLoading}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer ${format === tab.id ? 'bg-accent/15 text-accent border border-accent/20' : 'text-text-muted hover:text-text-primary border border-transparent'}`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between gap-4 pt-2 border-t border-border">
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
              disabled={isLoading}
              className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 cursor-pointer ${useFirecrawl ? 'bg-accent' : 'bg-bg-elevated border border-border'}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${useFirecrawl ? 'translate-x-5' : ''}`} />
            </button>
          </div>

          {error && <div className="p-3 rounded-lg bg-error/10 border border-error/20 text-error text-sm"><span className="inline-flex items-start gap-2"><AlertIcon className="w-4 h-4 mt-0.5 flex-shrink-0" /> {error}</span></div>}
        </div>

        <button
          onClick={handleRead}
          disabled={isLoading || !url}
          className="btn-primary w-full justify-center py-3 text-base"
        >
          {isLoading ? <><div className="spinner" /> Reading...</> : <><BookOpenIcon className="w-5 h-5" /> Read Page</>}
        </button>

        {output && (
          <div className="card animate-fade-in">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-text-primary">Output</h3>
              <span className="text-xs text-text-muted">
                {wordCount.toLocaleString()} words · {output.length.toLocaleString()} chars
              </span>
            </div>
            <pre className="max-h-[500px] overflow-auto p-6 rounded-xl bg-bg-primary border border-border text-sm whitespace-pre-wrap break-words font-mono">
              {output}
            </pre>
            <div className="flex gap-3 mt-4">
              <button onClick={handleCopy} className="btn-primary"><ClipboardIcon /> Copy</button>
              <button onClick={handleDownload} className="btn-secondary"><DownloadIcon /> Download</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
