import * as cheerio from 'cheerio';

export interface ChapterLink {
  title: string;
  url: string;
}

async function fetchWithHeaders(url: string, cookies?: string) {
  let origin = '';
  try {
    origin = new URL(url).origin;
  } catch {}

  const baseHeaders: Record<string, string> = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Upgrade-Insecure-Requests': '1',
  };

  if (cookies) {
    baseHeaders['Cookie'] = cookies;
  }

  // Strategy 1: Standard navigation headers with domain referer
  let res = await fetch(url, {
    headers: {
      ...baseHeaders,
      ...(origin ? { 'Referer': `${origin}/` } : {})
    },
    redirect: 'follow'
  });

  // Strategy 2: Google referer fallback if 403/503
  if (res.status === 403 || res.status === 503) {
    res = await fetch(url, {
      headers: {
        ...baseHeaders,
        'Referer': 'https://www.google.com/'
      },
      redirect: 'follow'
    });
  }

  // Strategy 3: Minimal clean User-Agent fallback
  if (res.status === 403 || res.status === 503) {
    res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
      },
      redirect: 'follow'
    });
  }

  return res;
}

export interface CrawlOptions {
  cookies?: string;
  useFirecrawl?: boolean;
  firecrawlKey?: string;
}

export async function crawlNovelIndex(
  rootUrl: string, 
  rawHtml?: string, 
  opts?: CrawlOptions | string
): Promise<{ title: string; chapters: ChapterLink[] }> {
  const options: CrawlOptions = typeof opts === 'string' ? { cookies: opts } : (opts || {});
  let normalizedUrl = (rootUrl || '').trim();
  if (normalizedUrl && !/^https?:\/\//i.test(normalizedUrl)) {
    normalizedUrl = `https://${normalizedUrl}`;
  }

  let baseUrl = '';
  try {
    if (normalizedUrl) baseUrl = new URL(normalizedUrl).origin;
  } catch {}

  const isWtrLab = normalizedUrl.includes('wtr-lab.com') || (rawHtml?.includes('wtr-lab.com'));
  
  let html = rawHtml;
  if (!html && normalizedUrl) {
    if (options.useFirecrawl && options.firecrawlKey) {
      const res = await fetch('https://api.firecrawl.dev/v1/scrape', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${options.firecrawlKey}`
        },
        body: JSON.stringify({ url: normalizedUrl, formats: ['rawHtml'], waitFor: 6000 })
      });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.success) {
        throw new Error(`Firecrawl crawl failed: ${body?.error || `HTTP ${res.status}`}`);
      }
      html = body.data?.rawHtml;
    } else {
      const res = await fetchWithHeaders(normalizedUrl, options.cookies);
      if (!res.ok) {
        if (res.status === 403 || res.status === 503) {
          throw new Error(`Target site blocked index fetch (HTTP ${res.status} Anti-bot). Please enable "Use Firecrawl", provide cookies in Settings, or use "Manual Paste HTML".`);
        }
        throw new Error(`Failed to fetch index: HTTP ${res.status}`);
      }
      html = await res.text();
    }
  }

  if (!html) throw new Error('No content found to crawl');
  const $ = cheerio.load(html);

  const novelTitle = $('h1').first().text().trim() || 'Unknown Novel';
  const chapters: ChapterLink[] = [];

  const cleanTitle = (rawTitle: string): string => {
    return rawTitle
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean)
      .join(' ')
      .replace(/\s*\d+\s*(days|hours|minutes|months|years|secs)\s*ago/gi, '')
      .replace(/^(Read\s+)+/i, '')
      .trim();
  };

  const extractPageChapters = (pageHtml: string) => {
    const _$ = cheerio.load(pageHtml);
    _$('a').each((_, el) => {
      const href = _$(el).attr('href');
      let title = _$(el).text().trim();
      if (!href) return;

      // Ignore recommendation links to other novels (e.g. /novel/kks2748.html)
      const isOtherNovelLink = href.includes('/novel/') && !/_\d+\.html/.test(href);
      if (isOtherNovelLink) return;

      title = cleanTitle(title);

      const isChapterLink = 
        href.includes('/chapter/') || 
        /_\d+\.html/.test(href) || 
        /\/book\/\d+\/\d+\.html/.test(href) ||
        /\/\d+\/\d+\.html/.test(href) ||
        (/\bchapter\b/i.test(title) && !href.includes('/list/')) ||
        (/第\s*\d+\s*[章节回卷]/.test(title)) ||
        (isWtrLab && (_$(el).hasClass('chapter-item') || _$(el).hasClass('toc-latest-row')));

      if (isChapterLink) {
        const fullUrl = href.startsWith('http') ? href : `${baseUrl}${href.startsWith('/') ? '' : '/'}${href}`;
        if (!chapters.find(c => c.url === fullUrl)) {
          chapters.push({ title: title || `Chapter ${chapters.length + 1}`, url: fullUrl });
        }
      }
    });
  };

  extractPageChapters(html);

  // Pagination detection across all standard formats (fy.php, page=, /page/, etc.)
  const pageLinks: string[] = [];
  $('a').each((_, el) => {
    const href = $(el).attr('href');
    if (!href) return;
    const isPagination = 
      href.includes('fy.php') ||
      href.includes('fy1.php') ||
      href.includes('page=') || 
      href.includes('/page/') ||
      href.includes('index_') ||
      href.includes('page_');

    const isChapterLink = /_\d+\.html/.test(href) || href.includes('/chapter/');
    if (isPagination && !isChapterLink) {
      const fullUrl = href.startsWith('http') ? href : `${baseUrl}${href.startsWith('/') ? '' : '/'}${href}`;
      if (!pageLinks.includes(fullUrl) && pageLinks.length < 30) {
        pageLinks.push(fullUrl);
      }
    }
  });

  for (const pageUrl of pageLinks) {
    try {
      const pRes = await fetchWithHeaders(pageUrl, options.cookies);
      if (pRes.ok) {
        const pHtml = await pRes.text();
        extractPageChapters(pHtml);
      }
    } catch (e) {
      console.error(`Failed to fetch page ${pageUrl}`, e);
    }
  }

  // Auto-resolve baseUrl if not provided from rootUrl
  if (!baseUrl && html) {
    const canonical = $('link[rel="canonical"]').attr('href') || $('meta[property="og:url"]').attr('content');
    if (canonical && canonical.startsWith('http')) {
      try { baseUrl = new URL(canonical).origin; } catch {}
    }
    if (!baseUrl) {
      $('a[href^="http"]').each((_, el) => {
        if (!baseUrl) {
          try { baseUrl = new URL($(el).attr('href')!).origin; } catch {}
        }
      });
    }
    if (!baseUrl && html.includes('fanmtl.com')) {
      baseUrl = 'https://www.fanmtl.com';
    }
  }

  // Auto-complete sequential chapter gaps for sites like FanMTL (/novel/<id>_<num>.html)
  let sequentialNovelId: string | null = null;
  let maxChapterNum = 0;
  for (const c of chapters) {
    const match = c.url.match(/\/novel\/(\d+)_(\d+)\.html/);
    if (match) {
      sequentialNovelId = match[1];
      const num = parseInt(match[2], 10);
      if (num > maxChapterNum) maxChapterNum = num;
    }
  }

  if (sequentialNovelId && maxChapterNum > chapters.length && maxChapterNum <= 5000 && baseUrl) {
    for (let i = 1; i <= maxChapterNum; i++) {
      const expectedUrl = `${baseUrl}/novel/${sequentialNovelId}_${i}.html`;
      if (!chapters.find(c => c.url === expectedUrl)) {
        chapters.push({ title: `Chapter ${i}`, url: expectedUrl });
      }
    }
  }

  // Sort chapters in natural reading order (Chapter 1 -> Chapter N)
  chapters.sort((a, b) => {
    const matchA = a.url.match(/_(\d+)\.html/) || a.url.match(/\/(\d+)\.html/) || a.title.match(/chapter\s*(\d+)/i) || a.title.match(/第\s*(\d+)\s*[章节回卷]/i);
    const matchB = b.url.match(/_(\d+)\.html/) || b.url.match(/\/(\d+)\.html/) || b.title.match(/chapter\s*(\d+)/i) || b.title.match(/第\s*(\d+)\s*[章节回卷]/i);
    if (matchA && matchB) {
      return parseInt(matchA[1], 10) - parseInt(matchB[1], 10);
    }
    return 0;
  });

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
    '#chaptercontent', '#content', '#htmlContent', '#txtContent', '.read-content', '.showtxt',
    'article', 'main', '.content', '.post-content', '.entry-content'
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
