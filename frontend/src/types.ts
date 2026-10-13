// Mirrors backend/app/schemas.py — keep in sync when the API changes.

export interface UserOut {
  id: string;
  email: string;
  name: string | null;
  created_at: string;
  is_admin: boolean;
  preferred_language: string;
  theme: 'system' | 'light' | 'dark';
}

export interface UserProfileUpdate {
  name?: string | null;
  preferred_language?: string;
  theme?: 'system' | 'light' | 'dark';
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
}

export interface SegmentOut {
  start: number;
  end: number;
  text: string;
}

export interface SpeakerSegmentOut {
  start: number;
  end: number;
  speaker: string;
}

export type TranscriptStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
export type TranscriptSource = 'upload' | 'live';

export interface TranscriptOut {
  id: string;
  original_name: string;
  source: TranscriptSource;
  status: TranscriptStatus;
  error_message: string | null;
  language: string | null;
  duration_seconds: number | null;
  text: string;
  translated_text: string | null;
  translated_language: string | null;
  is_favorite: boolean;
  folder: string | null;
  tags: string[];
  created_at: string;
  updated_at: string;
}

export interface TranscriptDetail extends TranscriptOut {
  segments: SegmentOut[];
  speakers: SpeakerSegmentOut[];
}

export interface TranscriptMetaUpdate {
  original_name?: string;
  is_favorite?: boolean;
  folder?: string;
  tags?: string[];
}

export interface MeetingNotesOut {
  summary: string;
  decisions: string[];
  action_items: string[];
  key_points: string[];
}

export interface AskResponse {
  answer: string;
}

export interface TextResult {
  result: string;
}

export interface SpeakerAnalyticsOut {
  speaker: string;
  speaking_seconds: number;
  turns: number;
}

export interface AdminUserOut {
  id: string;
  email: string;
  name: string | null;
  is_admin: boolean;
  created_at: string;
  transcript_count: number;
  total_minutes: number;
}

export interface AdminStatsOut {
  total_users: number;
  total_transcripts: number;
  total_minutes_processed: number;
  jobs_pending: number;
  jobs_processing: number;
  jobs_failed: number;
  jobs_completed: number;
}

export interface HealthOut {
  status: string;
  app: string;
  ai_enabled: boolean;
  google_signin_configured: boolean;
}

export interface StreamMessage {
  type: 'partial' | 'final' | 'error';
  text?: string;
  tentative?: string;
  message?: string;
}

export interface HistoryFilters {
  search: string;
  language: string;
  source: string;
  folder: string;
  favorite: string;
  dateFrom: string;
  dateTo: string;
  sortBy: string;
  sortDir: 'asc' | 'desc';
}
