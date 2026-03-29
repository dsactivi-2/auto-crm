-- Migration: Anthropic API Key + Modell-Auswahl zu crm_credentials
-- Jeder User speichert seinen eigenen verschlüsselten Anthropic API Key und bevorzugtes Modell

ALTER TABLE public.crm_credentials
ADD COLUMN IF NOT EXISTS anthropic_api_key_encrypted text;

ALTER TABLE public.crm_credentials
ADD COLUMN IF NOT EXISTS preferred_model text NOT NULL DEFAULT 'claude-haiku-4-5-20251001';

COMMENT ON COLUMN public.crm_credentials.anthropic_api_key_encrypted
IS 'AES-256-GCM verschlüsselter Anthropic API Key des Users';

COMMENT ON COLUMN public.crm_credentials.preferred_model
IS 'Bevorzugtes Claude-Modell (sonnet/opus/haiku)';
