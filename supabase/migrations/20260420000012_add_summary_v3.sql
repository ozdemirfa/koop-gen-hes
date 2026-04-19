-- Migration: 20260420000012_add_summary_v3.sql
-- Description: Create v3 summary function using the filter_blok_id column.

CREATE OR REPLACE FUNCTION public.get_aidat_summary_v3(
  p_proje_id UUID DEFAULT NULL,
  p_yil INTEGER DEFAULT NULL,
  p_ay INTEGER DEFAULT NULL,
  p_durum aidat_durumu DEFAULT NULL,
  p_blok_id UUID DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'toplam_aidat', COALESCE(SUM(toplam_borc), 0),
    'toplam_tahsilat', COALESCE(SUM(dinamik_odenen_tutar), 0),
    'bekleyen', COALESCE(SUM(CASE WHEN durum = 'bekliyor' THEN hesaplanan_tutar ELSE 0 END), 0),
    'geciken', COALESCE(SUM(CASE WHEN durum = 'gecikti' THEN toplam_borc ELSE 0 END), 0),
    'toplam_gecikme_faizi', COALESCE(SUM(COALESCE(gecikme_faizi, 0)), 0)
  ) INTO result
  FROM public.aidat_detaylari
  WHERE (p_proje_id IS NULL OR proje_id = p_proje_id)
    AND (p_yil IS NULL OR yil = p_yil)
    AND (p_ay IS NULL OR ay = p_ay)
    AND (p_durum IS NULL OR durum = p_durum)
    AND (p_blok_id IS NULL OR filter_blok_id = p_blok_id);

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
