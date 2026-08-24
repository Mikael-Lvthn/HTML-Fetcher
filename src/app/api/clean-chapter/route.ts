import { NextRequest } from 'next/server';
import { cleanChapterHtml } from '@/lib/scraper';
import { fetchRenderedHtml } from '@/lib/contentFetcher';
import { createServerSupabaseClient } from '@/lib/supabase-server';

export async function POST(request: NextRequest) {
  try {
    const { url, rawHtml, useFirecrawl } = await request.json();
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    let scraperCookies = '';
    if (user) {
      const { data: settings } = await supabase
        .from('user_settings')
        .select('scraper_cookies')
        .eq('user_id', user.id)
        .maybeSingle();
      if (settings?.scraper_cookies) {
        scraperCookies = settings.scraper_cookies;
        console.log(`[Clean API] Using cookies: ${scraperCookies.substring(0, 20)}...`);
      } else {
        console.log('[Clean API] No scraper cookies found in settings');
      }
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

    let html = rawHtml;
    if (url && !html) {
      console.log(`[Clean API] Fetching URL: ${url} (engine: ${useFirecrawl ? 'firecrawl' : 'server-fetch'})`);
      html = await fetchRenderedHtml(url, {
        useFirecrawl: !!useFirecrawl,
        firecrawlKey,
        cookies: scraperCookies || undefined
      });
      console.log(`[Clean API] Fetched ${html.length} characters`);
    }

    if (!html) {
      return Response.json({ error: 'No content provided' }, { status: 400 });
    }

    const cleanedText = cleanChapterHtml(html);
    return Response.json({ cleanedText });
  } catch (error) {
    console.error('[Clean API Error]:', error);
    const message = error instanceof Error ? error.message : 'Failed to clean chapter';
    return Response.json({ error: message }, { status: 500 });
  }
}
