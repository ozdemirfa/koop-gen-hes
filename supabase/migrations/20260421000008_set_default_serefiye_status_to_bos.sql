-- Migration: 20260421000008_set_default_serefiye_status_to_bos.sql
-- Description: Sets default value for durum column in serefiye_tablosu to 'bos' and updates existing nulls.

-- 1. Update existing NULL values to 'bos'
UPDATE public.serefiye_tablosu SET durum = 'bos' WHERE durum IS NULL;

-- 2. Set default value for the column
ALTER TABLE public.serefiye_tablosu ALTER COLUMN durum SET DEFAULT 'bos';

-- Documentation
COMMENT ON COLUMN public.serefiye_tablosu.durum IS 'Dairenin durumu: bos, dolu, rezerv. Varsayılan: bos';
