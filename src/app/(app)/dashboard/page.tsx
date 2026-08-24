import { createServerSupabaseClient } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';
import DashboardClient from './DashboardClient';

export default async function DashboardPage() {
  const supabase = await createServerSupabaseClient();
  const authRes = await supabase.auth.getUser();
  const user = authRes?.data?.user;
  if (!user) redirect('/auth/login');

  // Fetch projects with chapter counts
  const { data: projects } = await supabase
    .from('projects')
    .select('*')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false });

  // Get chapter counts and word counts per project
  const projectsWithStats = await Promise.all(
    (projects || []).map(async (project) => {
      const { count } = await supabase
        .from('chapters')
        .select('*', { count: 'exact', head: true })
        .eq('project_id', project.id);

      const { data: wordData } = await supabase
        .from('chapters')
        .select('word_count')
        .eq('project_id', project.id);

      const totalWords = (wordData || []).reduce((sum, ch) => sum + (ch.word_count || 0), 0);

      return {
        ...project,
        chapter_count: count || 0,
        total_word_count: totalWords,
      };
    })
  );

  return <DashboardClient projects={projectsWithStats} />;
}
