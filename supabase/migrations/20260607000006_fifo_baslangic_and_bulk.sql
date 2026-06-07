-- Migration: 20260607000006_fifo_baslangic_and_bulk.sql
-- Sprint: kurumsal-cari-revizyonlar 2. tur (2026-06-07)
-- Description:
--   Rev C (REGRESYON FIX): fn_match_member_payments_fifo başlangıç bedeli hedeflerini
--     yeniden kazanır. 20260512000007 başlangıç desteğini eklemişti; 20260530000001
--     (yuvarlama) RPC'yi aidat-only haliyle yeniden yaratıp bu desteği geri almıştı.
--     Bu migration ikisini birleştirir: başlangıç hedefleri + aidat taban tutarı
--     yuvarlaması (fn_aidat_yuvarla).
--   Rev B: fn_match_all_members_fifo — proje genelinde tüm üyeler için FIFO (Üye
--     Yönetimi sayfasındaki toplu "Hesap Kapatma" butonu).
--
-- search_path pin (20260602170200 sweep bir kerelik) inline eklenir.

BEGIN;

-- =============================================================================
-- Rev C: fn_match_member_payments_fifo — başlangıç hedefleri + yuvarlama
-- =============================================================================
DROP FUNCTION IF EXISTS public.fn_match_member_payments_fifo(UUID, UUID);
DROP FUNCTION IF EXISTS public.fn_match_member_payments_fifo(UUID, UUID, UUID);

CREATE OR REPLACE FUNCTION public.fn_match_member_payments_fifo(
  p_proje_id UUID,
  p_uye_id UUID,
  p_actor_id UUID DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
    v_total_unmatched_payment NUMERIC(14,2);
    v_target RECORD;
    v_payment RECORD;
    v_match_amount NUMERIC(14,2);
    v_matched_count INTEGER := 0;
    v_cari_id UUID;
    v_unmatched_payments CURSOR FOR
        SELECT ch.id, ch.borc AS tutar, ch.tarih, ch.aciklama,
               ch.odeme_turu, ch.banka_hesap_id, ch.belge_no, ch.islem_turu
        FROM public.cari_hareketler ch
        JOIN public.cari_hesaplar c ON ch.cari_hesap_id = c.id
        WHERE c.proje_id = p_proje_id
          AND c.uye_id = p_uye_id
          AND ch.islem_turu IN ('gelen_odeme', 'uyelik_baslangic')
          AND ch.borc > 0
          AND ch.kaynak_tipi IS NULL
        ORDER BY ch.tarih ASC, ch.created_at ASC;
BEGIN
    PERFORM set_config('app.actor_id', COALESCE(p_actor_id::TEXT, ''), true);

    SELECT id INTO v_cari_id
    FROM public.cari_hesaplar
    WHERE proje_id = p_proje_id AND uye_id = p_uye_id;

    IF v_cari_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Cari hesap bulunamadı');
    END IF;

    FOR v_payment IN v_unmatched_payments LOOP
        v_total_unmatched_payment := v_payment.tutar;

        WHILE v_total_unmatched_payment > 0.009 LOOP
            -- En eski açık hedef: aidat tahakkukları + başlangıç bedeli tahakkukları
            WITH aidat_targets AS (
                SELECT
                    'aidat'::TEXT AS target_tipi,
                    a.id AS target_id,
                    a.son_odeme_tarihi AS sort_date,
                    a.created_at AS sort_created,
                    GREATEST(
                        COALESCE(ct.total_accrued, 0),
                        -- YUVARLAMA: taban tutar 100'e yukarı (20260530000001 ile uyumlu)
                        public.fn_aidat_yuvarla(at.katsayi_tutari * COALESCE(s.serefiye_orani, 1.00)) + COALESCE(a.gecikme_faizi, 0)
                    ) AS toplam_borc,
                    COALESCE(ct.total_paid, 0) AS odenen_tutar
                FROM public.aidatlar a
                JOIN public.aidat_tanimlari at ON a.aidat_tanimi_id = at.id
                JOIN public.serefiye_tablosu s ON a.serefiye_id = s.id
                LEFT JOIN (
                    SELECT kaynak_id, SUM(alacak) AS total_accrued, SUM(borc) AS total_paid
                    FROM public.cari_hareketler
                    WHERE kaynak_tipi IN ('aidat', 'gecikme_faizi')
                    GROUP BY kaynak_id
                ) ct ON ct.kaynak_id = a.id
                WHERE a.proje_id = p_proje_id
                  AND a.uye_id = p_uye_id
                  AND a.durum IN ('bekliyor', 'gecikti')
            ),
            baslangic_targets AS (
                SELECT
                    'baslangic_bedeli'::TEXT AS target_tipi,
                    ch.id AS target_id,
                    ch.tarih AS sort_date,
                    ch.created_at AS sort_created,
                    ch.alacak AS toplam_borc,
                    COALESCE((
                        SELECT SUM(borc) FROM public.cari_hareketler
                        WHERE kaynak_tipi = 'baslangic_bedeli' AND kaynak_id = ch.id
                    ), 0) AS odenen_tutar
                FROM public.cari_hareketler ch
                WHERE ch.cari_hesap_id = v_cari_id
                  AND ch.islem_turu = 'uyelik_baslangic'
                  AND ch.alacak > 0
                  AND ch.kaynak_tipi IS NULL
            )
            SELECT target_tipi, target_id, toplam_borc, odenen_tutar
            INTO v_target
            FROM (
                SELECT target_tipi, target_id, sort_date, sort_created, toplam_borc, odenen_tutar
                FROM aidat_targets
                UNION ALL
                SELECT target_tipi, target_id, sort_date, sort_created, toplam_borc, odenen_tutar
                FROM baslangic_targets
            ) tgts
            WHERE (toplam_borc - odenen_tutar) > 0.009
            ORDER BY sort_date ASC NULLS LAST, sort_created ASC
            LIMIT 1;

            IF v_target IS NULL THEN
                EXIT;
            END IF;

            v_match_amount := LEAST(v_total_unmatched_payment, (v_target.toplam_borc - v_target.odenen_tutar));

            IF v_match_amount <= 0.009 THEN
                EXIT;
            END IF;

            IF ABS(v_total_unmatched_payment - v_match_amount) < 0.009 THEN
                UPDATE public.cari_hareketler
                SET kaynak_tipi = v_target.target_tipi, kaynak_id = v_target.target_id
                WHERE id = v_payment.id;

                v_total_unmatched_payment := 0;
            ELSE
                UPDATE public.cari_hareketler
                SET borc = v_match_amount, kaynak_tipi = v_target.target_tipi, kaynak_id = v_target.target_id
                WHERE id = v_payment.id;

                INSERT INTO public.cari_hareketler (
                    proje_id, cari_hesap_id, islem_turu, odeme_turu, tarih,
                    borc, alacak, aciklama, belge_no, banka_hesap_id
                ) VALUES (
                    p_proje_id, v_cari_id, v_payment.islem_turu, v_payment.odeme_turu, v_payment.tarih,
                    (v_total_unmatched_payment - v_match_amount), 0,
                    v_payment.aciklama, v_payment.belge_no, v_payment.banka_hesap_id
                ) RETURNING id INTO v_payment.id;

                v_total_unmatched_payment := (v_total_unmatched_payment - v_match_amount);
            END IF;

            v_matched_count := v_matched_count + 1;
        END LOOP;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'message', 'FIFO eşleştirme tamamlandı',
        'matched_count', v_matched_count
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

COMMENT ON FUNCTION public.fn_match_member_payments_fifo(UUID, UUID, UUID) IS
    'Uye FIFO eslestirme: gelen_odeme + uyelik_baslangic tahsilatlarini aidat (taban '
    '100''e yuvarli) ve baslangic bedeli tahakkuklari ile vade ASC eslestirir. '
    '20260607000006: baslangic hedefleri (20260512000007) + yuvarlama (20260530000001) birlesik.';

-- =============================================================================
-- Rev B: fn_match_all_members_fifo — proje genelinde toplu FIFO
-- =============================================================================
CREATE OR REPLACE FUNCTION public.fn_match_all_members_fifo(
  p_proje_id UUID,
  p_actor_id UUID DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  r          RECORD;
  v_res      JSONB;
  v_total    INTEGER := 0;
  v_uye_say  INTEGER := 0;
BEGIN
  PERFORM set_config('app.actor_id', COALESCE(p_actor_id::TEXT, ''), true);

  FOR r IN
    SELECT uye_id FROM public.cari_hesaplar
    WHERE proje_id = p_proje_id AND cari_turu = 'uye' AND uye_id IS NOT NULL
  LOOP
    v_res := public.fn_match_member_payments_fifo(p_proje_id, r.uye_id, p_actor_id);
    IF COALESCE((v_res->>'success')::boolean, false) THEN
      v_total := v_total + COALESCE((v_res->>'matched_count')::int, 0);
      v_uye_say := v_uye_say + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Toplu hesap kapatma tamamlandı',
    'matched_count', v_total,
    'uye_sayisi', v_uye_say
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

COMMENT ON FUNCTION public.fn_match_all_members_fifo(UUID, UUID) IS
    'Proje genelinde tüm üyeler için FIFO hesap kapatma (aidat + başlangıç bedeli). '
    'Üye Yönetimi sayfasındaki toplu "Hesap Kapatma" butonu çağırır.';

COMMIT;
