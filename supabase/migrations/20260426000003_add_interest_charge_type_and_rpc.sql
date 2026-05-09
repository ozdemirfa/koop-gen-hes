-- Migration: 20260426000003_add_interest_charge_type_and_rpc.sql
-- Description: cari_hareketler tablosuna 'gecikme_faizi' islem_turu eklenmesi ve toplu faiz borclandirma RPC'si.

BEGIN;

-- 1. islem_turu kısıtlamasını güncelle
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cari_hareketler_islem_turu_check') THEN
        ALTER TABLE public.cari_hareketler DROP CONSTRAINT cari_hareketler_islem_turu_check;
    END IF;
END $$;

ALTER TABLE public.cari_hareketler ADD CONSTRAINT cari_hareketler_islem_turu_check 
CHECK (islem_turu IN ('aidat_kayit', 'hakedis', 'gelen_odeme', 'giden_odeme', 'gecikme_faizi'));

-- 2. Toplu faiz borçlandırma RPC'si
CREATE OR REPLACE FUNCTION public.fn_bulk_charge_interest(
    p_aidat_ids UUID[]
)
RETURNS JSONB AS $$
DECLARE
    v_aidat_id UUID;
    v_record RECORD;
    v_gun_sayisi INTEGER;
    v_baz_tutar NUMERIC;
    v_faiz_orani NUMERIC;
    v_yeni_faiz NUMERIC;
    v_cari_id UUID;
    v_success_count INTEGER := 0;
BEGIN
    FOREACH v_aidat_id IN ARRAY p_aidat_ids
    LOOP
        -- Aidat bilgilerini al
        SELECT
            a.id, a.proje_id, a.uye_id, a.son_odeme_tarihi, a.gecikme_faizi,
            at.yil, at.ay, at.katsayi_tutari, at.gecikme_faiz_orani,
            s.serefiye_orani
        INTO v_record
        FROM public.aidatlar a
        JOIN public.aidat_tanimlari at ON a.aidat_tanimi_id = at.id
        JOIN public.serefiye_tablosu s ON a.serefiye_id = s.id
        WHERE a.id = v_aidat_id;

        IF FOUND AND v_record.uye_id IS NOT NULL THEN
            v_gun_sayisi := CURRENT_DATE - v_record.son_odeme_tarihi;
            v_baz_tutar := v_record.katsayi_tutari * COALESCE(v_record.serefiye_orani, 1.00);
            v_faiz_orani := COALESCE(v_record.gecikme_faiz_orani, 0) / 100.0;

            IF v_gun_sayisi < 5 THEN
                v_yeni_faiz := 0;
            ELSE
                v_yeni_faiz := (v_baz_tutar * POWER((1.0 + v_faiz_orani), (v_gun_sayisi / 30.0))) - v_baz_tutar;
            END IF;

            v_yeni_faiz := ROUND(v_yeni_faiz, 2);

            IF v_yeni_faiz > 0 THEN
                -- Aidatı güncelle
                UPDATE public.aidatlar 
                SET gecikme_faizi = v_yeni_faiz, faiz_yansitildi = TRUE, durum = 'gecikti', updated_at = now()
                WHERE id = v_record.id;

                -- Cari hesabı bul
                SELECT id INTO v_cari_id FROM public.cari_hesaplar 
                WHERE proje_id = v_record.proje_id AND uye_id = v_record.uye_id;

                IF v_cari_id IS NOT NULL THEN
                    -- Varsa güncelle, yoksa ekle
                    IF EXISTS (SELECT 1 FROM public.cari_hareketler WHERE kaynak_tipi = 'gecikme_faizi' AND kaynak_id = v_record.id) THEN
                        UPDATE public.cari_hareketler 
                        SET alacak = v_yeni_faiz,
                            islem_turu = 'gecikme_faizi',
                            aciklama = v_record.ay || '/' || v_record.yil || ' Gecikme Faizi Tahakkuku (' || v_gun_sayisi || ' gün)'
                        WHERE kaynak_tipi = 'gecikme_faizi' AND kaynak_id = v_record.id;
                    ELSE
                        INSERT INTO public.cari_hareketler (
                            proje_id, cari_hesap_id, islem_turu, tarih, alacak, borc, kaynak_tipi, kaynak_id, aciklama
                        ) VALUES (
                            v_record.proje_id, v_cari_id, 'gecikme_faizi', CURRENT_DATE, v_yeni_faiz, 0, 'gecikme_faizi', v_record.id, 
                            v_record.ay || '/' || v_record.yil || ' Gecikme Faizi Tahakkuku (' || v_gun_sayisi || ' gün)'
                        );
                    END IF;
                    v_success_count := v_success_count + 1;
                END IF;
            END IF;
        END IF;
    END LOOP;

    RETURN jsonb_build_object('success', true, 'count', v_success_count);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;
