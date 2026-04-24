-- Migration: 20260424000002_single_aidat_late_fee_with_cari.sql
-- Description: Add function to calculate late fee for a single aidat and debit the cari account.

BEGIN;

CREATE OR REPLACE FUNCTION public.fn_calculate_single_aidat_late_fee(
    p_aidat_id UUID
)
RETURNS JSONB AS $$
DECLARE
    v_record RECORD;
    v_gun_sayisi INTEGER;
    v_baz_tutar NUMERIC;
    v_faiz_orani NUMERIC;
    v_yeni_faiz NUMERIC;
    v_eski_faiz NUMERIC;
    v_faiz_farki NUMERIC;
    v_cari_id UUID;
    v_proje_id UUID;
    v_uye_id UUID;
BEGIN
    -- 1. Aidat bilgilerini al
    SELECT
        a.id,
        a.proje_id,
        a.uye_id,
        a.son_odeme_tarihi,
        a.gecikme_faizi,
        at.katsayi_tutari,
        at.gecikme_faiz_orani,
        s.serefiye_orani
    INTO v_record
    FROM public.aidatlar a
    JOIN public.aidat_tanimlari at ON a.aidat_tanimi_id = at.id
    JOIN public.serefiye_tablosu s ON a.serefiye_id = s.id
    WHERE a.id = p_aidat_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Aidat bulunamadı');
    END IF;

    -- 2. Gecikme hesapla
    v_gun_sayisi := CURRENT_DATE - v_record.son_odeme_tarihi;
    
    IF v_gun_sayisi < 5 THEN
        RETURN jsonb_build_object('success', false, 'message', 'Henüz faiz hesaplanacak kadar gecikme (5 gün) oluşmadı');
    END IF;

    v_baz_tutar := v_record.katsayi_tutari * COALESCE(v_record.serefiye_orani, 1.00);
    v_faiz_orani := COALESCE(v_record.gecikme_faiz_orani, 0) / 100.0;
    v_yeni_faiz := (v_baz_tutar * POWER((1.0 + v_faiz_orani), (v_gun_sayisi / 30.0))) - v_baz_tutar;
    v_yeni_faiz := ROUND(v_yeni_faiz, 2);
    
    v_eski_faiz := COALESCE(v_record.gecikme_faizi, 0);
    v_faiz_farki := v_yeni_faiz - v_eski_faiz;

    IF v_faiz_farki <= 0 THEN
        RETURN jsonb_build_object('success', true, 'message', 'Faiz zaten güncel', 'yeni_faiz', v_yeni_faiz);
    END IF;

    -- 3. Aidatı güncelle
    UPDATE public.aidatlar
    SET 
        gecikme_faizi = v_yeni_faiz,
        durum = 'gecikti'::aidat_durumu,
        updated_at = now()
    WHERE id = p_aidat_id;

    -- 4. Cari hesabı bul
    SELECT id INTO v_cari_id
    FROM public.cari_hesaplar
    WHERE proje_id = v_record.proje_id AND uye_id = v_record.uye_id;

    IF v_cari_id IS NOT NULL THEN
        -- Cari hareket oluştur (Borçlandır: alacak kolonu artar çünkü projenin alacağıdır)
        -- Not: Cari Hesap Revizyonunda 'alacak' kolonu üye borcunu temsil ediyordu.
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
            v_record.proje_id,
            v_cari_id,
            'aidat_kayit', -- Faiz kaydı için de bu tür kullanılabilir veya yeni eklenebilir
            CURRENT_DATE,
            v_faiz_farki, -- Üye borçlanıyor (Proje alacaklanıyor)
            0,
            'aidat',
            p_aidat_id,
            'Gecikme Faizi Tahakkuku (' || v_gun_sayisi || ' gün)'
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true, 
        'message', 'Faiz hesaplandı ve cari hesaba yansıtıldı', 
        'yeni_faiz', v_yeni_faiz,
        'faiz_farki', v_faiz_farki,
        'gecikme_gun', v_gun_sayisi
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;
