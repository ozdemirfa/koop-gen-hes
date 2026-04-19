-- Migration: 20260420000010_fix_interest_calculation.sql
-- Description: Implement exponential interest calculation logic with grace period.
-- Formula: tutar * (1 + oran/100)^(gun/30) - tutar

BEGIN;

-- 1. Drop existing functions with the same name but different signatures
DROP FUNCTION IF EXISTS public.hesapla_gecikme_faizi();
DROP FUNCTION IF EXISTS public.hesapla_gecikme_faizi(UUID, DATE, DATE);
DROP FUNCTION IF EXISTS public.hesapla_gecikme_faizi(UUID, UUID, DATE, DATE);

-- 2. Create the unified function
CREATE OR REPLACE FUNCTION public.hesapla_gecikme_faizi(
  p_proje_id UUID DEFAULT NULL,
  p_uye_id UUID DEFAULT NULL,
  p_baslangic_tarihi DATE DEFAULT NULL,
  p_bitis_tarihi DATE DEFAULT NULL
)
RETURNS void AS $$
DECLARE
    v_record RECORD;
    v_gun_sayisi INTEGER;
    v_baz_tutar NUMERIC;
    v_faiz_orani NUMERIC;
    v_yeni_faiz NUMERIC;
BEGIN
    -- Döngü ile her geciken/bekleyen aidatı güncelle
    FOR v_record IN 
        SELECT 
            a.id, 
            a.son_odeme_tarihi,
            at.katsayi_tutari,
            at.gecikme_faiz_orani,
            s.serefiye_orani
        FROM public.aidatlar a
        JOIN public.aidat_tanimlari at ON a.aidat_tanimi_id = at.id
        JOIN public.serefiye_tablosu s ON a.serefiye_id = s.id
        WHERE a.durum IN ('bekliyor', 'gecikti')
          AND a.son_odeme_tarihi < CURRENT_DATE
          AND (p_proje_id IS NULL OR a.proje_id = p_proje_id)
          AND (p_uye_id IS NULL OR a.uye_id = p_uye_id)
          AND (p_baslangic_tarihi IS NULL OR a.son_odeme_tarihi >= p_baslangic_tarihi)
          AND (p_bitis_tarihi IS NULL OR a.son_odeme_tarihi <= p_bitis_tarihi)
    LOOP
        -- Gün farkını hesapla
        v_gun_sayisi := CURRENT_DATE - v_record.son_odeme_tarihi;
        
        -- Baz tutarı hesapla (Katsayı * Şerefiye)
        v_baz_tutar := v_record.katsayi_tutari * COALESCE(v_record.serefiye_orani, 1.00);
        v_faiz_orani := COALESCE(v_record.gecikme_faiz_orani, 0) / 100.0;

        -- Mantık: 5 günden az ise faiz 0, değilse formül uygula
        IF v_gun_sayisi < 5 THEN
            v_yeni_faiz := 0;
        ELSE
            -- Formül: tutar * (1 + oran)^(gun/30) - tutar
            -- POWER fonksiyonu ile üs alma yapılır
            v_yeni_faiz := (v_baz_tutar * POWER((1.0 + v_faiz_orani), (v_gun_sayisi / 30.0))) - v_baz_tutar;
        END IF;

        -- Güncelle (Sadece aktif olmayan kayıtlar)
        UPDATE public.aidatlar 
        SET 
            gecikme_faizi = ROUND(v_yeni_faiz, 2),
            durum = 'gecikti',
            updated_at = now()
        WHERE id = v_record.id;
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;
