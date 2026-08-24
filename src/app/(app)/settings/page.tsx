import { createServerSupabaseClient } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';
import SettingsClient from './SettingsClient';

export default async function SettingsPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/auth/login');

  const { data: settings } = await supabase
    .from('user_settings')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();

  const { data: appSettings } = await supabase
    .from('app_settings')
    .select('firecrawl_api_key')
    .eq('id', 1)
    .maybeSingle();

  return (
    <SettingsClient
      userEmail={user.email || ''}
      settings={settings || {}}
      appSettings={appSettings || { firecrawl_api_key: null }}
    />
  );
}
