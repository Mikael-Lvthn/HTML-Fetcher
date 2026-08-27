import { Chapter } from '@/types';

export function getChapterTitleAndBody(cleanedText: string, defaultTitle: string) {
  const lines = cleanedText.split('\n');
  if (lines.length > 0 && lines[0].startsWith('---TITLE:')) {
    const customTitle = lines[0].replace('---TITLE:', '').trim();
    const body = lines.slice(1).join('\n').trimStart();
    return { title: customTitle, body };
  }
  return { title: defaultTitle, body: cleanedText };
}

export function updateChapterTitle(cleanedText: string, newTitle: string) {
  const lines = cleanedText.split('\n');
  if (lines.length > 0 && lines[0].startsWith('---TITLE:')) {
    if (!newTitle) {
      // remove custom title
      return lines.slice(1).join('\n').trimStart();
    }
    return `---TITLE: ${newTitle}\n${lines.slice(1).join('\n').trimStart()}`;
  }
  
  if (!newTitle) return cleanedText;
  return `---TITLE: ${newTitle}\n${cleanedText}`;
}

export interface ChapterNumberMatch {
  prefix: string;
  num: number;
  suffix: string;
}

export function parseChapterNumber(title: string): ChapterNumberMatch | null {
  const trimmed = title.trim();
  if (!trimmed) return null;

  // Check if it's pure number, e.g. "71"
  if (/^\d+$/.test(trimmed)) {
    return {
      prefix: 'Chapter ',
      num: parseInt(trimmed, 10),
      suffix: ''
    };
  }

  // Match pattern like "Chapter 71", "Chapter 71: Title", "Ch. 71", etc.
  const match = trimmed.match(/^(\D*?)(\d+)(.*)$/);
  if (match) {
    let prefix = match[1];
    const num = parseInt(match[2], 10);
    const suffix = match[3];
    if (!prefix && !suffix) {
      prefix = 'Chapter ';
    }
    return { prefix, num, suffix };
  }

  return null;
}

export function generateSequentialTitleUpdates(
  chapters: Chapter[],
  editedChapterId: string,
  newTitleInput: string
): { id: string; text: string }[] {
  const editedIndex = chapters.findIndex(c => c.id === editedChapterId);
  if (editedIndex === -1) return [];

  const targetChapter = chapters[editedIndex];
  const { body } = getChapterTitleAndBody(targetChapter.cleaned_text, '');
  const trimmedTitle = newTitleInput.trim();

  // If title was cleared, just clear for this chapter
  if (!trimmedTitle) {
    return [{ id: targetChapter.id, text: updateChapterTitle(body, '') }];
  }

  const parsed = parseChapterNumber(trimmedTitle);
  // If no number found, just update this single chapter
  if (!parsed) {
    return [{ id: targetChapter.id, text: updateChapterTitle(body, trimmedTitle) }];
  }

  const { prefix, num: baseNum } = parsed;
  // Normalized new title for the edited chapter
  const formattedEditedTitle = /^\d+$/.test(trimmedTitle) ? `${prefix}${baseNum}` : trimmedTitle;

  const updates: { id: string; text: string }[] = [
    { id: targetChapter.id, text: updateChapterTitle(body, formattedEditedTitle) }
  ];

  // In reverse-chronological list, chapters above the edited one are indices < editedIndex (editedIndex - 1 down to 0)
  for (let i = editedIndex - 1; i >= 0; i--) {
    const c = chapters[i];
    const offset = editedIndex - i;
    const targetNum = baseNum + offset;

    const defaultTitle = `Chapter ${chapters.length - i}`;
    const { title: currentTitle, body: cBody } = getChapterTitleAndBody(c.cleaned_text, defaultTitle);

    const cParsed = parseChapterNumber(currentTitle);
    let nextTitle = '';
    if (cParsed) {
      const cPrefix = cParsed.prefix || prefix || 'Chapter ';
      const cSuffix = cParsed.suffix || '';
      nextTitle = `${cPrefix}${targetNum}${cSuffix}`;
    } else {
      nextTitle = `${prefix || 'Chapter '}${targetNum}`;
    }

    updates.push({
      id: c.id,
      text: updateChapterTitle(cBody, nextTitle)
    });
  }

  return updates;
}

