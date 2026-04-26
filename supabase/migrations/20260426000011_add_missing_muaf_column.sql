-- Migration: 20260426000011_add_missing_muaf_column.sql
-- Description: Add missing gecikme_faizi_muaf column to aidatlar table.

BEGIN;

ALTER TABLE public.aidatlar ADD COLUMN IF NOT EXISTS gecikme_faizi_muaf BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN public.aidatlar.gecikme_faizi_muaf IS 'Bu aidat kaydı için gecikme faizi hesaplanıp hesaplanmayacağı (True: Muaf, False: Hesapla).';

COMMIT;
