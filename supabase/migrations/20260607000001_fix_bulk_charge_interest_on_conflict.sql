-- Migration: 20260607000001_fix_bulk_charge_interest_on_conflict.sql
-- Description: REGRESYON DÜZELTMESİ — fn_bulk_charge_interest ON CONFLICT predicate'i.
--
-- Kök neden: 20260530000001_aidat_tutar_yuvarlama.sql yuvarlama eklerken
--   fn_bulk_charge_interest'i ESKİ/GENİŞ inference predicate'iyle yeniden yarattı:
--     ON CONFLICT (kaynak_tipi, kaynak_id) WHERE kaynak_id IS NOT NULL AND kaynak_tipi IS NOT NULL
--   Bu, 20260514000001'deki düzeltmeyi sessizce geri aldı. Mevcut partial unique index ise
--   (20260512000006_fix_kaynak_unique_scope.sql):
--     uq_cari_hareketler_kaynak_tahakkuk
--       WHERE kaynak_id IS NOT NULL AND kaynak_tipi IN ('aidat_kayit','gecikme_faizi','fatura')
--   PostgreSQL ON CONFLICT inference kuralı: kullanıcı predicate'i index predicate'ini İMPLY
--   etmeli. `kaynak_tipi IS NOT NULL`, `kaynak_tipi IN (...)` ifadesini imply etmediği için:
--     42P10: there is no unique or exclusion constraint matching the ON CONFLICT specification
--   errorHandler bu kodu mapping etmediği için kullanıcıya 500 dönüyor.
--
-- Tekrar üretim: Üye Detay → "Faiz Borç İşle" → "Faizleri Borçlandır"
--   → POST /api/aidatlar/bulk-charge-interest → 500.
--
-- Fix: fn_bulk_charge_interest'i yuvarlama gövdesi (fn_aidat_yuvarla) KORUNARAK, ON CONFLICT
--   WHERE'i partial index predicate'i ile bire bir eşleşecek şekilde yeniden oluştur.
--   20260602170200 (search_path sweep) bir kerelik olduğundan, DROP+CREATE sonrası pin kaybolur
--   → SET search_path = public, pg_temp inline eklenir.

BEGIN;

DROP FUNCTION IF EXISTS public.fn_bulk_charge_interest(UUID[], UUID);
CREATE OR REPLACE FUNCTION public.fn_bulk_charge_interest(
    p_aidat_ids UUID[],
    p_actor_id UUID DEFAULT NULL
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
    PERFORM set_config('app.actor_id', COALESCE(p_actor_id::TEXT, ''), true);

    FOREACH v_aidat_id IN ARRAY p_aidat_ids
    LOOP
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
            -- YUVARLAMA: faiz taban tutari da 100'e yukari yuvarli (20260530000001)
            v_baz_tutar := public.fn_aidat_yuvarla(v_record.katsayi_tutari * COALESCE(v_record.serefiye_orani, 1.00));
            v_faiz_orani := COALESCE(v_record.gecikme_faiz_orani, 0) / 100.0;

            IF v_gun_sayisi < 5 THEN
                v_yeni_faiz := 0;
            ELSE
                v_yeni_faiz := (v_baz_tutar * POWER((1.0 + v_faiz_orani), (v_gun_sayisi / 30.0))) - v_baz_tutar;
            END IF;

            v_yeni_faiz := ROUND(v_yeni_faiz, 2);

            IF v_yeni_faiz > 0 THEN
                UPDATE public.aidatlar
                SET gecikme_faizi = v_yeni_faiz, faiz_yansitildi = TRUE, durum = 'gecikti', updated_at = now()
                WHERE id = v_record.id;

                SELECT id INTO v_cari_id FROM public.cari_hesaplar
                WHERE proje_id = v_record.proje_id AND uye_id = v_record.uye_id;

                IF v_cari_id IS NOT NULL THEN
                    INSERT INTO public.cari_hareketler (
                        proje_id, cari_hesap_id, islem_turu, tarih, alacak, borc, kaynak_tipi, kaynak_id, aciklama
                    ) VALUES (
                        v_record.proje_id, v_cari_id, 'gecikme_faizi', CURRENT_DATE, v_yeni_faiz, 0, 'gecikme_faizi', v_record.id,
                        v_record.ay || '/' || v_record.yil || ' Gecikme Faizi Tahakkuku (' || v_gun_sayisi || ' gün)'
                    )
                    -- DÜZELTME: predicate uq_cari_hareketler_kaynak_tahakkuk ile bire bir eşleşir.
                    ON CONFLICT (kaynak_tipi, kaynak_id)
                        WHERE kaynak_id IS NOT NULL
                          AND kaynak_tipi IN ('aidat_kayit', 'gecikme_faizi', 'fatura')
                    DO UPDATE SET
                        proje_id = EXCLUDED.proje_id,
                        cari_hesap_id = EXCLUDED.cari_hesap_id,
                        islem_turu = EXCLUDED.islem_turu,
                        tarih = EXCLUDED.tarih,
                        alacak = EXCLUDED.alacak,
                        borc = EXCLUDED.borc,
                        aciklama = EXCLUDED.aciklama;

                    v_success_count := v_success_count + 1;
                END IF;
            END IF;
        END IF;
    END LOOP;

    RETURN jsonb_build_object('success', true, 'count', v_success_count);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

COMMENT ON FUNCTION public.fn_bulk_charge_interest(UUID[], UUID) IS
  'Coklu aidat icin faiz tahakkuku (taban 100''e yuvarli). ON CONFLICT predicate'
  ' uq_cari_hareketler_kaynak_tahakkuk ile bire bir eslesir (20260607000001 regresyon fix).'
  ' p_actor_id verilirse app.actor_id set edilir.';

COMMIT;
