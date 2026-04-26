-- Migration: 20260424000009_manual_interest_toggle.sql
-- Description: Add manual interest toggle functionality to aidatlar and sync with cari_hareketler.

BEGIN;

-- 1. Add faiz_yansitildi column to aidatlar
ALTER TABLE public.aidatlar ADD COLUMN IF NOT EXISTS faiz_yansitildi BOOLEAN DEFAULT FALSE;

-- 2. Update the aidat_detaylari view to respect the manual toggle
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
    a.faiz_yansitildi, -- New column in view
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
    -- Dinamik Tutar Hesaplama
    (at.katsayi_tutari * COALESCE(s.serefiye_orani, 1.00)) as hesaplanan_tutar,
    -- Toplam Tutar (Sadece faiz yansıtıldıysa ekle)
    (at.katsayi_tutari * COALESCE(s.serefiye_orani, 1.00) + 
     CASE WHEN a.faiz_yansitildi THEN COALESCE(a.gecikme_faizi, 0) ELSE 0 END) as toplam_borc,
    -- Ödenen Tutar
    COALESCE((
        SELECT SUM(borc) -- Tahsilat (gelen_odeme) cari_hareketler'de borç sütunundadır
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

-- 3. Function to toggle interest
CREATE OR REPLACE FUNCTION public.fn_toggle_aidat_faiz(p_aidat_id UUID, p_active BOOLEAN)
RETURNS JSONB AS $$
DECLARE
    v_record RECORD;
    v_cari_id UUID;
    v_faiz NUMERIC(12,2);
BEGIN
    -- Aidatı bul
    SELECT a.*, u.id as uye_id_check 
    INTO v_record 
    FROM public.aidatlar a
    LEFT JOIN public.uyeler u ON a.uye_id = u.id
    WHERE a.id = p_aidat_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Aidat bulunamadı.');
    END IF;

    IF v_record.uye_id_check IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Bu aidatın henüz bir üyesi yok.');
    END IF;

    v_faiz := COALESCE(v_record.gecikme_faizi, 0);
    
    IF v_faiz <= 0 AND p_active THEN
        RETURN jsonb_build_object('success', false, 'message', 'Yansıtılacak faiz tutarı 0.');
    END IF;

    -- Cari hesabı bul
    SELECT id INTO v_cari_id FROM public.cari_hesaplar 
    WHERE proje_id = v_record.proje_id AND uye_id = v_record.uye_id;

    IF p_active THEN
        -- FAİZ EKLE
        UPDATE public.aidatlar SET faiz_yansitildi = TRUE WHERE id = p_aidat_id;

        IF v_cari_id IS NOT NULL THEN
            -- Daha önce eklenmiş mi kontrol et (varsa güncelle veya geç)
            IF NOT EXISTS (SELECT 1 FROM public.cari_hareketler WHERE kaynak_tipi = 'gecikme_faizi' AND kaynak_id = p_aidat_id) THEN
                INSERT INTO public.cari_hareketler (
                    proje_id, cari_hesap_id, islem_turu, tarih, alacak, borc, kaynak_tipi, kaynak_id, aciklama
                ) VALUES (
                    v_record.proje_id, v_cari_id, 'aidat_kayit', CURRENT_DATE, v_faiz, 0, 'gecikme_faizi', p_aidat_id, 'Gecikme Faizi'
                );
            END IF;
        END IF;
    ELSE
        -- FAİZ SİL
        UPDATE public.aidatlar SET faiz_yansitildi = FALSE WHERE id = p_aidat_id;

        -- Cari hareketi sil
        DELETE FROM public.cari_hareketler 
        WHERE kaynak_tipi = 'gecikme_faizi' AND kaynak_id = p_aidat_id;
    END IF;

    RETURN jsonb_build_object('success', true, 'faiz_yansitildi', p_active);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;
