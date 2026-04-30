import { NextRequest, NextResponse } from 'next/server';
import { extractChapterText } from '@/lib/textExtractor';

export async function POST(request: NextRequest) {
  try {
    const { url } = await request.json();

    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    // Validate URL
    try {
      new URL(url);
    } catch {
      return NextResponse.json({ error: 'Invalid URL format' }, { status: 400 });
    }

    // Fetch the page server-side
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    let response: Response;
    try {
      response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
        },
      });
    } catch (err: unknown) {
      clearTimeout(timeoutId);
      const message = err instanceof Error ? err.message : 'Unknown error';
      if (message.includes('abort')) {
        return NextResponse.json(
          {
            error:
              'Request timed out. The site may be blocking automated requests. Try using Manual Paste instead.',
          },
          { status: 408 }
        );
      }
      return NextResponse.json(
        {
          error: `Failed to fetch URL: ${message}. Try using Manual Paste instead.`,
        },
        { status: 502 }
      );
    }
    clearTimeout(timeoutId);

    if (!response.ok) {
      return NextResponse.json(
        {
          error: `Site returned status ${response.status}. The page may require authentication or be blocking scraping. Try using Manual Paste instead.`,
        },
        { status: response.status }
      );
    }

    const html = await response.text();

    if (html.length < 500) {
      return NextResponse.json(
        {
          error:
            'The fetched page is too short — it may be a Cloudflare challenge or login page. Try using Manual Paste instead.',
        },
        { status: 422 }
      );
    }

    const { text, title } = extractChapterText(html);

    if (!text || text.length < 100) {
      return NextResponse.json(
        {
          error:
            'Could not extract meaningful chapter content from the page. Try using Manual Paste instead.',
        },
        { status: 422 }
      );
    }

    return NextResponse.json({ text, title });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'An unexpected error occurred';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
