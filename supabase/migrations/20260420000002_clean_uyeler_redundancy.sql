-- Migration: 20260420000002_clean_uyeler_redundancy.sql
-- Description: Remove redundant columns from uyeler table as they are available in serefiye_tablosu.

DO $$
BEGIN
    -- 1. Remove blok_id (available via serefiye_id -> serefiye_tablosu.blok_id)
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'uyeler' AND column_name = 'blok_id') THEN
        -- Remove dependent index first if it exists
        DROP INDEX IF EXISTS idx_uyeler_blok_daire;
        ALTER TABLE public.uyeler DROP COLUMN blok_id;
    END IF;

    -- 2. Remove daire_no (available via serefiye_id -> serefiye_tablosu.daire_no)
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'uyeler' AND column_name = 'daire_no') THEN
        ALTER TABLE public.uyeler DROP COLUMN daire_no;
    END IF;

    -- 3. Remove serefiye_orani (available via serefiye_id -> serefiye_tablosu.serefiye_orani)
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'uyeler' AND column_name = 'serefiye_orani') THEN
        ALTER TABLE public.uyeler DROP COLUMN serefiye_orani;
    END IF;

    -- 4. Ensure serefiye_id is NOT NULL for active members (optional safety, maybe later)
    -- ALTER TABLE public.uyeler ALTER COLUMN serefiye_id SET NOT NULL;

END $$;

-- Documentation
COMMENT ON COLUMN public.uyeler.serefiye_id IS 'Üyenin atandığı dairenin şerefiye tablosundaki ID''si. Blok, Daire No ve Şerefiye Oranı bu tablo üzerinden çekilir.';
