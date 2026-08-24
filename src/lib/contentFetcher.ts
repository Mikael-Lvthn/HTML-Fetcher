import * as cheerio from 'cheerio';
import TurndownService from 'turndown';
import { cleanChapterHtml } from '@/lib/scraper';

const FIRECRAWL_SCRAPE_URL = 'https://api.firecrawl.dev/v1/scrape';

export interface FetchOptions {
  useFirecrawl: boolean;
  firecrawlKey?: string;
  cookies?: string;
  signal?: AbortSignal;
}

export interface ReaderResult {
  markdown: string;
  html: string;
  text: string;
  metadata: {
    title: string;
    description: string;
    sourceUrl: string;
    links?: string[];
  };
}

async function serverFetch(url: string, cookies?: string, signal?: AbortSignal) {
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
    signal,
    headers: {
      ...baseHeaders,
      ...(origin ? { 'Referer': `${origin}/` } : {})
    },
    redirect: 'follow'
  });

  // Strategy 2: Google referer fallback if 403/503
  if (res.status === 403 || res.status === 503) {
    res = await fetch(url, {
      signal,
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
      signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
      },
      redirect: 'follow'
    });
  }

  return res;
}

async function firecrawlScrape(url: string, key: string, formats: string[], onlyMainContent = false, signal?: AbortSignal) {
  const res = await fetch(FIRECRAWL_SCRAPE_URL, {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key}`
    },
    body: JSON.stringify({ url, formats, waitFor: 6000, ...(onlyMainContent ? { onlyMainContent: true } : {}) })
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.success) {
    const detail = body?.error || `HTTP ${res.status}`;
    throw new Error(`Firecrawl scrape failed: ${detail}`);
  }
  return body.data;
}

function requireKey(key?: string): string {
  if (!key) throw new Error('Firecrawl is enabled but no API key is set in Settings');
  return key;
}

/**
 * Fetch the (rendered) page HTML as a string. Drop-in replacement for the
 * inline fetch() step: the caller runs the same cleaning pipeline regardless
 * of which engine produced the HTML.
 */
export async function fetchRenderedHtml(url: string, opts: FetchOptions): Promise<string> {
  if (opts.useFirecrawl) {
    const data = await firecrawlScrape(url, requireKey(opts.firecrawlKey), ['rawHtml'], false, opts.signal);
    if (!data?.rawHtml) throw new Error('Firecrawl returned no HTML for this URL');
    return data.rawHtml;
  }

  const res = await serverFetch(url, opts.cookies, opts.signal);
  if (!res.ok) {
    if (res.status === 403 || res.status === 503) {
      throw new Error(`Target site blocked automated fetch (HTTP ${res.status} Cloudflare / Anti-bot). Please enable "Use Firecrawl", provide cookies in Settings, or use Manual Paste.`);
    }
    throw new Error(`Failed to fetch chapter: HTTP ${res.status}`);
  }
  return res.text();
}

export async function fetchForReader(url: string, opts: FetchOptions): Promise<ReaderResult> {
  if (opts.useFirecrawl) {
    const data = await firecrawlScrape(url, requireKey(opts.firecrawlKey), ['markdown', 'html', 'links'], true, opts.signal);
    return {
      markdown: data?.markdown || '',
      html: data?.html || '',
      text: data?.markdown || '',
      metadata: {
        title: data?.metadata?.title || '',
        description: data?.metadata?.description || '',
        sourceUrl: data?.metadata?.sourceURL || url,
        links: Array.isArray(data?.links) ? data.links : undefined
      }
    };
  }

  const pageHtml = await fetchRenderedHtml(url, opts);
  const $ = cheerio.load(pageHtml);

  const title = $('title').first().text().trim() || $('h1').first().text().trim();
  const description = $('meta[name="description"]').attr('content')?.trim() || '';

  const REMOVE = [
    'script', 'style', 'nav', 'header', 'footer', 'aside', 'iframe', 'noscript',
    '.ads', '#ads', '.advertisement', '.sidebar', '.comments', '.social-share',
    '.chapter-nav', '.nav-container', '.breadcrumb', '.pagination', '.btn'
  ];
  REMOVE.forEach(s => $(s).remove());

  const SELECTORS = [
    'article', 'main', '.chapter-body', '.content', '#content', '.post-content', '.entry-content'
  ];
  let contentHtml = '';
  for (const s of SELECTORS) {
    const el = $(s).first();
    if (el.length && el.text().trim().length > 200) {
      contentHtml = $.html(el);
      break;
    }
  }
  if (!contentHtml) contentHtml = $('body').html() || pageHtml;

  const baseUrl = new URL(url).origin;
  const links: string[] = [];
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    if (!href || href.startsWith('#') || href.startsWith('javascript:')) return;
    const fullUrl = href.startsWith('http') ? href : `${baseUrl}${href.startsWith('/') ? '' : '/'}${href}`;
    if (!links.includes(fullUrl)) links.push(fullUrl);
  });

  const turndown = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });
  const markdown = turndown.turndown(contentHtml);

  return {
    markdown,
    html: contentHtml,
    text: cleanChapterHtml(pageHtml),
    metadata: { title, description, sourceUrl: url, links }
  };
}
