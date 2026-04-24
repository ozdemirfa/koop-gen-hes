-- Migration: 20260423000008_add_kaynak_tipi_to_cari.sql
-- Description: Add kaynak_tipi and kaynak_id to cari_hareketler for better tracking.

BEGIN;

-- Add columns to cari_hareketler if they don't exist
ALTER TABLE public.cari_hareketler ADD COLUMN IF NOT EXISTS kaynak_tipi VARCHAR(50);
ALTER TABLE public.cari_hareketler ADD COLUMN IF NOT EXISTS kaynak_id UUID;

-- kaynak_tipi check constraint (optional but recommended)
-- islem_turu check'ini de güncelleyelim veya koruyalım.
-- Mevcut: islem_turu IN ('aidat_kayit', 'hakedis', 'gelen_odeme', 'giden_odeme')

COMMENT ON COLUMN public.cari_hareketler.kaynak_tipi IS 'Hareketi oluşturan modül (aidat, fatura, hakedis, teminat vb.)';
COMMENT ON COLUMN public.cari_hareketler.kaynak_id IS 'İlgili kaydın ID''si.';

COMMIT;
