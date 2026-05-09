import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    // Return a dummy client or throw a more helpful error during runtime
    // but avoid crashing at the top level if possible.
    // However, createBrowserClient needs these values.
    // For build-time safety, we can return null or handle it in components.
    // But most components expect a client.
    return createBrowserClient(
      url || 'https://placeholder.supabase.co',
      key || 'placeholder'
    );
  }

  return createBrowserClient(url, key);
}
