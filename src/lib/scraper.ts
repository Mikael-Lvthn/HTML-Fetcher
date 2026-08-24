import * as cheerio from 'cheerio';

export interface ChapterLink {
  title: string;
  url: string;
}

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function fetchWithHeaders(url: string, cookies?: string) {
  return fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
      'Referer': 'https://wtr-lab.com/',
      'Origin': 'https://wtr-lab.com',
      ...(cookies ? { 'Cookie': cookies } : {})
    }
  });
}

export async function crawlNovelIndex(rootUrl: string, rawHtml?: string, cookies?: string): Promise<{ title: string; chapters: ChapterLink[] }> {
  const baseUrl = rootUrl ? new URL(rootUrl).origin : '';
  const isWtrLab = rootUrl.includes('wtr-lab.com') || (rawHtml?.includes('wtr-lab.com'));
  
  let html = rawHtml;
  if (!html && rootUrl) {
    const res = await fetchWithHeaders(rootUrl, cookies);
    if (!res.ok) throw new Error(`Failed to fetch index: ${res.status}`);
    html = await res.text();
  }

  if (!html) throw new Error('No content found to crawl');
  const $ = cheerio.load(html);

  const novelTitle = $('h1').first().text().trim() || 'Unknown Novel';
  const chapters: ChapterLink[] = [];

  const extractPageChapters = (pageHtml: string) => {
    const _$ = cheerio.load(pageHtml);
    _$('a').each((_, el) => {
      const href = _$(el).attr('href');
      const title = _$(el).text().trim();
      if (!href) return;

      const isChapterLink = 
        href.includes('/chapter/') || 
        href.includes('_') || 
        title.toLowerCase().includes('chapter') ||
        (isWtrLab && (_$(el).hasClass('chapter-item') || _$(el).hasClass('toc-latest-row')));

      if (isChapterLink) {
        const fullUrl = href.startsWith('http') ? href : `${baseUrl}${href}`;
        if (!chapters.find(c => c.url === fullUrl)) {
          chapters.push({ title: title || `Chapter ${chapters.length + 1}`, url: fullUrl });
        }
      }
    });
  };

  extractPageChapters(html);

  // Pagination detection
  const pageLinks: string[] = [];
  $('a').each((_, el) => {
    const href = $(el).attr('href');
    const text = $(el).text().trim();
    if (href && (href.includes('page=') || /^\d+$/.test(text))) {
      const fullUrl = href.startsWith('http') ? href : `${baseUrl}${href}`;
      if (!pageLinks.includes(fullUrl) && pageLinks.length < 10) pageLinks.push(fullUrl);
    }
  });

  for (const pageUrl of pageLinks) {
    try {
      const pRes = await fetchWithHeaders(pageUrl, cookies);
      if (pRes.ok) {
        const pHtml = await pRes.text();
        extractPageChapters(pHtml);
      }
    } catch (e) {
      console.error(`Failed to fetch page ${pageUrl}`, e);
    }
  }

  return { title: novelTitle, chapters };
}

export function cleanChapterHtml(html: string): string {
  const $ = cheerio.load(html);

  // 1. Try to find WTR-LAB specific content first
  const WTR_SELECTORS = ['.chapter-body', '#read-content', '.read-content', '.chapter-content'];
  for (const s of WTR_SELECTORS) {
    const el = $(s).first();
    if (el.length && el.text().trim().length > 100) {
      el.find('p, br, div').each((_, e) => { $(e).after('\n'); });
      return finalizeText(el.text());
    }
  }

  // 2. Try to extract from __NEXT_DATA__ (Common in Next.js sites like WTR-LAB)
  const nextData = $('#__NEXT_DATA__').html();
  if (nextData) {
    try {
      const data = JSON.parse(nextData);
      // Look for common content paths in the JSON
      const body = data.props?.pageProps?.chapter?.content || 
                   data.props?.pageProps?.node?.content ||
                   data.query?.content;
      if (body && typeof body === 'string' && body.length > 100) {
        return finalizeText(body);
      }
    } catch {
      console.error('Failed to parse __NEXT_DATA__');
    }
  }

  // 3. General purpose cleaning
  const REMOVE = [
    'script', 'style', 'nav', 'header', 'footer', 'aside', 'iframe', 'noscript',
    '.ads', '#ads', '.advertisement', '.sidebar', '.comments', '.social-share',
    '.chapter-nav', '.nav-container', '.breadcrumb', '.pagination', '.btn'
  ];
  REMOVE.forEach(s => $(s).remove());

  const SELECTORS = [
    'article', 'main', '.content', '#content', '.post-content', '.entry-content'
  ];
  
  for (const s of SELECTORS) {
    const el = $(s).first();
    if (el.length && el.text().trim().length > 200) {
      el.find('p, br, div').each((_, e) => { $(e).after('\n'); });
      return finalizeText(el.text());
    }
  }

  // 4. Ultimate Fallback: Largest text block
  let content = '';
  let maxLen = 0;
  $('div, section, article').each((_, el) => {
    const text = $(el).text().trim();
    if (text.length > maxLen) {
      maxLen = text.length;
      content = $(el).text();
    }
  });

  return finalizeText(content || $('body').text());
}

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
    // Inline watermarks injected mid-chapter by aggregator sites
    .filter(line => !/^【.*】$/.test(line))
    .filter(line => !/\b[\w?？]*[?？][\w?？]*\.(com|net|org)\b/i.test(line))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  // If the content is just an ad-blocker warning, return empty so fallbacks can try
  if (cleaned.toLowerCase().includes('ad blocker detected') ||
      cleaned.toLowerCase().includes('disable your ad blocker')) {
    return '';
  }

  return cleaned;
}
