export interface Project {
  id: string;
  user_id: string;
  title: string;
  subtitle: string | null;
  color: string;
  created_at: string;
  updated_at: string;
  chapter_count?: number;
  total_word_count?: number;
}

export interface Chapter {
  id: string;
  user_id: string;
  project_id: string;
  chapter_url: string | null;
  raw_text: string | null;
  cleaned_text: string;
  word_count: number | null;
  detected_at: string;
  project?: Project;
}

export interface UserSettings {
  id: string;
  user_id: string;
  scraper_cookies: string | null;
}

// Single-row global config (app_settings, id = 1) — shared by all users
export interface AppSettings {
  firecrawl_api_key: string | null;
}

export interface ProcessingStep {
  id: string;
  label: string;
  emoji: string;
  status: 'pending' | 'active' | 'done' | 'error';
}
