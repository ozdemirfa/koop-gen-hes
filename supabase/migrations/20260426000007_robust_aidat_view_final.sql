-- Migration: 20260426000005_robust_aidat_view_final.sql
-- Description: Make aidat_detaylari view robust by using calculated expectations for accruals.

BEGIN;

DROP VIEW IF EXISTS public.aidat_detaylari CASCADE;

CREATE OR REPLACE VIEW public.aidat_detaylari AS
WITH aidat_cari_payments AS (
    SELECT 
        kaynak_id as aidat_id,
        SUM(borc) as actual_paid,       -- Tahsilat (Project Perspective: BORC)
        SUM(alacak) as actual_accrued   -- Manual Accruals if any (Project Perspective: ALACAK)
    FROM public.cari_hareketler
    WHERE kaynak_tipi = 'aidat'
    GROUP BY kaynak_id
)
SELECT 
    a.id,
    a.proje_id,
    a.serefiye_id,
    COALESCE(a.uye_id, s.uye_id) as uye_id,
    a.aidat_tanimi_id,
    a.durum,
    a.son_odeme_tarihi,
    a.faiz_yansitildi,
    a.created_at,
    a.updated_at,
    at.yil,
    at.ay,
    at.tur as aidat_turu,
    s.daire_no,
    b.id as filter_blok_id,
    b.blok_adi,
    u.ad,
    u.soyad,
    u.uye_no,
    
    -- 1. Tahakkuk (Accrual): expected = Base * Ratio + Interest
    (at.katsayi_tutari * COALESCE(s.serefiye_orani, 1.00)) as baz_tutar,
    (at.katsayi_tutari * COALESCE(s.serefiye_orani, 1.00)) as hesaplanan_tutar, -- Legacy alias
    
    -- Robust Tahakkuk: movements or calculated expectation
    GREATEST(
        COALESCE(cp.actual_accrued, 0), 
        (at.katsayi_tutari * COALESCE(s.serefiye_orani, 1.00) + COALESCE(a.gecikme_faizi, 0))
    ) as toplam_tahakkuk,
    
    GREATEST(
        COALESCE(cp.actual_accrued, 0), 
        (at.katsayi_tutari * COALESCE(s.serefiye_orani, 1.00) + COALESCE(a.gecikme_faizi, 0))
    ) as toplam_borc, -- Legacy alias
    
    -- 2. Ödenen (Paid): From movements
    COALESCE(cp.actual_paid, 0) as toplam_odenen,
    COALESCE(cp.actual_paid, 0) as dinamik_odenen_tutar, -- Legacy alias
    
    -- 3. Faiz (Interest)
    COALESCE(a.gecikme_faizi, 0) as toplam_faiz,
    COALESCE(a.gecikme_faizi, 0) as gecikme_faizi, -- Legacy alias
    
    -- 4. Kalan (Balance)
    (
        GREATEST(
            COALESCE(cp.actual_accrued, 0), 
            (at.katsayi_tutari * COALESCE(s.serefiye_orani, 1.00) + COALESCE(a.gecikme_faizi, 0))
        ) - COALESCE(cp.actual_paid, 0)
    ) as kalan_borc,
    
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
LEFT JOIN public.uyeler u ON u.id = COALESCE(a.uye_id, s.uye_id)
LEFT JOIN aidat_cari_payments cp ON cp.aidat_id = a.id;

-- Recreate summary function
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
    AND (p_has_daire IS NULL OR (p_has_daire = TRUE AND uye_id IS NOT NULL) OR (p_has_daire = FALSE AND uye_id IS NULL));

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;
