import * as cheerio from 'cheerio';

const SELECTORS = [
  '.chapter-content',
  '#chapter-content',
  '.content',
  '.chapter',
  'article',
  '.text-content',
  '#content',
  '.novel-content',
  '.read-container',
  '.chapter-entity',
  '[class*="chapter"]',
  '[class*="content"]',
  'main',
];

const REMOVE_SELECTORS = [
  'script',
  'style',
  'nav',
  'header',
  'footer',
  'aside',
  '.ads',
  '#ads',
  '[class*="ad-"]',
  '[id*="ad-"]',
  '[class*="advertisement"]',
  'iframe',
  'noscript',
  '.sidebar',
  '.comments',
  '.social-share',
  '.related-posts',
  '.navigation',
  '.breadcrumb',
];

export function extractChapterText(html: string): {
  text: string;
  title: string;
} {
  const $ = cheerio.load(html);

  // Get the page title
  const title = $('title').text().trim() || 'Untitled Chapter';

  // Remove unwanted elements
  REMOVE_SELECTORS.forEach((selector) => {
    $(selector).remove();
  });

  // Try each selector, take the first one with enough content
  let chapterText = '';

  for (const selector of SELECTORS) {
    const element = $(selector).first();
    if (element.length) {
      const text = element.text().trim();
      if (text.length > 300) {
        chapterText = text;
        break;
      }
    }
  }

  // Fallback: use the entire body
  if (!chapterText) {
    chapterText = $('body').text().trim();
  }

  // Clean up the text
  chapterText = cleanText(chapterText);

  return { text: chapterText, title };
}

function cleanText(text: string): string {
  return (
    text
      // Remove excessive blank lines (more than 2 consecutive)
      .replace(/\n{3,}/g, '\n\n')
      // Remove common MTL site artifacts
      .replace(/\(End of this chapter\)/gi, '')
      .replace(/\(End of Chapter\)/gi, '')
      .replace(/Please read on the original site/gi, '')
      .replace(/Support the author by reading on/gi, '')
      // Remove HTML entities that might have survived
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      // Trim whitespace from each line
      .split('\n')
      .map((line) => line.trim())
      .join('\n')
      // Final trim
      .trim()
  );
}

export function extractFromRawHtml(html: string): string {
  const $ = cheerio.load(html);

  // Remove all script and style tags
  $('script, style').remove();

  // Get text content
  let text = $('body').text() || $.text();

  return cleanText(text);
}
