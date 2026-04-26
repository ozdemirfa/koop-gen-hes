-- Migration: 20260427000007_prevent_interest_removal_on_paid_aidat.sql
-- Description: US-FAIZ-01 - Prevent removing interest if the aidat has been partially or fully paid.

BEGIN;

CREATE OR REPLACE FUNCTION public.fn_toggle_aidat_faiz(p_aidat_id UUID, p_active BOOLEAN)
RETURNS JSONB AS $$
DECLARE
    v_record RECORD;
    v_uye_id UUID;
    v_cari_id UUID;
    v_faiz NUMERIC(12,2);
    v_hareket_id UUID;
    v_eslesme_var BOOLEAN;
    v_aidat_odenen NUMERIC;
BEGIN
    -- Aidat ve mevcut üye bilgisini al
    SELECT a.*, COALESCE(a.uye_id, s.uye_id) as final_uye_id,
           at.yil, at.ay,
           (CURRENT_DATE - a.son_odeme_tarihi) as gecikme_gun
    INTO v_record 
    FROM public.aidatlar a
    JOIN public.serefiye_tablosu s ON a.serefiye_id = s.id
    JOIN public.aidat_tanimlari at ON a.aidat_tanimi_id = at.id
    WHERE a.id = p_aidat_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Aidat bulunamadı.');
    END IF;

    v_uye_id := v_record.final_uye_id;

    IF v_uye_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Bu aidatın henüz bir üyesi yok. Lütfen önce daireye üye atayınız.');
    END IF;

    -- Eğer aidat kaydında üye ID eksikse güncelle (Sync)
    IF v_record.uye_id IS NULL THEN
        UPDATE public.aidatlar SET uye_id = v_uye_id WHERE id = p_aidat_id;
    END IF;

    v_faiz := COALESCE(v_record.gecikme_faizi, 0);
    
    IF v_faiz < 0.01 AND p_active THEN
        RETURN jsonb_build_object('success', false, 'message', 'Yansıtılacak anlamlı bir faiz tutarı bulunamadı.');
    END IF;

    -- Cari hesabı bul
    SELECT id INTO v_cari_id FROM public.cari_hesaplar 
    WHERE proje_id = v_record.proje_id AND uye_id = v_uye_id;

    IF p_active THEN
        -- FAİZ EKLE
        UPDATE public.aidatlar SET faiz_yansitildi = TRUE WHERE id = p_aidat_id;

        IF v_cari_id IS NOT NULL THEN
            IF EXISTS (SELECT 1 FROM public.cari_hareketler WHERE kaynak_tipi = 'gecikme_faizi' AND kaynak_id = p_aidat_id) THEN
                UPDATE public.cari_hareketler 
                SET alacak = v_faiz,
                    aciklama = v_record.ay || '/' || v_record.yil || ' Gecikme Faizi Tahakkuku (' || v_record.gecikme_gun || ' gün)'
                WHERE kaynak_tipi = 'gecikme_faizi' AND kaynak_id = p_aidat_id;
            ELSE
                INSERT INTO public.cari_hareketler (
                    proje_id, cari_hesap_id, islem_turu, tarih, alacak, borc, kaynak_tipi, kaynak_id, aciklama
                ) VALUES (
                    v_record.proje_id, v_cari_id, 'aidat_kayit', CURRENT_DATE, v_faiz, 0, 'gecikme_faizi', p_aidat_id, 
                    v_record.ay || '/' || v_record.yil || ' Gecikme Faizi Tahakkuku (' || v_record.gecikme_gun || ' gün)'
                );
            END IF;
        END IF;
    ELSE
        -- FAİZ SİLME (Güvenlik Kontrolü)
        
        -- 1. KURAL: Aidatın kendisine kısmi veya tam ödeme yapılmışsa faiz silinemez.
        SELECT EXISTS (
            SELECT 1 FROM public.cari_hareketler 
            WHERE kaynak_tipi = 'aidat' AND kaynak_id = p_aidat_id AND islem_turu = 'gelen_odeme'
        ) INTO v_eslesme_var;

        IF v_eslesme_var THEN
            RETURN jsonb_build_object('success', false, 'message', 'Bu aidata kısmi veya tam ödeme yapılmış. Önce ödeme eşleştirmesini kaldırınız (Undo Closure).');
        END IF;

        -- 2. KURAL: Faizin kendisine ödeme yapılmışsa silinemez.
        SELECT id INTO v_hareket_id FROM public.cari_hareketler 
        WHERE kaynak_tipi = 'gecikme_faizi' AND kaynak_id = p_aidat_id LIMIT 1;
        
        IF v_hareket_id IS NOT NULL THEN
            -- Banka hareketlerinde eşleşme var mı?
            SELECT EXISTS (
                SELECT 1 FROM public.banka_hareketleri 
                WHERE eslesen_cari_hareket_id = v_hareket_id
            ) INTO v_eslesme_var;
            
            IF v_eslesme_var THEN
                RETURN jsonb_build_object('success', false, 'message', 'Bu faize ait ödeme eşleştirmesi yapılmış. Lütfen önce ödeme eşleştirmesini geri alınız (Undo Closure).');
            END IF;
            
            -- Eşleşme yoksa sil
            DELETE FROM public.cari_hareketler WHERE id = v_hareket_id;
        END IF;

        UPDATE public.aidatlar SET faiz_yansitildi = FALSE WHERE id = p_aidat_id;
    END IF;

    RETURN jsonb_build_object('success', true, 'faiz_yansitildi', p_active);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;
