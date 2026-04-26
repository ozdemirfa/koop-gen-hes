-- Migration: 20260424000011_fix_view_and_summary_faiz_logic.sql
-- Description: Fix aidat_detaylari view and summary functions to correctly respect manual interest toggle.

BEGIN;

-- 1. Redefine aidat_detaylari view correctly
DROP VIEW IF EXISTS public.aidat_detaylari CASCADE;

CREATE OR REPLACE VIEW public.aidat_detaylari AS
SELECT 
    a.id,
    a.proje_id,
    a.serefiye_id,
    a.uye_id,
    a.aidat_tanimi_id,
    a.durum,
    a.son_odeme_tarihi,
    a.gecikme_faizi,
    a.faiz_yansitildi,
    a.created_at,
    a.updated_at,
    at.yil,
    at.ay,
    at.tur as aidat_turu,
    at.katsayi_tutari as baz_tutar,
    s.serefiye_orani,
    s.daire_no,
    b.id as filter_blok_id,
    b.blok_adi,
    u.ad,
    u.soyad,
    u.uye_no,
    -- Dinamik Tutar Hesaplama (Ana Borç)
    (at.katsayi_tutari * COALESCE(s.serefiye_orani, 1.00)) as hesaplanan_tutar,
    -- Toplam Tutar (Sadece faiz yansıtıldıysa faizi ekle)
    (at.katsayi_tutari * COALESCE(s.serefiye_orani, 1.00) + 
     CASE WHEN a.faiz_yansitildi = TRUE THEN COALESCE(a.gecikme_faizi, 0) ELSE 0 END) as toplam_borc,
    -- Ödenen Tutar (Cari Hareketlerden Dinamik Çekilecek)
    COALESCE((
        SELECT SUM(borc) 
        FROM public.cari_hareketler 
        WHERE kaynak_tipi = 'aidat' AND kaynak_id = a.id AND islem_turu = 'gelen_odeme'
    ), 0) as dinamik_odenen_tutar,
    -- Gecikme Gün Sayısı
    CASE 
        WHEN a.durum != 'odendi' AND a.son_odeme_tarihi < CURRENT_DATE 
        THEN (CURRENT_DATE - a.son_odeme_tarihi)::INTEGER 
        ELSE 0 
    END as gecikme_gun_sayisi
FROM public.aidatlar a
JOIN public.aidat_tanimlari at ON a.aidat_tanimi_id = at.id
JOIN public.serefiye_tablosu s ON a.serefiye_id = s.id
JOIN public.bloklar b ON s.blok_id = b.id
LEFT JOIN public.uyeler u ON a.uye_id = u.id;

-- 2. Update summary function to respect the toggle (v4 for aidat list)
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
BEGIN
  SELECT json_build_object(
    'toplam_aidat', COALESCE(SUM(toplam_borc), 0),
    'toplam_tahsilat', COALESCE(SUM(dinamik_odenen_tutar), 0),
    'bekleyen', COALESCE(SUM(CASE WHEN durum = 'bekliyor' THEN hesaplanan_tutar ELSE 0 END), 0),
    'geciken', COALESCE(SUM(CASE WHEN durum = 'gecikti' THEN toplam_borc ELSE 0 END), 0),
    'toplam_gecikme_faizi', COALESCE(SUM(CASE WHEN faiz_yansitildi = TRUE THEN COALESCE(gecikme_faizi, 0) ELSE 0 END), 0)
  ) INTO result
  FROM public.aidat_detaylari
  WHERE (p_proje_id IS NULL OR proje_id = p_proje_id)
    AND (p_yil IS NULL OR yil = p_yil)
    AND (p_ay IS NULL OR ay = p_ay)
    AND (p_durum IS NULL OR durum = p_durum)
    AND (p_blok_id IS NULL OR filter_blok_id = p_blok_id)
    AND (p_has_daire IS NULL OR (p_has_daire = TRUE AND uye_id IS NOT NULL) OR (p_has_daire = FALSE AND uye_id IS NULL));

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;
