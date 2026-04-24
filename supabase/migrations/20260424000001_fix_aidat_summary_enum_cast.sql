-- Migration: 20260424000001_fix_aidat_summary_enum_cast.sql
-- Description: Fix type mismatch in get_aidat_summary_v4 by casting VARCHAR parameter to aidat_durumu ENUM.

BEGIN;

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
    AND (p_blok_id IS NULL OR filter_blok_id = p_blok_id) -- Corrected from blok_id to filter_blok_id based on view definition
    AND (p_has_daire IS NULL OR (p_has_daire = TRUE AND uye_id IS NOT NULL) OR (p_has_daire = FALSE AND uye_id IS NULL));

    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;
