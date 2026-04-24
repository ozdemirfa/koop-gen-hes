-- Migration: 20260421000004_fix_aidat_detaylari_view_sum.sql
-- Description: Update aidat_detaylari view to correctly sum payments from borc column for 'gelen_odeme' transactions.
-- Muhasebe Yönü: Tahsilat (gelen_odeme) -> borc (Decreases member receivable/Project's alacak)
-- Toplam ödenen tutar cari_hareketler tablosundaki 'borc' kolonunun toplamı olmalıdır.

BEGIN;

-- 1. Drop the view and its dependencies (CASCADE)
DROP VIEW IF EXISTS public.aidat_detaylari CASCADE;

-- 2. Recreate the view with corrected logic
CREATE VIEW public.aidat_detaylari AS
SELECT 
    a.id,
    a.proje_id,
    a.serefiye_id,
    a.uye_id,
    a.aidat_tanimi_id,
    a.durum,
    a.son_odeme_tarihi,
    a.gecikme_faizi,
    a.created_at,
    a.updated_at,
    at.yil,
    at.ay,
    at.tur as aidat_turu,
    at.katsayi_tutari as baz_tutar,
    s.serefiye_orani,
    s.daire_no,
    s.blok_id as filter_blok_id,
    b.blok_adi,
    (at.katsayi_tutari * COALESCE(s.serefiye_orani, 1.00)) as hesaplanan_tutar,
    (at.katsayi_tutari * COALESCE(s.serefiye_orani, 1.00) + COALESCE(a.gecikme_faizi, 0)) as toplam_borc,
    -- DÜZELTME: Muhasebe mantığına göre tahsilat tutarı 'borc' kolonundadır.
    COALESCE((
        SELECT SUM(borc) 
        FROM public.cari_hareketler 
        WHERE kaynak_tipi = 'aidat' AND kaynak_id = a.id AND islem_turu = 'gelen_odeme'
    ), 0) as dinamik_odenen_tutar
FROM public.aidatlar a
JOIN public.aidat_tanimlari at ON a.aidat_tanimi_id = at.id
LEFT JOIN public.serefiye_tablosu s ON a.serefiye_id = s.id
LEFT JOIN public.bloklar b ON s.blok_id = b.id;

COMMENT ON VIEW public.aidat_detaylari IS 'Aidatların güncel borç, faiz ve tahsilat bilgilerini içeren detaylı view.';

-- 3. Recreate the summary function (Dropped due to CASCADE)
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

COMMIT;
