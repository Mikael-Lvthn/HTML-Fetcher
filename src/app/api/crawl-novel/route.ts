import { NextRequest } from 'next/server';
import { crawlNovelIndex } from '@/lib/scraper';
import { createServerSupabaseClient } from '@/lib/supabase-server';

export async function POST(request: NextRequest) {
  try {
    const { url, rawHtml } = await request.json();
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    let scraperCookies = '';
    if (user) {
      const { data: settings } = await supabase
        .from('user_settings')
        .select('scraper_cookies')
        .eq('user_id', user.id)
        .maybeSingle();
      if (settings?.scraper_cookies) scraperCookies = settings.scraper_cookies;
    }
    
    if (!url && !rawHtml) {
      return Response.json({ error: 'Please provide either a novel URL or HTML content' }, { status: 400 });
    }

    const data = await crawlNovelIndex(url || '', rawHtml, scraperCookies);
    return Response.json(data);
  } catch (error: unknown) {
    console.error('[Crawl Novel API Error]:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return Response.json({ error: message }, { status: 500 });
  }
}
