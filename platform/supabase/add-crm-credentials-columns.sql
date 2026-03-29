-- Fehlende Spalten in crm_credentials ergänzen (idempotent)
-- Ausführen im Supabase SQL Editor

ALTER TABLE public.crm_credentials
  ADD COLUMN IF NOT EXISTS last_validated_at timestamptz,
  ADD COLUMN IF NOT EXISTS preferred_model text DEFAULT 'claude-haiku-4-5-20251001';

-- Kommentar
COMMENT ON COLUMN public.crm_credentials.last_validated_at IS 'Zeitstempel der letzten Credentials-Prüfung';
COMMENT ON COLUMN public.crm_credentials.preferred_model    IS 'Bevorzugtes Claude-Modell für diesen User';
