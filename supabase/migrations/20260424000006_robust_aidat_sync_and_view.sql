-- Migration: 20260424000006_robust_aidat_sync_and_view.sql
-- Description: Improve aidat sync on unit assignment and fix member info in view.

BEGIN;

-- 1. Update the view to include member info
DROP VIEW IF EXISTS public.aidat_detaylari CASCADE;

CREATE VIEW public.aidat_detaylari AS
SELECT 
    a.id,
    a.proje_id,
    a.serefiye_id,
    a.uye_id,
    u.ad,
    u.soyad,
    u.uye_no,
    a.aidat_tanimi_id,
    a.durum::TEXT as durum,
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
LEFT JOIN public.uyeler u ON a.uye_id = u.id
LEFT JOIN public.serefiye_tablosu s ON a.serefiye_id = s.id
LEFT JOIN public.bloklar b ON s.blok_id = b.id;

-- 2. Improve the trigger function for unit assignment
CREATE OR REPLACE FUNCTION public.fn_sync_aidatlar_on_unit_assignment()
RETURNS TRIGGER AS $$
DECLARE
    v_aidat_record RECORD;
    v_cari_id UUID;
    v_accrued_debt NUMERIC;
BEGIN
    -- Eğer daireye yeni bir üye atandıysa
    IF (NEW.uye_id IS NOT NULL AND (OLD.uye_id IS NULL OR OLD.uye_id != NEW.uye_id)) THEN
        -- Cari hesabı bul
        SELECT id INTO v_cari_id FROM public.cari_hesaplar WHERE proje_id = NEW.proje_id AND uye_id = NEW.uye_id;
        
        -- Dairenin sahipsiz aidatlarını döngü ile yeni üyeye bağla ve cariye işle
        FOR v_aidat_record IN 
            SELECT a.id, a.proje_id, a.ay, a.yil, a.gecikme_faizi,
                   (at.katsayi_tutari * COALESCE(s.serefiye_orani, 1.00)) as ana_borc
            FROM public.aidatlar a
            JOIN public.aidat_tanimlari at ON a.aidat_tanimi_id = at.id
            JOIN public.serefiye_tablosu s ON a.serefiye_id = s.id
            WHERE a.serefiye_id = NEW.id AND a.uye_id IS NULL
        LOOP
            -- 1. Aidat kaydını güncelle
            UPDATE public.aidatlar 
            SET uye_id = NEW.uye_id, 
                updated_at = NOW() 
            WHERE id = v_aidat_record.id;
            
            -- 2. Cari hareket oluştur (Borçlandırma: alacak kolonu artar)
            -- Hem ana borcu hem de varsa birikmiş gecikme faizini yansıt
            v_accrued_debt := v_aidat_record.ana_borc + COALESCE(v_aidat_record.gecikme_faizi, 0);
            
            IF v_cari_id IS NOT NULL THEN
                INSERT INTO public.cari_hareketler (
                    proje_id,
                    cari_hesap_id,
                    islem_turu,
                    tarih,
                    alacak,
                    borc,
                    kaynak_tipi,
                    kaynak_id,
                    aciklama
                ) VALUES (
                    NEW.proje_id,
                    v_cari_id,
                    'aidat_kayit',
                    CURRENT_DATE,
                    v_accrued_debt,
                    0,
                    'aidat',
                    v_aidat_record.id,
                    v_aidat_record.ay || '/' || v_aidat_record.yil || ' Aidat Borcu (Daire Atama)'
                );
            END IF;
        END LOOP;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

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
        'bekleyen', COALESCE(SUM(CASE WHEN durum = 'bekliyor' THEN toplam_borc - dinamik_odenen_tutar ELSE 0 END), 0),
        'geciken', COALESCE(SUM(CASE WHEN durum = 'gecikti' THEN toplam_borc - dinamik_odenen_tutar ELSE 0 END), 0),
        'toplam_gecikme_faizi', COALESCE(SUM(gecikme_faizi), 0)
    ) INTO result
    FROM public.aidat_detaylari
    WHERE proje_id = p_proje_id
    AND (p_yil IS NULL OR yil = p_yil)
    AND (p_ay IS NULL OR ay = p_ay)
    AND (p_durum IS NULL OR durum = p_durum)
    AND (p_blok_id IS NULL OR filter_blok_id = p_blok_id)
    AND (p_has_daire IS NULL OR (p_has_daire = TRUE AND uye_id IS NOT NULL) OR (p_has_daire = FALSE AND uye_id IS NULL));

    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;
