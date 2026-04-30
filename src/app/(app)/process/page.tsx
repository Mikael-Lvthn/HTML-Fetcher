import { createServerSupabaseClient } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';
import ProcessClient from './ProcessClient';

export default async function ProcessPage({ searchParams }: { searchParams: Promise<{ project?: string }> }) {
  const { project: preselectedProject } = await searchParams;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/auth/login');

  const { data: projects } = await supabase.from('projects').select('*').eq('user_id', user.id).order('title');

  return (
    <ProcessClient
      projects={projects || []}
      preselectedProjectId={preselectedProject || undefined}
    />
  );
}
