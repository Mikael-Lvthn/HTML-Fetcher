import { NextRequest } from 'next/server';
import { fetchForReader } from '@/lib/contentFetcher';
import { createServerSupabaseClient } from '@/lib/supabase-server';

const FORMATS = ['markdown', 'html', 'json'] as const;
type ReadFormat = typeof FORMATS[number];

const TIMEOUT_MS = 30_000;

export async function POST(request: NextRequest) {
  try {
    const { url, format, useFirecrawl } = await request.json();

    if (!url || typeof url !== 'string') {
      return Response.json({ error: 'A URL is required' }, { status: 400 });
    }
    try {
      const parsed = new URL(url);
      if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error();
    } catch {
      return Response.json({ error: 'Invalid URL — must start with http:// or https://' }, { status: 400 });
    }
    if (!FORMATS.includes(format)) {
      return Response.json({ error: `Format must be one of: ${FORMATS.join(', ')}` }, { status: 400 });
    }

    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return Response.json({ error: 'Not authenticated' }, { status: 401 });
    }

    let firecrawlKey: string | undefined;
    if (useFirecrawl) {
      const { data: appSettings } = await supabase
        .from('app_settings')
        .select('firecrawl_api_key')
        .eq('id', 1)
        .maybeSingle();
      firecrawlKey = appSettings?.firecrawl_api_key || undefined;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let result;
    try {
      result = await fetchForReader(url, {
        useFirecrawl: !!useFirecrawl,
        firecrawlKey,
        signal: controller.signal
      });
    } catch (err) {
      if (controller.signal.aborted) {
        return Response.json({ error: 'The page took too long to load (30s timeout). Try again or enable Firecrawl.' }, { status: 504 });
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }

    const fmt = format as ReadFormat;
    if (fmt === 'markdown') {
      return Response.json({ format: fmt, content: result.markdown });
    }
    if (fmt === 'html') {
      return Response.json({ format: fmt, content: result.html });
    }
    return Response.json({
      format: fmt,
      data: {
        title: result.metadata.title,
        description: result.metadata.description,
        url: result.metadata.sourceUrl,
        text: result.text,
        links: result.metadata.links || []
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to read the page';
    return Response.json({ error: message }, { status: 500 });
  }
}
