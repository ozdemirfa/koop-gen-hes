-- Migration: 20260426000001_interest_toggle_refactoring.sql
-- Description: Interest Toggle Refactoring & Closure Undo
-- 1. hesapla_gecikme_faizi ve fn_calculate_single_aidat_late_fee fonksiyonlarını faiz_yansitildi bayrağı ile uyumlu hale getir.
-- 2. fn_toggle_aidat_faiz fonksiyonuna güvenlik kontrolü ekle (Eşleşmiş hareketler silinemez).

BEGIN;

-- 1. hesapla_gecikme_faizi: Sadece faiz_yansitildi = TRUE ise cari_hareketler'i günceller.
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
    v_faiz_farki NUMERIC;
    v_cari_id UUID;
BEGIN
    FOR v_record IN 
        SELECT 
            a.id, a.proje_id, a.uye_id, a.son_odeme_tarihi, a.gecikme_faizi, a.faiz_yansitildi,
            at.yil, at.ay, at.katsayi_tutari, at.gecikme_faiz_orani,
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
          AND a.gecikme_faizi_muaf = FALSE
    LOOP
        v_gun_sayisi := CURRENT_DATE - v_record.son_odeme_tarihi;
        v_baz_tutar := v_record.katsayi_tutari * COALESCE(v_record.serefiye_orani, 1.00);
        v_faiz_orani := COALESCE(v_record.gecikme_faiz_orani, 0) / 100.0;

        IF v_gun_sayisi < 5 THEN
            v_yeni_faiz := 0;
        ELSE
            v_yeni_faiz := (v_baz_tutar * POWER((1.0 + v_faiz_orani), (v_gun_sayisi / 30.0))) - v_baz_tutar;
        END IF;

        v_yeni_faiz := ROUND(v_yeni_faiz, 2);
        v_faiz_farki := v_yeni_faiz - COALESCE(v_record.gecikme_faizi, 0);

        IF v_faiz_farki > 0 THEN
            -- Aidatı güncelle
            UPDATE public.aidatlar 
            SET gecikme_faizi = v_yeni_faiz, durum = 'gecikti', updated_at = now()
            WHERE id = v_record.id;

            -- Eğer faiz yansıtıldıysa ve üye atanmışsa Cari Hareketi güncelle
            IF v_record.faiz_yansitildi = TRUE AND v_record.uye_id IS NOT NULL THEN
                SELECT id INTO v_cari_id FROM public.cari_hesaplar 
                WHERE proje_id = v_record.proje_id AND uye_id = v_record.uye_id;

                IF v_cari_id IS NOT NULL THEN
                    -- Varsa güncelle, yoksa ekle (kaynak_tipi='gecikme_faizi')
                    IF EXISTS (SELECT 1 FROM public.cari_hareketler WHERE kaynak_tipi = 'gecikme_faizi' AND kaynak_id = v_record.id) THEN
                        UPDATE public.cari_hareketler 
                        SET alacak = v_yeni_faiz,
                            aciklama = v_record.ay || '/' || v_record.yil || ' Gecikme Faizi Tahakkuku (' || v_gun_sayisi || ' gün)'
                        WHERE kaynak_tipi = 'gecikme_faizi' AND kaynak_id = v_record.id;
                    ELSE
                        INSERT INTO public.cari_hareketler (
                            proje_id, cari_hesap_id, islem_turu, tarih, alacak, borc, kaynak_tipi, kaynak_id, aciklama
                        ) VALUES (
                            v_record.proje_id, v_cari_id, 'aidat_kayit', CURRENT_DATE, v_yeni_faiz, 0, 'gecikme_faizi', v_record.id, 
                            v_record.ay || '/' || v_record.yil || ' Gecikme Faizi Tahakkuku (' || v_gun_sayisi || ' gün)'
                        );
                    END IF;
                END IF;
            END IF;
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 2. fn_calculate_single_aidat_late_fee: Sadece faiz_yansitildi = TRUE ise cari_hareketler'i günceller.
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
BEGIN
    -- 1. Aidat bilgilerini al
    SELECT
        a.id,
        a.proje_id,
        a.uye_id,
        a.son_odeme_tarihi,
        a.gecikme_faizi,
        a.gecikme_faizi_muaf,
        a.faiz_yansitildi,
        at.yil,
        at.ay,
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

    IF v_record.gecikme_faizi_muaf = TRUE THEN
        RETURN jsonb_build_object('success', false, 'message', 'Bu aidat faizden muaftır.');
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

    -- 4. Eğer faiz yansıtıldıysa Cari Hareketi güncelle
    IF v_record.faiz_yansitildi = TRUE AND v_record.uye_id IS NOT NULL THEN
        SELECT id INTO v_cari_id
        FROM public.cari_hesaplar
        WHERE proje_id = v_record.proje_id AND uye_id = v_record.uye_id;

        IF v_cari_id IS NOT NULL THEN
            IF EXISTS (SELECT 1 FROM public.cari_hareketler WHERE kaynak_tipi = 'gecikme_faizi' AND kaynak_id = p_aidat_id) THEN
                UPDATE public.cari_hareketler 
                SET alacak = v_yeni_faiz,
                    aciklama = v_record.ay || '/' || v_record.yil || ' Gecikme Faizi Tahakkuku (' || v_gun_sayisi || ' gün)'
                WHERE kaynak_tipi = 'gecikme_faizi' AND kaynak_id = p_aidat_id;
            ELSE
                INSERT INTO public.cari_hareketler (
                    proje_id, cari_hesap_id, islem_turu, tarih, alacak, borc, kaynak_tipi, kaynak_id, aciklama
                ) VALUES (
                    v_record.proje_id, v_cari_id, 'aidat_kayit', CURRENT_DATE, v_yeni_faiz, 0, 'gecikme_faizi', p_aidat_id, 
                    v_record.ay || '/' || v_record.yil || ' Gecikme Faizi Tahakkuku (' || v_gun_sayisi || ' gün)'
                );
            END IF;
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'success', true, 
        'message', 'Faiz hesaplandı', 
        'yeni_faiz', v_yeni_faiz,
        'faiz_farki', v_faiz_farki,
        'gecikme_gun', v_gun_sayisi
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 3. fn_toggle_aidat_faiz: Güvenlik kontrolü eklenmiş hali
CREATE OR REPLACE FUNCTION public.fn_toggle_aidat_faiz(p_aidat_id UUID, p_active BOOLEAN)
RETURNS JSONB AS $$
DECLARE
    v_record RECORD;
    v_uye_id UUID;
    v_cari_id UUID;
    v_faiz NUMERIC(12,2);
    v_hareket_id UUID;
    v_eslesme_var BOOLEAN;
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
        SELECT id INTO v_hareket_id FROM public.cari_hareketler 
        WHERE kaynak_tipi = 'gecikme_faizi' AND kaynak_id = p_aidat_id LIMIT 1;
        
        IF v_hareket_id IS NOT NULL THEN
            -- Banka hareketlerinde eşleşme var mı?
            SELECT EXISTS (
                SELECT 1 FROM public.banka_hareketleri 
                WHERE eslesen_cari_hareket_id = v_hareket_id
            ) INTO v_eslesme_var;
            
            IF v_eslesme_var THEN
                RETURN jsonb_build_object('success', false, 'message', 'Bu faize ait ödeme eşleştirmesi yapılmış. Lütfen önce ödeme eşleştirmesini geri alınız.');
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
