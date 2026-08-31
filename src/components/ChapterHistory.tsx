import { useState, useEffect, useRef } from 'react';
import { Chapter } from '@/types';
import toast from 'react-hot-toast';
import { getChapterTitleAndBody, updateChapterTitle, generateSequentialTitleUpdates, parseChapterNumber } from '@/lib/chapterHelpers';

interface Props {
  chapters: Chapter[];
  projectName?: string;
  searchEnabled?: boolean;
  onDeleteChapters?: (ids: string[]) => void;
  onEditChapter?: (id: string, text: string) => void;
  onEditChapters?: (updates: { id: string; text: string }[]) => void;
}

export default function ChapterHistory({ chapters, projectName, searchEnabled = false, onDeleteChapters, onEditChapter, onEditChapters }: Props) {
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [idsToDelete, setIdsToDelete] = useState<string[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [rangeInput, setRangeInput] = useState('');
  
  // For editing chapter body
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  
  // For editing chapter title
  const [editingTitleId, setEditingTitleId] = useState<string | null>(null);
  const [editTitleText, setEditTitleText] = useState('');
  const titleInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingTitleId && titleInputRef.current) {
      titleInputRef.current.focus();
    }
  }, [editingTitleId]);

  const getChapterNumber = (chapter: Chapter, fallbackIdx: number): number => {
    const defaultTitle = `Chapter ${chapters.length - fallbackIdx}`;
    const { title } = getChapterTitleAndBody(chapter.cleaned_text, defaultTitle);
    const parsed = parseChapterNumber(title);
    if (parsed) return parsed.num;
    const numMatch = title.match(/\d+/);
    return numMatch ? parseInt(numMatch[0], 10) : (chapters.length - fallbackIdx);
  };

  const filtered = searchQuery
    ? chapters.filter(c =>
        c.cleaned_text.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (c.chapter_url && c.chapter_url.toLowerCase().includes(searchQuery.toLowerCase()))
      )
    : chapters;

  const toggleSelectAll = () => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map(c => c.id)));
    }
  };

  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const selectRange = () => {
    const raw = rangeInput.trim();
    if (!raw) return;
    
    // Support formats like "1-50", "1 - 50", "1 to 50", "1..50", "ch 1 - ch 50", "1-10, 15, 20-30"
    const parts = raw.split(/[,;]+/).map(p => p.trim()).filter(Boolean);
    const newSelected = new Set(selectedIds);
    let matchedCount = 0;
    
    parts.forEach(part => {
      // Check for range pattern
      const rangeMatch = part.match(/(?:ch(?:apter)?\s*)?(\d+)\s*(?:-|to|\.\.)\s*(?:ch(?:apter)?\s*)?(\d+)/i);
      if (rangeMatch) {
        const start = parseInt(rangeMatch[1], 10);
        const end = parseInt(rangeMatch[2], 10);
        if (!isNaN(start) && !isNaN(end)) {
          const s = Math.min(start, end);
          const e = Math.max(start, end);
          chapters.forEach((c, idx) => {
            const chNum = getChapterNumber(c, idx);
            if (chNum >= s && chNum <= e) {
              newSelected.add(c.id);
              matchedCount++;
            }
          });
        }
      } else {
        // Single number
        const singleMatch = part.match(/(?:ch(?:apter)?\s*)?(\d+)/i);
        if (singleMatch) {
          const num = parseInt(singleMatch[1], 10);
          if (!isNaN(num)) {
            chapters.forEach((c, idx) => {
              const chNum = getChapterNumber(c, idx);
              if (chNum === num) {
                newSelected.add(c.id);
                matchedCount++;
              }
            });
          }
        }
      }
    });
    
    if (newSelected.size > selectedIds.size) {
      setSelectedIds(newSelected);
      setRangeInput('');
      toast.success(`Selected ${newSelected.size} chapter${newSelected.size > 1 ? 's' : ''}`);
    } else {
      toast.error('No chapters found for the specified range');
    }
  };

  const copyChapter = (text: string) => {
    const { body } = getChapterTitleAndBody(text, '');
    navigator.clipboard.writeText(body);
    toast.success('Chapter copied to clipboard!');
  };

  const downloadMarkdownFile = (filename: string, content: string) => {
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const exportMarkdown = async () => {
    const targetChapters = selectedIds.size > 0
      ? chapters.filter(c => selectedIds.has(c.id))
      : chapters;

    if (targetChapters.length === 0) {
      toast.error('No chapters to export');
      return;
    }

    // Sort chapters in ascending numerical order (Chapter 1 -> Chapter 50)
    const sorted = [...targetChapters].sort((a, b) => {
      const idxA = chapters.indexOf(a);
      const idxB = chapters.indexOf(b);
      const numA = getChapterNumber(a, idxA);
      const numB = getChapterNumber(b, idxB);
      return numA - numB;
    });

    const chunkSize = 50;
    const totalChunks = Math.ceil(sorted.length / chunkSize);
    const safePrefix = projectName ? `${projectName.replace(/[^a-zA-Z0-9_-]/g, '_')}_` : '';

    for (let i = 0; i < totalChunks; i++) {
      const chunk = sorted.slice(i * chunkSize, (i + 1) * chunkSize);
      const startIdx = i * chunkSize;
      const endIdx = startIdx + chunk.length - 1;

      const fileContent = chunk.map((c) => {
        const globalIdx = chapters.indexOf(c);
        const defaultTitle = `Chapter ${chapters.length - globalIdx}`;
        const { title, body } = getChapterTitleAndBody(c.cleaned_text, defaultTitle);
        
        const metadataLines = [
          c.chapter_url ? `**Source:** [${c.chapter_url}](${c.chapter_url})` : '**Source:** Manual paste',
          `**Date:** ${new Date(c.detected_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`,
          c.word_count ? `**Words:** ${c.word_count.toLocaleString()}` : null,
        ].filter(Boolean).join('  \n');

        return `# ${title}\n\n${metadataLines}\n\n---\n\n${body}`;
      }).join('\n\n\n' + '---' + '\n\n\n');

      const firstGlobalIdx = chapters.indexOf(chunk[0]);
      const lastGlobalIdx = chapters.indexOf(chunk[chunk.length - 1]);
      const displayStart = getChapterNumber(chunk[0], firstGlobalIdx);
      const displayEnd = getChapterNumber(chunk[chunk.length - 1], lastGlobalIdx);

      const fileName = totalChunks === 1 
        ? `${safePrefix}chapters_${displayStart}-${displayEnd}.md`
        : `${safePrefix}chapters_${String(displayStart).padStart(3, '0')}-${String(displayEnd).padStart(3, '0')}.md`;

      downloadMarkdownFile(fileName, fileContent);

      if (i < totalChunks - 1) {
        await new Promise(r => setTimeout(r, 200));
      }
    }

    toast.success(
      totalChunks === 1
        ? `Exported ${sorted.length} chapters to .md file!`
        : `Exported ${sorted.length} chapters across ${totalChunks} .md files (50 per file)!`
    );
  };

  const confirmDelete = () => {
    if (idsToDelete.length > 0 && onDeleteChapters) {
      onDeleteChapters(idsToDelete);
      setIdsToDelete([]);
      setSelectedIds(prev => {
        const next = new Set(prev);
        idsToDelete.forEach(id => next.delete(id));
        return next;
      });
      idsToDelete.forEach(id => {
        if (expandedId === id) setExpandedId(null);
        if (editingId === id) setEditingId(null);
      });
    }
  };

  const startEditingBody = (chapter: Chapter) => {
    const { body } = getChapterTitleAndBody(chapter.cleaned_text, '');
    setEditingId(chapter.id);
    setEditText(body);
    setExpandedId(chapter.id);
  };

  const saveEditBody = (chapter: Chapter) => {
    if (editingId && onEditChapter) {
      const { title } = getChapterTitleAndBody(chapter.cleaned_text, '');
      const newCleanedText = updateChapterTitle(editText, title);
      onEditChapter(editingId, newCleanedText);
      setEditingId(null);
    }
  };

  const startEditingTitle = (chapter: Chapter, defaultTitle: string) => {
    const { title } = getChapterTitleAndBody(chapter.cleaned_text, defaultTitle);
    setEditingTitleId(chapter.id);
    setEditTitleText(title);
  };

  const [pastingId, setPastingId] = useState<string | null>(null);
  const [htmlToPaste, setHtmlToPaste] = useState('');
  const [isCleaning, setIsCleaning] = useState(false);

  const handlePasteHtml = async () => {
    if (!pastingId || !htmlToPaste) return;
    setIsCleaning(true);
    
    try {
      const res = await fetch('/api/clean-chapter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawHtml: htmlToPaste })
      });
      
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      
      if (onEditChapter) {
        onEditChapter(pastingId, data.cleanedText);
        toast.success('Chapter cleaned and updated!');
      }
      setPastingId(null);
      setHtmlToPaste('');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      toast.error(`Cleaning failed: ${message}`);
    } finally {
      setIsCleaning(false);
    }
  };

  const saveEditTitle = (chapter: Chapter) => {
    if (!editingTitleId) return;
    const updates = generateSequentialTitleUpdates(chapters, chapter.id, editTitleText);
    if (onEditChapters) {
      onEditChapters(updates);
    } else if (onEditChapter) {
      updates.forEach(u => onEditChapter(u.id, u.text));
    }
    setEditingTitleId(null);
  };

  if (chapters.length === 0) {
    return (
      <div className="text-center py-12 text-text-muted">
        <p className="text-lg mb-1">No chapters yet</p>
        <p className="text-sm">Process a chapter to see it here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-bg-elevated/50 p-3 rounded-xl border border-border/50">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 pr-2 border-r border-border/50">
            <input 
              type="checkbox" 
              checked={filtered.length > 0 && selectedIds.size === filtered.length}
              onChange={toggleSelectAll}
              className="w-4 h-4 rounded border-border bg-bg-primary text-accent focus:ring-accent cursor-pointer"
              title={selectedIds.size === filtered.length ? 'Deselect all' : 'Select all'}
            />
            <span className="text-xs text-text-muted select-none whitespace-nowrap">
              {selectedIds.size > 0 ? `${selectedIds.size} selected` : 'All'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="text"
              value={rangeInput}
              onChange={e => setRangeInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && selectRange()}
              className="input-field py-1 px-2.5 text-xs w-36 bg-black/20"
              placeholder="Range (e.g. 1-50)"
            />
            <button 
              onClick={selectRange}
              className="btn-secondary text-[11px] py-1 px-2.5 font-bold uppercase tracking-wider hover:border-accent/40"
              title="Select chapters in range (e.g. 1-50)"
            >
              Select Range
            </button>
            {selectedIds.size > 0 && (
              <button 
                onClick={() => setSelectedIds(new Set())}
                className="text-xs text-text-muted hover:text-text-primary px-1.5 py-1 transition-colors"
                title="Clear selected chapters"
              >
                ✕ Clear
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {searchEnabled && (
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="input-field py-1 px-3 text-xs w-44 bg-black/20"
              placeholder="🔍 Search chapters..."
            />
          )}

          {selectedIds.size > 0 && onDeleteChapters && (
            <button 
              onClick={() => setIdsToDelete(Array.from(selectedIds))}
              className="btn-danger text-xs py-1.5 px-3 flex items-center gap-1.5"
            >
              🗑 Delete ({selectedIds.size})
            </button>
          )}

          <button 
            onClick={exportMarkdown} 
            className="btn-secondary text-xs py-1.5 px-3 shrink-0 flex items-center gap-1.5 border-accent/40 text-accent hover:bg-accent/10"
          >
            📥 {selectedIds.size > 0 ? `Export Selected (${selectedIds.size})` : 'Export All'} (.md)
          </button>
        </div>
      </div>

      {/* Chapter List */}
      <div className="space-y-3">
        {filtered.map(chapter => {
          const defaultTitle = `Chapter ${chapters.length - chapters.indexOf(chapter)}`;
          const { title, body } = getChapterTitleAndBody(chapter.cleaned_text, defaultTitle);
          const isSelected = selectedIds.has(chapter.id);
          
          return (
            <div key={chapter.id} className={`card transition-all ${isSelected ? 'border-accent/40 bg-accent/5' : ''}`}>
              <div className="flex items-start gap-4">
                <div className="pt-1">
                  <input 
                    type="checkbox" 
                    checked={isSelected}
                    onChange={() => toggleSelect(chapter.id)}
                    className="w-4 h-4 rounded border-border bg-bg-primary text-accent focus:ring-accent"
                  />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    {editingTitleId === chapter.id ? (
                      <div className="flex items-center gap-2">
                        <input
                          ref={titleInputRef}
                          value={editTitleText}
                          onChange={e => setEditTitleText(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') saveEditTitle(chapter);
                            if (e.key === 'Escape') setEditingTitleId(null);
                          }}
                          onBlur={() => saveEditTitle(chapter)}
                          className="input-field py-1 px-2 text-sm font-semibold text-text-primary h-auto w-48"
                        />
                      </div>
                    ) : (
                      <div 
                        className="group flex items-center gap-2 cursor-pointer"
                        onClick={() => startEditingTitle(chapter, defaultTitle)}
                      >
                        <span className="text-sm font-semibold text-text-primary group-hover:text-accent transition-colors">
                          {title}
                        </span>
                        {onEditChapter && (
                          <span className="text-xs opacity-0 group-hover:opacity-100 text-text-muted transition-opacity">
                            ✏️
                          </span>
                        )}
                      </div>
                    )}
                    
                    <span className="text-xs text-text-muted">
                      {new Date(chapter.detected_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                    {chapter.word_count && (
                      <span className="text-xs text-text-muted">
                        · {chapter.word_count.toLocaleString()} words
                      </span>
                    )}
                  </div>
                  {chapter.chapter_url && (
                    <a href={chapter.chapter_url} target="_blank" rel="noopener noreferrer" className="text-xs text-accent hover:text-accent-hover truncate block max-w-md">
                      {chapter.chapter_url}
                    </a>
                  )}
                  <p className="text-sm text-text-secondary mt-2 line-clamp-2">
                    {body.slice(0, 200)}...
                  </p>
                </div>
                <div className="flex items-center gap-2 ml-3 shrink-0">
                  <button onClick={() => copyChapter(chapter.cleaned_text)} className="btn-secondary text-xs py-1.5 px-3">📋 Copy</button>
                  {onEditChapter && editingId !== chapter.id && (
                    <button onClick={() => startEditingBody(chapter)} className="btn-secondary text-xs py-1.5 px-3">✏️ Edit</button>
                  )}
                  {onDeleteChapters && (
                    <button onClick={() => setIdsToDelete([chapter.id])} className="btn-danger text-xs py-1.5 px-3 hover:bg-error/20">🗑</button>
                  )}
                  <button onClick={() => setExpandedId(expandedId === chapter.id ? null : chapter.id)} className="btn-secondary text-xs py-1.5 px-3">{expandedId === chapter.id ? '▲' : '▼'}</button>
                  <button 
                    onClick={() => setPastingId(chapter.id)} 
                    className="btn-secondary text-xs py-1.5 px-3 border-accent/30 text-accent hover:bg-accent/10"
                    title="Paste HTML source to clean"
                  >
                    📥 Paste HTML
                  </button>
                </div>
              </div>

              {expandedId === chapter.id && (
                <div className="mt-4 pt-4 border-t border-border">
                  {editingId === chapter.id ? (
                    <div className="space-y-3">
                      <textarea 
                        value={editText} 
                        onChange={e => setEditText(e.target.value)} 
                        className="input-field h-96 resize-y font-mono text-sm leading-relaxed w-full"
                      />
                      <div className="flex gap-2 justify-end">
                        <button onClick={() => setEditingId(null)} className="btn-secondary text-sm">Cancel</button>
                        <button onClick={() => saveEditBody(chapter)} className="btn-primary text-sm">💾 Save Changes</button>
                      </div>
                    </div>
                  ) : (
                    <div className="chapter-output max-h-96 overflow-y-auto p-4 rounded-xl bg-bg-primary border border-border">
                      {body.split('\n').map((p, i) => <p key={i}>{p}</p>)}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Paste HTML Modal */}
      {pastingId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="card max-w-2xl w-full space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-text-primary">📥 Paste Chapter HTML</h3>
              <button onClick={() => setPastingId(null)} className="text-text-muted hover:text-text-primary">✕</button>
            </div>
            <p className="text-xs text-text-secondary">
              Open the chapter in your browser, press <strong>Ctrl + U</strong>, copy everything, and paste it here.
            </p>
            <textarea 
              value={htmlToPaste}
              onChange={e => setHtmlToPaste(e.target.value)}
              className="input-field h-64 resize-none font-mono text-[10px]"
              placeholder="Paste <html> source code here..."
            />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setPastingId(null)} className="btn-secondary">Cancel</button>
              <button 
                onClick={handlePasteHtml} 
                disabled={isCleaning || !htmlToPaste}
                className="btn-primary"
              >
                {isCleaning ? 'Cleaning...' : 'Clean & Save HTML'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {idsToDelete.length > 0 && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="card max-w-sm w-full space-y-4">
            <h3 className="text-lg font-bold text-text-primary">Delete {idsToDelete.length > 1 ? `${idsToDelete.length} Chapters` : 'Chapter'}?</h3>
            <p className="text-sm text-text-secondary">Are you sure you want to delete {idsToDelete.length > 1 ? 'these chapters' : 'this chapter'}? This action cannot be undone.</p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setIdsToDelete([])} className="btn-secondary">Cancel</button>
              <button onClick={confirmDelete} className="btn-danger">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
