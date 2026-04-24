-- Migration: 20260421000011_add_birimler_and_pozlar.sql
-- Description: Add tables for Units (Birimler) and Poz Codes (Pozlar) for consistent work item management.

BEGIN;

-- 1. Birimler Tablosu
CREATE TABLE IF NOT EXISTS public.birimler (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ad          VARCHAR(50) NOT NULL UNIQUE,
    created_at  TIMESTAMPTZ DEFAULT now()
);

-- 2. Pozlar Tablosu
CREATE TABLE IF NOT EXISTS public.pozlar (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    poz_no      VARCHAR(50) NOT NULL UNIQUE,
    tanim       TEXT NOT NULL,
    birim_id    UUID REFERENCES public.birimler(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ DEFAULT now()
);

-- 3. RLS Policies
ALTER TABLE public.birimler ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pozlar ENABLE ROW LEVEL SECURITY;

CREATE POLICY "birimler_access" ON public.birimler
    FOR ALL TO authenticated
    USING (public.is_admin() OR public.is_staff());

CREATE POLICY "pozlar_access" ON public.pozlar
    FOR ALL TO authenticated
    USING (public.is_admin() OR public.is_staff());

-- 4. Seed Data
INSERT INTO public.birimler (ad) VALUES 
('Adet'), ('m2'), ('m3'), ('kg'), ('ton'), ('Metretül'), ('Saat'), ('Gün'), ('Lumpsum')
ON CONFLICT (ad) DO NOTHING;

-- 5. Documentation
COMMENT ON TABLE public.birimler IS 'Sistem genelinde kullanılacak birim türleri.';
COMMENT ON TABLE public.pozlar IS 'Ön tanımlı poz numaraları ve açıklamaları.';

COMMIT;
