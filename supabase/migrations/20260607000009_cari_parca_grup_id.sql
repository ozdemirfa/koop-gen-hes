-- Migration: 20260607000009_cari_parca_grup_id.sql
-- Sprint: kurumsal-cari-bugfix (2026-06-07)
-- Description: BUG FIX — Para Hareketleri "toplu gösterim".
--
-- Kök neden: groupCariParcalari (frontend) FIFO parçalarını birleştirmek için satırları
--   (cari_hesap_id, tarih, odeme_turu, banka_hesap_id, belge_no, aciklama, islem_turu)
--   heuristiğiyle grupluyordu. Aynı alanlara sahip AYRI girişler (yönetim ödemeleri
--   cari_hesap_id=NULL; tekrarlı kurum ödemeleri) yanlışlıkla birleşiyordu.
--
-- Fix: cari_hareketler'e parca_grup_id ekle. FIFO bölmesi tek ödemeden türeyen TÜM
--   parçalara ortak parca_grup_id yazar. Frontend yalnız parca_grup_id paylaşan satırları
--   birleştirir; null olanlar (yönetim/kurum/ayrı ödemeler) her biri ayrı satır.

BEGIN;

-- 1. Kolon + index
ALTER TABLE public.cari_hareketler
  ADD COLUMN IF NOT EXISTS parca_grup_id UUID;

COMMENT ON COLUMN public.cari_hareketler.parca_grup_id IS
  'FIFO bölmesinde tek ödemeden türeyen parçaların ortak grup kimliği. Para Hareketleri '
  'gösteriminde yalnız aynı parca_grup_id''li satırlar birleştirilir.';

CREATE INDEX IF NOT EXISTS idx_cari_hareketler_parca_grup
  ON public.cari_hareketler (parca_grup_id) WHERE parca_grup_id IS NOT NULL;

-- 2. fn_match_member_payments_fifo — parca_grup_id damgası (gövde 20260607000006 + grup)
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
    v_grup_id UUID;
    v_unmatched_payments CURSOR FOR
        SELECT ch.id, ch.borc AS tutar, ch.tarih, ch.aciklama,
               ch.odeme_turu, ch.banka_hesap_id, ch.belge_no, ch.islem_turu, ch.parca_grup_id
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
        -- Bu ödemeden türeyen tüm parçalar ortak grup kimliği taşır (önceki run'da
        -- işaretlenmişse korunur).
        v_grup_id := COALESCE(v_payment.parca_grup_id, gen_random_uuid());

        WHILE v_total_unmatched_payment > 0.009 LOOP
            WITH aidat_targets AS (
                SELECT
                    'aidat'::TEXT AS target_tipi,
                    a.id AS target_id,
                    a.son_odeme_tarihi AS sort_date,
                    a.created_at AS sort_created,
                    GREATEST(
                        COALESCE(ct.total_accrued, 0),
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
                SET kaynak_tipi = v_target.target_tipi, kaynak_id = v_target.target_id,
                    parca_grup_id = v_grup_id
                WHERE id = v_payment.id;

                v_total_unmatched_payment := 0;
            ELSE
                UPDATE public.cari_hareketler
                SET borc = v_match_amount, kaynak_tipi = v_target.target_tipi, kaynak_id = v_target.target_id,
                    parca_grup_id = v_grup_id
                WHERE id = v_payment.id;

                INSERT INTO public.cari_hareketler (
                    proje_id, cari_hesap_id, islem_turu, odeme_turu, tarih,
                    borc, alacak, aciklama, belge_no, banka_hesap_id, parca_grup_id
                ) VALUES (
                    p_proje_id, v_cari_id, v_payment.islem_turu, v_payment.odeme_turu, v_payment.tarih,
                    (v_total_unmatched_payment - v_match_amount), 0,
                    v_payment.aciklama, v_payment.belge_no, v_payment.banka_hesap_id, v_grup_id
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
    'Uye FIFO eslestirme (aidat 100''e yuvarli + baslangic bedeli). 20260607000009: tek '
    'odemeden turetilen parcalara ortak parca_grup_id damgalanir (Para Hareketleri akilli '
    'gruplama). fn_match_all_members_fifo bunu cagirir.';

-- 3. Backfill: mevcut eşleşmiş FIFO parçalarına geçmiş tutarlılığı için ortak grup ata.
--    Eski heuristik anahtarıyla count>1 gruplar (gerçek parça kümeleri).
WITH grp AS (
  SELECT cari_hesap_id, tarih, odeme_turu, banka_hesap_id, belge_no, aciklama, islem_turu,
         gen_random_uuid() AS gid
  FROM public.cari_hareketler
  WHERE parca_grup_id IS NULL
    AND cari_hesap_id IS NOT NULL
    AND kaynak_tipi IN ('aidat', 'baslangic_bedeli', 'gecikme_faizi')
  GROUP BY cari_hesap_id, tarih, odeme_turu, banka_hesap_id, belge_no, aciklama, islem_turu
  HAVING COUNT(*) > 1
)
UPDATE public.cari_hareketler ch
SET parca_grup_id = grp.gid
FROM grp
WHERE ch.parca_grup_id IS NULL
  AND ch.kaynak_tipi IN ('aidat', 'baslangic_bedeli', 'gecikme_faizi')
  AND ch.cari_hesap_id  IS NOT DISTINCT FROM grp.cari_hesap_id
  AND ch.tarih          IS NOT DISTINCT FROM grp.tarih
  AND ch.odeme_turu     IS NOT DISTINCT FROM grp.odeme_turu
  AND ch.banka_hesap_id IS NOT DISTINCT FROM grp.banka_hesap_id
  AND ch.belge_no       IS NOT DISTINCT FROM grp.belge_no
  AND ch.aciklama       IS NOT DISTINCT FROM grp.aciklama
  AND ch.islem_turu     IS NOT DISTINCT FROM grp.islem_turu;

COMMIT;
