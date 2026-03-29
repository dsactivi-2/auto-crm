-- Licenses Tabelle für License-Management
-- Ausführen im Supabase SQL Editor

CREATE TABLE IF NOT EXISTS public.licenses (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id text NOT NULL,
  customer_name text NOT NULL,
  plan text NOT NULL CHECK (plan IN ('starter', 'business', 'enterprise')),
  max_users integer NOT NULL DEFAULT 5,
  features text[] NOT NULL DEFAULT ARRAY['chat','automation','admin'],
  license_key text NOT NULL,
  issued_at date NOT NULL DEFAULT CURRENT_DATE,
  expires_at date NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- RLS aktivieren
ALTER TABLE public.licenses ENABLE ROW LEVEL SECURITY;

-- Nur Admins dürfen Lizenzen verwalten
CREATE POLICY "Admins können Lizenzen lesen" ON public.licenses
  FOR SELECT USING (public.is_admin());

CREATE POLICY "Admins können Lizenzen erstellen" ON public.licenses
  FOR INSERT WITH CHECK (public.is_admin());

CREATE POLICY "Admins können Lizenzen aktualisieren" ON public.licenses
  FOR UPDATE USING (public.is_admin());

-- Index
CREATE INDEX IF NOT EXISTS idx_licenses_customer_id ON public.licenses(customer_id);
CREATE INDEX IF NOT EXISTS idx_licenses_is_active ON public.licenses(is_active);
