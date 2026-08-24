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
        .single();
      if (settings?.scraper_cookies) scraperCookies = settings.scraper_cookies;
    }
    
    // Pass cookies to crawlNovelIndex if needed
    // For now, scraper.ts uses its own fetch, let's update it to accept cookies
    const data = await crawlNovelIndex(url || '', rawHtml, scraperCookies);
    return Response.json(data);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return Response.json({ error: message }, { status: 500 });
  }
}
