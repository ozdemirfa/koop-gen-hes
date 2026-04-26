-- Migration: 20260424000015_robust_aidat_view_member_sync.sql
-- Description: Update aidat_detaylari view to join member from unit if missing on aidat record.

BEGIN;

-- 1. Redefine aidat_detaylari view with COALESCE for uye_id
DROP VIEW IF EXISTS public.aidat_detaylari CASCADE;

CREATE OR REPLACE VIEW public.aidat_detaylari AS
SELECT 
    a.id,
    a.proje_id,
    a.serefiye_id,
    COALESCE(a.uye_id, s.uye_id) as uye_id, -- Daireye atanmış üyeyi önceliklendir (veya aidattakini koru)
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
LEFT JOIN public.uyeler u ON u.id = COALESCE(a.uye_id, s.uye_id);

-- 2. Redefine the summary function as it was dropped by CASCADE
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
