-- Performance-Indexes für häufig abgefragte Spalten
-- Ausführen im Supabase SQL Editor

-- Activities: user_id + created_at (Dashboard-Abfragen)
CREATE INDEX IF NOT EXISTS idx_activities_user_id ON public.activities(user_id);
CREATE INDEX IF NOT EXISTS idx_activities_created_at ON public.activities(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activities_user_created ON public.activities(user_id, created_at DESC);

-- Chat Messages: user_id + created_at (Chat-History laden)
CREATE INDEX IF NOT EXISTS idx_chat_messages_user_id ON public.chat_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_user_created ON public.chat_messages(user_id, created_at DESC);

-- System Logs: level + created_at (Admin Log-Viewer)
CREATE INDEX IF NOT EXISTS idx_system_logs_level ON public.system_logs(level);
CREATE INDEX IF NOT EXISTS idx_system_logs_created_at ON public.system_logs(created_at DESC);

-- CRM Credentials: user_id (Unique-Lookup)
CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_credentials_user_id ON public.crm_credentials(user_id);
