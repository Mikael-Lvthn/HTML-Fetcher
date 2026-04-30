import { NextRequest } from 'next/server';
import { cleanChapterHtml } from '@/lib/scraper';
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
      if (settings?.scraper_cookies) {
        scraperCookies = settings.scraper_cookies;
        console.log(`[Clean API] Using cookies: ${scraperCookies.substring(0, 20)}...`);
      } else {
        console.log('[Clean API] No scraper cookies found in settings');
      }
    }
    
    let html = rawHtml;
    if (url && !html) {
      console.log(`[Clean API] Fetching URL: ${url}`);
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Referer': 'https://wtr-lab.com/',
          'Origin': 'https://wtr-lab.com',
          'Cookie': scraperCookies
        }
      });
      if (!res.ok) throw new Error(`Failed to fetch chapter: ${res.status}`);
      html = await res.text();
      console.log(`[Clean API] Fetched ${html.length} characters`);
    }

    if (!html) {
      return Response.json({ error: 'No content provided' }, { status: 400 });
    }

    const cleanedText = cleanChapterHtml(html);
    return Response.json({ cleanedText });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
