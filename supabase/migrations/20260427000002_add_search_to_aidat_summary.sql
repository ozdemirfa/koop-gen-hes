-- Migration: 20260427000002_add_search_to_aidat_summary.sql
-- Description: Add search (member name) parameter to aidat summary RPC.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_aidat_summary_v4(
  p_proje_id UUID DEFAULT NULL,
  p_yil INTEGER DEFAULT NULL,
  p_ay INTEGER DEFAULT NULL,
  p_durum TEXT DEFAULT NULL,
  p_blok_id UUID DEFAULT NULL,
  p_has_daire BOOLEAN DEFAULT NULL,
  p_search TEXT DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
  result JSON;
  v_durum_enum public.aidat_durumu;
BEGIN
    IF p_durum IS NOT NULL AND p_durum <> '' THEN
        BEGIN
            v_durum_enum := p_durum::public.aidat_durumu;
        EXCEPTION WHEN OTHERS THEN
            v_durum_enum := NULL;
        END;
    END IF;

  SELECT json_build_object(
    'toplam_aidat', COALESCE(SUM(toplam_tahakkuk), 0),
    'toplam_tahsilat', COALESCE(SUM(toplam_odenen), 0),
    'bekleyen', COALESCE(SUM(CASE WHEN durum = 'bekliyor' THEN kalan_borc ELSE 0 END), 0),
    'geciken', COALESCE(SUM(CASE WHEN durum = 'gecikti' THEN kalan_borc ELSE 0 END), 0),
    'toplam_gecikme_faizi', COALESCE(SUM(toplam_faiz), 0)
  ) INTO result
  FROM public.aidat_detaylari
  WHERE (p_proje_id IS NULL OR proje_id = p_proje_id)
    AND (p_yil IS NULL OR yil = p_yil)
    AND (p_ay IS NULL OR ay = p_ay)
    AND (p_durum IS NULL OR p_durum = '' OR durum = v_durum_enum)
    AND (p_blok_id IS NULL OR filter_blok_id = p_blok_id)
    AND (p_has_daire IS NULL OR (p_has_daire = TRUE AND uye_id IS NOT NULL) OR (p_has_daire = FALSE AND uye_id IS NULL))
    AND (p_search IS NULL OR p_search = '' OR ad ILIKE '%' || p_search || '%' OR soyad ILIKE '%' || p_search || '%' OR uye_no ILIKE '%' || p_search || '%');

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;
