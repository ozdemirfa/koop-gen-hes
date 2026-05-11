-- Migration: 20260511000004_audit_actor_firm_fifo.sql
-- Description: TASK-DB-03 son madde. fn_match_firm_payments_fifo'ya p_actor_id
-- parametresi + set_config('app.actor_id', ...) cagrisi ekler. Boylece firma
-- tarafi FIFO eslestirmeleri de audit_logs.actor_id dolu olarak kayda gecer.
--
-- Ayrica fn_match_project_payments_fifo'nun firma FIFO call-site'i p_actor_id'yi
-- ileri tasıyacak sekilde guncellenir (parent zaten p_actor_id aliyor; alt cagriya
-- ileti edilir).
--
-- Pattern referansi:
--   20260511000003_audit_actor_remaining_rpcs.sql (13 RPC'lik master pattern)
--
-- Geriye uyumluluk: p_actor_id DEFAULT NULL — eski (proje_id, firma_id) cagrilari
-- bozulmaz; sadece audit aktoru NULL kalir (onceki davranisla aynı).

BEGIN;

-- =====================================================================
-- 1. fn_match_firm_payments_fifo
-- Onceki imza: fn_match_firm_payments_fifo(UUID, UUID) -- 20260428000001
-- =====================================================================
DROP FUNCTION IF EXISTS public.fn_match_firm_payments_fifo(UUID, UUID);
CREATE OR REPLACE FUNCTION public.fn_match_firm_payments_fifo(
    p_proje_id UUID,
    p_firma_id UUID,
    p_actor_id UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_total_unmatched_payment NUMERIC(14,2) := 0;
    v_hakedis RECORD;
    v_payment RECORD;
    v_match_amount NUMERIC(14,2);
    v_matched_count INTEGER := 0;
    v_cari_id UUID;
    v_unmatched_movements CURSOR FOR
        SELECT ch.id, ch.alacak as tutar, ch.tarih, ch.aciklama, ch.odeme_turu, ch.banka_hesap_id, ch.belge_no
        FROM public.cari_hareketler ch
        JOIN public.cari_hesaplar c ON ch.cari_hesap_id = c.id
        WHERE c.proje_id = p_proje_id
          AND c.firma_id = p_firma_id
          AND ch.islem_turu = 'giden_odeme'
          AND ch.kaynak_tipi IS NULL
        ORDER BY ch.tarih ASC, ch.created_at ASC;
BEGIN
    PERFORM set_config('app.actor_id', COALESCE(p_actor_id::TEXT, ''), true);

    -- 1. Get Cari ID
    SELECT id INTO v_cari_id FROM public.cari_hesaplar WHERE proje_id = p_proje_id AND firma_id = p_firma_id;
    IF v_cari_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Cari hesap bulunamadı');
    END IF;

    -- 2. Process each unmatched payment movement
    FOR v_payment IN v_unmatched_movements LOOP
        v_total_unmatched_payment := v_payment.tutar;

        WHILE v_total_unmatched_payment > 0 LOOP
            -- Find the oldest unpaid hakedis
            SELECT
                h.id,
                h.hakedis_toplam,
                COALESCE((SELECT SUM(alacak) FROM public.cari_hareketler WHERE kaynak_tipi = 'hakedis' AND kaynak_id = h.id), 0) as odenen_tutar
            INTO v_hakedis
            FROM public.hakedisler h
            JOIN public.sozlesmeler s ON h.sozlesme_id = s.id
            WHERE h.proje_id = p_proje_id
              AND s.firma_id = p_firma_id
              AND h.durum IN ('onaylandi')
            ORDER BY h.created_at ASC
            LIMIT 1;

            IF v_hakedis IS NULL THEN
                EXIT;
            END IF;

            v_match_amount := LEAST(v_total_unmatched_payment, (v_hakedis.hakedis_toplam - v_hakedis.odenen_tutar));

            IF v_match_amount <= 0 THEN
                EXIT;
            END IF;

            IF v_total_unmatched_payment = v_match_amount THEN
                UPDATE public.cari_hareketler
                SET kaynak_tipi = 'hakedis', kaynak_id = v_hakedis.id
                WHERE id = v_payment.id;
                v_total_unmatched_payment := 0;
            ELSE
                UPDATE public.cari_hareketler
                SET alacak = v_match_amount, kaynak_tipi = 'hakedis', kaynak_id = v_hakedis.id
                WHERE id = v_payment.id;

                INSERT INTO public.cari_hareketler (
                    proje_id, cari_hesap_id, islem_turu, odeme_turu, tarih, borc, alacak, aciklama, belge_no, banka_hesap_id
                ) VALUES (
                    p_proje_id, v_cari_id, 'giden_odeme', v_payment.odeme_turu, v_payment.tarih,
                    0, (v_total_unmatched_payment - v_match_amount), v_payment.aciklama, v_payment.belge_no, v_payment.banka_hesap_id
                ) RETURNING id INTO v_payment.id;

                v_total_unmatched_payment := (v_total_unmatched_payment - v_match_amount);
            END IF;

            IF (v_hakedis.odenen_tutar + v_match_amount) >= v_hakedis.hakedis_toplam THEN
                UPDATE public.hakedisler SET durum = 'odendi' WHERE id = v_hakedis.id;
            END IF;

            v_matched_count := v_matched_count + 1;
        END LOOP;
    END LOOP;

    RETURN jsonb_build_object('success', true, 'message', 'FIFO eşleştirme tamamlandı', 'matched_count', v_matched_count);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.fn_match_firm_payments_fifo(UUID, UUID, UUID) IS
  'Firma bazli FIFO odeme eslestirme (hakedis kapama). p_actor_id verilirse'
  ' app.actor_id session var set edilir; audit trigger bu degeri okur.';

-- =====================================================================
-- 2. fn_match_project_payments_fifo — call-site update for firm path
-- Onceki imza: fn_match_project_payments_fifo(UUID, UUID) -- 20260511000003
--
-- Bu RPC firma FIFO'yu cagiriyor; o cagrida p_actor_id'yi ilerletmek icin
-- body'yi yeniden yaziyoruz. uye FIFO call-site'i degismedi (zaten dogru).
-- =====================================================================
DROP FUNCTION IF EXISTS public.fn_match_project_payments_fifo(UUID, UUID);
CREATE OR REPLACE FUNCTION public.fn_match_project_payments_fifo(
  p_proje_id UUID,
  p_actor_id UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_uye RECORD;
    v_firma RECORD;
    v_total_matched INTEGER := 0;
    v_res JSONB;
BEGIN
    PERFORM set_config('app.actor_id', COALESCE(p_actor_id::TEXT, ''), true);

    -- 1. Match for all members (p_actor_id'yi alt RPC'ye geciyoruz)
    FOR v_uye IN SELECT id FROM public.uyeler WHERE proje_id = p_proje_id AND durum = 'aktif' LOOP
        v_res := public.fn_match_member_payments_fifo(p_proje_id, v_uye.id, p_actor_id);
        v_total_matched := v_total_matched + COALESCE((v_res->>'matched_count')::INTEGER, 0);
    END LOOP;

    -- 2. Match for all firms (p_actor_id'yi alt RPC'ye geciyoruz — TASK-DB-03 closure)
    FOR v_firma IN SELECT DISTINCT firma_id FROM public.cari_hesaplar WHERE proje_id = p_proje_id AND cari_turu = 'firma' AND firma_id IS NOT NULL LOOP
        v_res := public.fn_match_firm_payments_fifo(p_proje_id, v_firma.firma_id, p_actor_id);
        v_total_matched := v_total_matched + COALESCE((v_res->>'matched_count')::INTEGER, 0);
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Proje bazlı FIFO eşleştirme tamamlandı',
        'total_matched_count', v_total_matched
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.fn_match_project_payments_fifo(UUID, UUID) IS
  'Proje bazli FIFO eslestirme (uye + firma). p_actor_id verilirse app.actor_id'
  ' session var set edilir + her iki alt RPC''ye iletilir.';

COMMIT;
