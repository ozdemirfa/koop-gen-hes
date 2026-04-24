-- Migration: 20260423000004_update_irsaliye_structure.sql
-- Description: Update irsaliyeler to link with hakedis and remove unnecessary financial columns from items.

BEGIN;

-- 1. Add hakedis_id to irsaliyeler
ALTER TABLE public.irsaliyeler ADD COLUMN IF NOT EXISTS hakedis_id UUID REFERENCES public.hakedisler(id) ON DELETE SET NULL;

-- 2. Remove financial columns from irsaliye_kalemleri (toplam_tutar first as it depends on birim_fiyat)
ALTER TABLE public.irsaliye_kalemleri DROP COLUMN IF EXISTS toplam_tutar;
ALTER TABLE public.irsaliye_kalemleri DROP COLUMN IF EXISTS birim_fiyat;

COMMIT;
