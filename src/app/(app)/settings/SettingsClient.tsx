'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import Header from '@/components/Header';
import { UserSettings, AppSettings } from '@/types';
import toast from 'react-hot-toast';
import { GlobeIcon, FlameIcon, AlertIcon } from '@/components/icons';

interface Props {
  userEmail: string;
  settings: UserSettings;
  appSettings: AppSettings;
}

export default function SettingsClient({ userEmail, settings, appSettings }: Props) {
  const router = useRouter();
  const supabase = createClient();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [cookies, setCookies] = useState(settings?.scraper_cookies || '');
  const [firecrawlKey, setFirecrawlKey] = useState(appSettings?.firecrawl_api_key || '');
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingKey, setIsSavingKey] = useState(false);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast.success('Logged out successfully');
    router.push('/auth/login');
  };

  const handleDeleteAccount = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Delete all user data
    await supabase.from('user_settings').delete().eq('user_id', user.id);
    await supabase.from('chapters').delete().eq('user_id', user.id);
    await supabase.from('projects').delete().eq('user_id', user.id);

    await supabase.auth.signOut();
    toast.success('Account and data deleted.');
    router.push('/auth/login');
  };

  const handleSaveSettings = async () => {
    setIsSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase
      .from('user_settings')
      .update({ scraper_cookies: cookies })
      .eq('user_id', user.id);

    if (error) {
      toast.error('Failed to save settings');
    } else {
      toast.success('Settings saved!');
      router.refresh();
    }
    setIsSaving(false);
  };

  const handleSaveFirecrawlKey = async () => {
    setIsSavingKey(true);
    const { error } = await supabase
      .from('app_settings')
      .update({ firecrawl_api_key: firecrawlKey || null })
      .eq('id', 1);

    if (error) {
      toast.error('Failed to save Firecrawl key');
    } else {
      toast.success('Firecrawl key saved!');
      router.refresh();
    }
    setIsSavingKey(false);
  };

  return (
    <div>
      <Header title="Settings" subtitle="Manage your account" />

      <div className="space-y-6 max-w-3xl">
        {/* Account Info */}
        <section className="card flex justify-between items-center">
          <div>
            <p className="text-sm font-medium text-text-primary">{userEmail}</p>
            <p className="text-xs text-text-muted">Currently signed in</p>
          </div>
          <button onClick={handleLogout} className="btn-secondary text-sm">
            Sign Out
          </button>
        </section>

        {/* Scraper Settings */}
        <section className="card">
          <h2 className="text-base font-semibold text-text-primary mb-3"><span className="inline-flex items-center gap-2"><GlobeIcon className="w-5 h-5 text-accent" /> Scraper Settings</span></h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1.5">
                Session Cookies
              </label>
              <textarea 
                value={cookies}
                onChange={(e) => setCookies(e.target.value)}
                className="input-field h-32 resize-none font-mono text-xs" 
                placeholder="Paste your cookies here (e.g. key=value; key2=value2)" 
              />
              <p className="text-[10px] text-text-muted mt-2">
                Use these to bypass login walls. Open your browser&apos;s DevTools &rarr; Application &rarr; Cookies, and copy the values (usually just the session cookies for the domain).
              </p>
            </div>
            <button 
              onClick={handleSaveSettings}
              disabled={isSaving}
              className="btn-primary w-full justify-center"
            >
              {isSaving ? 'Saving...' : 'Save Scraper Settings'}
            </button>
          </div>
        </section>

        {/* Firecrawl Engine */}
        <section className="card">
          <h2 className="text-base font-semibold text-text-primary mb-3"><span className="inline-flex items-center gap-2"><FlameIcon className="w-5 h-5 text-warning" /> Firecrawl Engine</span></h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1.5">
                API Key
              </label>
              <input
                type="password"
                value={firecrawlKey}
                onChange={(e) => setFirecrawlKey(e.target.value)}
                className="input-field font-mono text-xs"
                placeholder="fc-..."
              />
              <p className="text-[10px] text-text-muted mt-2">
                Shared key used when the &quot;Use Firecrawl&quot; toggle is on (Novel Scraper and Reader). Firecrawl renders JavaScript and bypasses anti-bot protection, but each scrape uses credits. This key is global — it applies to every user of this app.
              </p>
            </div>
            <button
              onClick={handleSaveFirecrawlKey}
              disabled={isSavingKey}
              className="btn-primary w-full justify-center"
            >
              {isSavingKey ? 'Saving...' : 'Save Firecrawl Key'}
            </button>
          </div>
        </section>

        {/* Danger Zone */}
        <section className="card border-error/20">
          <h2 className="text-base font-semibold text-error mb-2"><span className="inline-flex items-center gap-2"><AlertIcon className="w-5 h-5" /> Danger Zone</span></h2>
          <p className="text-xs text-text-muted mb-4">
            Deleting your account will permanently remove all your novels and saved chapters.
          </p>
          <button 
            onClick={() => setShowDeleteConfirm(true)} 
            className="btn-danger text-sm"
          >
            Delete Account & All Data
          </button>
        </section>
      </div>

      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="card max-w-md w-full space-y-4">
            <h3 className="text-lg font-bold text-text-primary">Delete Account?</h3>
            <p className="text-sm text-text-secondary">
              This action is permanent and cannot be undone. All your novel projects and chapter history will be wiped.
            </p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowDeleteConfirm(false)} className="btn-secondary">
                Cancel
              </button>
              <button onClick={handleDeleteAccount} className="btn-danger">
                Delete Everything
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
