export interface Project {
  id: string;
  user_id: string;
  title: string;
  subtitle: string | null;
  fandoms: string[];
  keywords: string[];
  system_prompt: string;
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
  openrouter_api_key: string | null;
  preferred_model: string;
  scraper_cookies: string | null;
}

export interface PromptVersion {
  id: string;
  project_id: string;
  user_id: string;
  system_prompt: string;
  version_number: number;
  created_at: string;
}

export interface AIModel {
  name: string;        // e.g. "models/gemini-2.0-flash"
  displayName: string; // e.g. "Gemini 2.0 Flash"
}

export interface ProcessingStep {
  id: string;
  label: string;
  emoji: string;
  status: 'pending' | 'active' | 'done' | 'error';
}
