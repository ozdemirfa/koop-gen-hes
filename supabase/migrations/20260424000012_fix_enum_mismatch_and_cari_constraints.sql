-- Migration: 20260424000012_fix_enum_mismatch_and_cari_constraints.sql
-- Description: Fix aidat_durumu enum mismatch in summary RPC and allow NULL odeme_turu in cari_hareketler.

BEGIN;

-- 1. Fix get_aidat_summary_v4 (Cast p_durum to aidat_durumu)
CREATE OR REPLACE FUNCTION public.get_aidat_summary_v4(
  p_proje_id UUID DEFAULT NULL,
  p_yil INTEGER DEFAULT NULL,
  p_ay INTEGER DEFAULT NULL,
  p_durum TEXT DEFAULT NULL,
  p_blok_id UUID DEFAULT NULL,
  p_has_daire BOOLEAN DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
  result JSON;
  v_durum_enum public.aidat_durumu;
BEGIN
    -- Cast text to enum safely
    IF p_durum IS NOT NULL THEN
        v_durum_enum := p_durum::public.aidat_durumu;
    END IF;

  SELECT json_build_object(
    'toplam_aidat', COALESCE(SUM(toplam_borc), 0),
    'toplam_tahsilat', COALESCE(SUM(dinamik_odenen_tutar), 0),
    'bekleyen', COALESCE(SUM(CASE WHEN durum = 'bekliyor'::public.aidat_durumu THEN hesaplanan_tutar ELSE 0 END), 0),
    'geciken', COALESCE(SUM(CASE WHEN durum = 'gecikti'::public.aidat_durumu THEN toplam_borc ELSE 0 END), 0),
    'toplam_gecikme_faizi', COALESCE(SUM(CASE WHEN faiz_yansitildi = TRUE THEN COALESCE(gecikme_faizi, 0) ELSE 0 END), 0)
  ) INTO result
  FROM public.aidat_detaylari
  WHERE (p_proje_id IS NULL OR proje_id = p_proje_id)
    AND (p_yil IS NULL OR yil = p_yil)
    AND (p_ay IS NULL OR ay = p_ay)
    AND (p_durum IS NULL OR durum = v_durum_enum)
    AND (p_blok_id IS NULL OR filter_blok_id = p_blok_id)
    AND (p_has_daire IS NULL OR (p_has_daire = TRUE AND uye_id IS NOT NULL) OR (p_has_daire = FALSE AND uye_id IS NULL));

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Allow NULL odeme_turu in cari_hareketler and fix existing constraints
-- First, drop the existing check constraint if it exists
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cari_hareketler_odeme_turu_check') THEN
        ALTER TABLE public.cari_hareketler DROP CONSTRAINT cari_hareketler_odeme_turu_check;
    END IF;
END $$;

-- Re-add the constraint allowing NULL
ALTER TABLE public.cari_hareketler ADD CONSTRAINT cari_hareketler_odeme_turu_check 
CHECK (odeme_turu IS NULL OR odeme_turu IN ('nakit', 'banka', 'kredi_karti', 'cek'));

-- 3. Clear odeme_turu for existing aidat/interest accruals
UPDATE public.cari_hareketler 
SET odeme_turu = NULL 
WHERE islem_turu = 'aidat_kayit' OR kaynak_tipi IN ('aidat', 'gecikme_faizi');

COMMIT;
