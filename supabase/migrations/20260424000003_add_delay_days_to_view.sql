-- Migration: 20260424000003_add_delay_days_to_view.sql
-- Description: Add gecikme_gun_sayisi to aidat_detaylari view.

BEGIN;

DROP VIEW IF EXISTS public.aidat_detaylari CASCADE;

CREATE VIEW public.aidat_detaylari AS
SELECT 
    a.id,
    a.proje_id,
    a.serefiye_id,
    a.uye_id,
    a.aidat_tanimi_id,
    a.durum,
    a.son_odeme_tarihi,
    CASE 
        WHEN a.durum IN ('bekliyor', 'gecikti') AND a.son_odeme_tarihi < CURRENT_DATE 
        THEN CURRENT_DATE - a.son_odeme_tarihi 
        ELSE 0 
    END as gecikme_gun_sayisi,
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
    COALESCE((
        SELECT SUM(borc) 
        FROM public.cari_hareketler 
        WHERE kaynak_tipi = 'aidat' AND kaynak_id = a.id AND islem_turu = 'gelen_odeme'
    ), 0) as dinamik_odenen_tutar
FROM public.aidatlar a
JOIN public.aidat_tanimlari at ON a.aidat_tanimi_id = at.id
LEFT JOIN public.serefiye_tablosu s ON a.serefiye_id = s.id
LEFT JOIN public.bloklar b ON s.blok_id = b.id;

-- Recreate summary function (dropped by CASCADE)
CREATE OR REPLACE FUNCTION public.get_aidat_summary_v4(
    p_proje_id UUID,
    p_yil INTEGER DEFAULT NULL,
    p_ay INTEGER DEFAULT NULL,
    p_durum VARCHAR DEFAULT NULL,
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
        'bekleyen', COALESCE(SUM(CASE WHEN durum = 'bekliyor'::aidat_durumu THEN toplam_borc - dinamik_odenen_tutar ELSE 0 END), 0),
        'geciken', COALESCE(SUM(CASE WHEN durum = 'gecikti'::aidat_durumu THEN toplam_borc - dinamik_odenen_tutar ELSE 0 END), 0),
        'toplam_gecikme_faizi', COALESCE(SUM(gecikme_faizi), 0)
    ) INTO result
    FROM public.aidat_detaylari
    WHERE proje_id = p_proje_id
    AND (p_yil IS NULL OR yil = p_yil)
    AND (p_ay IS NULL OR ay = p_ay)
    AND (p_durum IS NULL OR durum = p_durum::aidat_durumu)
    AND (p_blok_id IS NULL OR filter_blok_id = p_blok_id)
    AND (p_has_daire IS NULL OR (p_has_daire = TRUE AND uye_id IS NOT NULL) OR (p_has_daire = FALSE AND uye_id IS NULL));

    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;
