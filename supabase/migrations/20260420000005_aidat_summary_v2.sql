-- Migration: 20260420000005_aidat_summary_v2.sql
-- Description: Create a more flexible aidat summary function that supports all filters.

CREATE OR REPLACE FUNCTION public.get_aidat_summary_v2(
  p_proje_id UUID DEFAULT NULL,
  p_yil INTEGER DEFAULT NULL,
  p_ay INTEGER DEFAULT NULL,
  p_durum aidat_durumu DEFAULT NULL,
  p_daire_no VARCHAR DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'toplam_aidat', COALESCE(SUM(a.tutar + COALESCE(a.gecikme_faizi, 0)), 0),
    'toplam_tahsilat', COALESCE(SUM(a.odenen_tutar), 0),
    'bekleyen', COALESCE(SUM(CASE WHEN a.durum = 'bekliyor' THEN a.tutar ELSE 0 END), 0),
    'geciken', COALESCE(SUM(CASE WHEN a.durum = 'gecikti' THEN a.tutar + COALESCE(a.gecikme_faizi, 0) ELSE 0 END), 0),
    'toplam_gecikme_faizi', COALESCE(SUM(COALESCE(a.gecikme_faizi, 0)), 0)
  ) INTO result
  FROM public.aidatlar a
  LEFT JOIN public.aidat_tanimlari at ON a.aidat_tanimi_id = at.id
  LEFT JOIN public.serefiye_tablosu s ON a.serefiye_id = s.id
  WHERE (p_proje_id IS NULL OR a.proje_id = p_proje_id)
    AND (p_yil IS NULL OR at.yil = p_yil)
    AND (p_ay IS NULL OR at.ay = p_ay)
    AND (p_durum IS NULL OR a.durum = p_durum)
    AND (p_daire_no IS NULL OR s.daire_no ILIKE '%' || p_daire_no || '%');

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Documentation
COMMENT ON FUNCTION public.get_aidat_summary_v2 IS 'Gelişmiş filtreleme seçenekleri ile aidat özeti döner (Yıl, Ay, Durum, Daire No).';
