-- Migration: 20260424000014_cleanup_summary_functions.sql
-- Description: Drop all overloaded versions of get_aidat_summary_v4 and define a single robust one.

BEGIN;

-- 1. Drop all known variations to resolve ambiguity
DROP FUNCTION IF EXISTS public.get_aidat_summary_v4(UUID, INTEGER, INTEGER, TEXT, UUID, BOOLEAN);
DROP FUNCTION IF EXISTS public.get_aidat_summary_v4(UUID, INTEGER, INTEGER, public.aidat_durumu, UUID, BOOLEAN);
DROP FUNCTION IF EXISTS public.get_aidat_summary_v4(UUID, INTEGER, INTEGER, VARCHAR, UUID, BOOLEAN);

-- 2. Define the final, robust version
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
    IF p_durum IS NOT NULL AND p_durum <> '' THEN
        BEGIN
            v_durum_enum := p_durum::public.aidat_durumu;
        EXCEPTION WHEN OTHERS THEN
            v_durum_enum := NULL;
        END;
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
    AND (p_durum IS NULL OR p_durum = '' OR durum = v_durum_enum)
    AND (p_blok_id IS NULL OR filter_blok_id = p_blok_id)
    AND (p_has_daire IS NULL OR (p_has_daire = TRUE AND uye_id IS NOT NULL) OR (p_has_daire = FALSE AND uye_id IS NULL));

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;
