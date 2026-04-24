-- Migration: 20260423000003_fix_hakedis_columns.sql
-- Description: Add hakedis_toplam column and ensure ara_toplam is used.

BEGIN;

-- Add hakedis_toplam (VAT inclusive)
ALTER TABLE public.hakedisler ADD COLUMN IF NOT EXISTS hakedis_toplam NUMERIC(14,2) DEFAULT 0;

-- Ensure kdv_tutar exists
ALTER TABLE public.hakedisler ADD COLUMN IF NOT EXISTS kdv_tutar NUMERIC(14,2) DEFAULT 0;

COMMIT;
