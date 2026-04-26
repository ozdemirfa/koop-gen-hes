-- Migration: 20260424000013_sync_aidat_members_and_robust_toggle.sql
-- Description: Sync missing uye_id in aidatlar from serefiye_tablosu and improve toggle function.

BEGIN;

-- 1. Sync missing uye_id in aidatlar table
-- This ensures existing aidats get linked to the member currently assigned to the unit.
UPDATE public.aidatlar a
SET uye_id = s.uye_id,
    updated_at = NOW()
FROM public.serefiye_tablosu s
WHERE a.serefiye_id = s.id 
  AND a.uye_id IS NULL 
  AND s.uye_id IS NOT NULL;

-- 2. Make fn_toggle_aidat_faiz more robust
-- It will now try to fetch the member from the unit if not directly on the aidat.
CREATE OR REPLACE FUNCTION public.fn_toggle_aidat_faiz(p_aidat_id UUID, p_active BOOLEAN)
RETURNS JSONB AS $$
DECLARE
    v_record RECORD;
    v_uye_id UUID;
    v_cari_id UUID;
    v_faiz NUMERIC(12,2);
BEGIN
    -- Aidat ve mevcut üye bilgisini al
    SELECT a.*, COALESCE(a.uye_id, s.uye_id) as final_uye_id
    INTO v_record 
    FROM public.aidatlar a
    JOIN public.serefiye_tablosu s ON a.serefiye_id = s.id
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
    
    -- Küçük yuvarlama farklarını 0 kabul et
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
            -- Daha önce eklenmiş mi kontrol et (varsa güncelle veya geç)
            IF NOT EXISTS (SELECT 1 FROM public.cari_hareketler WHERE kaynak_tipi = 'gecikme_faizi' AND kaynak_id = p_aidat_id) THEN
                INSERT INTO public.cari_hareketler (
                    proje_id, cari_hesap_id, islem_turu, tarih, alacak, borc, kaynak_tipi, kaynak_id, aciklama, odeme_turu
                ) VALUES (
                    v_record.proje_id, v_cari_id, 'aidat_kayit', CURRENT_DATE, v_faiz, 0, 'gecikme_faizi', p_aidat_id, 'Gecikme Faizi', NULL
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
