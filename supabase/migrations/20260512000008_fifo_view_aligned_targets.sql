-- Migration: 20260512000008_fifo_view_aligned_targets.sql
-- Description: REV-FIFO-03 — fn_match_member_payments_fifo'nun aidat hedef
-- hesabını aidat_detaylari view ile aynı formülle hizaladık. Önceki RPC:
--
--   GREATEST(
--     COALESCE(ct.total_accrued, 0),
--     (at.katsayi_tutari * COALESCE(s.serefiye_orani, 1.00)) + COALESCE(a.gecikme_faizi, 0)
--   ) as toplam_borc
--
-- ile view (20260511000008):
--
--   (at.katsayi_tutari * COALESCE(s.serefiye_orani, 1.00))
--   + CASE WHEN a.faiz_yansitildi THEN COALESCE(a.gecikme_faizi, 0) ELSE 0 END
--
-- arasında tutarsızlık vardı. View `faiz_yansitildi=false` iken faiz tutarını
-- tahakkuka eklemiyor, ama RPC her zaman ekliyordu. Sonuç: faiz alanı dolu ama
-- yansıtılmamış aidatlarda FIFO ödenen tutarı view-tahakkuktan fazla bağlıyordu
-- (Aidat Hesapları'nda Tahakkuk=50.000 fakat Ödenen=54.856 vb.).
--
-- Fix: RPC hesabını view formülü ile birebir aynı yap. ct.total_accrued artık
-- kullanılmıyor (view de kullanmıyor — tahakkuk tamamen formula tabanlı).

BEGIN;

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
            -- REV-FIFO-03: aidat hedef tahakkukunu view formülü ile birebir hesapla.
            -- ct.total_accrued (cari'den SUM alacak) artık kullanılmıyor — view de
            -- aynı şekilde formula-based.
            WITH aidat_targets AS (
                SELECT
                    'aidat'::TEXT AS target_tipi,
                    a.id AS target_id,
                    a.son_odeme_tarihi AS sort_date,
                    a.created_at AS sort_created,
                    (
                        (at.katsayi_tutari * COALESCE(s.serefiye_orani, 1.00))
                        + CASE WHEN a.faiz_yansitildi THEN COALESCE(a.gecikme_faizi, 0) ELSE 0 END
                    ) AS toplam_borc,
                    COALESCE(ct.total_paid, 0) AS odenen_tutar
                FROM public.aidatlar a
                JOIN public.aidat_tanimlari at ON a.aidat_tanimi_id = at.id
                JOIN public.serefiye_tablosu s ON a.serefiye_id = s.id
                LEFT JOIN (
                    SELECT kaynak_id, SUM(borc) AS total_paid
                    FROM public.cari_hareketler
                    WHERE kaynak_tipi = 'aidat'
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.fn_match_member_payments_fifo IS
    'Uye FIFO eslestirme: aidat hedef tahakkukunu aidat_detaylari view ile birebir'
    ' aynı formulle hesaplar (formula + faiz_yansitildi). Boylece View toplam_tahakkuk'
    ' ile RPC LEAST hesabi birbirine sapmaz — odenen Tahakkuktan asla buyuk olmaz.'
    ' v4 (REV-FIFO-03).';

COMMIT;
