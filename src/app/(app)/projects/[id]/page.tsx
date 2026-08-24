import { createServerSupabaseClient } from '@/lib/supabase-server';
import { redirect, notFound } from 'next/navigation';
import ProjectDetailClient from './ProjectDetailClient';

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const authRes = await supabase.auth.getUser();
  const user = authRes?.data?.user;
  if (!user) redirect('/auth/login');

  const { data: project } = await supabase.from('projects').select('*').eq('id', id).eq('user_id', user.id).single();
  if (!project) notFound();

  const { data: chapters } = await supabase.from('chapters').select('*').eq('project_id', id).order('detected_at', { ascending: false });

  return (
    <ProjectDetailClient
      project={project}
      chapters={chapters || []}
    />
  );
}
