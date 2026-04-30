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
