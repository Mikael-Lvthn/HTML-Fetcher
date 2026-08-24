import { createServerSupabaseClient } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';
import ReaderClient from './ReaderClient';

export default async function ReaderPage() {
  const supabase = await createServerSupabaseClient();
  const authRes = await supabase.auth.getUser();
  const user = authRes?.data?.user;
  if (!user) redirect('/auth/login');

  return <ReaderClient />;
}
