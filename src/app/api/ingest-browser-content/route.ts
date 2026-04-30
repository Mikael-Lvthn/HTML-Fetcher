import { NextRequest } from 'next/server';
import { cleanChapterHtml } from '@/lib/scraper';

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

export async function POST(request: NextRequest) {
  try {
    const { projectId, url, html, title } = await request.json();
    console.log(`[Ingest API] Receiving chapter for project: ${projectId} - ${title}`);
    
    // DEBUG: Save a sample of the raw HTML to see what's happening
    try {
      const debugDir = path.join(process.cwd(), 'scratch');
      if (!fs.existsSync(debugDir)) fs.mkdirSync(debugDir);
      fs.writeFileSync(path.join(debugDir, 'debug_last_beamed.html'), html);
      console.log(`[Ingest API] Debug HTML saved. Size: ${html.length} chars`);
    } catch (e) {
      console.error('[Ingest API] Failed to save debug file', e);
    }
    
    // Use Service Role key to bypass RLS since browser fetch won't have a session
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    
    // Get the user_id from the project itself
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('user_id')
      .eq('id', projectId)
      .single();

    if (projectError || !project) {
      console.error('[Ingest API] Project error:', projectError);
      return new Response(JSON.stringify({ error: 'Project not found' }), { 
        status: 404,
        headers: { 'Access-Control-Allow-Origin': '*' }
      });
    }

    const cleanedText = cleanChapterHtml(html);
    const wordCount = cleanedText.split(/\s+/).filter(Boolean).length;

    // Check if chapter already exists for this URL
    const { data: existing } = await supabase
      .from('chapters')
      .select('id')
      .eq('project_id', projectId)
      .eq('chapter_url', url)
      .single();

    let result;
    if (existing) {
      result = await supabase
        .from('chapters')
        .update({
          cleaned_text: cleanedText,
          word_count: wordCount,
          detected_at: new Date().toISOString()
        })
        .eq('id', existing.id);
    } else {
      result = await supabase
        .from('chapters')
        .insert({
          project_id: projectId,
          user_id: project.user_id,
          chapter_url: url,
          cleaned_text: cleanedText,
          word_count: wordCount,
          detected_at: new Date().toISOString()
        });
    }

    if (result.error) {
      console.error('[Ingest API] DB Error:', result.error);
      throw result.error;
    }

    return new Response(JSON.stringify({ success: true, title }), {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      }
    });
  } catch (error: any) {
    console.error('[Ingest API] Crash:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      }
    });
  }
}
