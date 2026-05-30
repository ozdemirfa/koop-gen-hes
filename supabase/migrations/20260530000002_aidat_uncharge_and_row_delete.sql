-- Migration: 20260530000002_aidat_uncharge_and_row_delete.sql
-- Description: Aidat hatali girdi duzeltme akisi.
--   1) fn_prevent_update_on_borclandi trigger'i gevsetilir: 'borclandi'->'plan'
--      (borclandirmayi geri al) gecisine izin verilir; 'borclandi'->'borclandi'
--      alan guncellemeleri hala engellenir.
--   2) fn_uncharge_aidat_tanimi: bir aidat tanimini borclandirmadan geri alir
--      (tahakkuk + faiz cari hareketlerini ve aidatlar satirlarini siler, tanimi
--      'plan'a dondurur) — YALNIZCA odeme eslestirmesi yoksa. Eslestirme varsa P0001.
--   3) fn_delete_aidat_row: tekil aidat satirini siler — yine odeme eslestirmesi
--      yoksa; eslestirme varsa P0001.
--
-- "Odeme eslestirilmis mi?" testi: cari_hareketler'de ilgili kaynak_id'ler icin
-- borc > 0.009 (FIFO eslesen odeme borc tarafini isaretler). Tahakkuk/faiz satirlari
-- alacak>0, borc=0 oldugundan bunlar serbestce silinir.

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- 1. Trigger gevset: borclandi->plan gecisine izin ver
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_prevent_update_on_borclandi()
RETURNS TRIGGER AS $$
BEGIN
    -- 'borclandi' bir tanimda alan guncellemesi yasak; ANCAK borclandirmayi geri al
    -- (durum 'plan'a doner) icin gecise izin verilir (fn_uncharge_aidat_tanimi).
    IF OLD.durum = 'borclandi' AND NEW.durum = 'borclandi' THEN
        RAISE EXCEPTION 'Borçlandırılmış aidat tanımları üzerinde değişiklik yapılamaz. Önce borçlandırmayı geri alın.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. fn_uncharge_aidat_tanimi — borclandirmayi geri al (tanim/ay bazinda)
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_uncharge_aidat_tanimi(
    p_tanim_id UUID,
    p_actor_id UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_durum TEXT;
    v_paid_count INTEGER;
    v_deleted_cari INTEGER;
    v_deleted_aidat INTEGER;
BEGIN
    PERFORM set_config('app.actor_id', COALESCE(p_actor_id::TEXT, ''), true);

    SELECT durum INTO v_durum FROM public.aidat_tanimlari WHERE id = p_tanim_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Aidat tanımı bulunamadı.' USING ERRCODE = 'P0002';
    END IF;

    IF v_durum <> 'borclandi' THEN
        RETURN jsonb_build_object('success', false, 'message', 'Yalnızca borçlandırılmış tanımlar geri alınabilir.');
    END IF;

    -- Guvenlik: bu tanimin aidatlarina odeme eslestirilmis mi?
    SELECT COUNT(*) INTO v_paid_count
    FROM public.cari_hareketler ch
    WHERE ch.kaynak_tipi IN ('aidat', 'gecikme_faizi')
      AND ch.borc > 0.009
      AND ch.kaynak_id IN (SELECT id FROM public.aidatlar WHERE aidat_tanimi_id = p_tanim_id);

    IF v_paid_count > 0 THEN
        RAISE EXCEPTION 'Bu tanıma ait ödeme eşleştirmesi yapılmış aidatlar var. Önce ilgili ödeme eşleştirmelerini (Tahsilat Eşleşmesini Geri Al) kaldırın.'
            USING ERRCODE = 'P0001';
    END IF;

    -- Tahakkuk + faiz cari hareketlerini sil (alacak tarafi; borc yok)
    DELETE FROM public.cari_hareketler
    WHERE kaynak_tipi IN ('aidat', 'gecikme_faizi')
      AND kaynak_id IN (SELECT id FROM public.aidatlar WHERE aidat_tanimi_id = p_tanim_id);
    GET DIAGNOSTICS v_deleted_cari = ROW_COUNT;

    -- Aidat satirlarini sil
    DELETE FROM public.aidatlar WHERE aidat_tanimi_id = p_tanim_id;
    GET DIAGNOSTICS v_deleted_aidat = ROW_COUNT;

    -- Tanimi plan'a dondur (trigger artik bu gecise izin veriyor)
    UPDATE public.aidat_tanimlari
    SET durum = 'plan', updated_at = now()
    WHERE id = p_tanim_id;

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Borçlandırma geri alındı. Tanım düzenlenebilir/silinebilir.',
        'deleted_cari_hareket', v_deleted_cari,
        'deleted_aidat', v_deleted_aidat
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.fn_uncharge_aidat_tanimi(UUID, UUID) IS
  'Aidat tanimi borclandirmasini geri al: tahakkuk/faiz cari hareketleri + aidatlar '
  'silinir, tanim plan''a doner. Odeme eslestirmesi varsa P0001. p_actor_id audit icin.';

-- ────────────────────────────────────────────────────────────────────────────
-- 3. fn_delete_aidat_row — tekil aidat satiri sil
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_delete_aidat_row(
    p_aidat_id UUID,
    p_actor_id UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_exists BOOLEAN;
    v_paid_count INTEGER;
BEGIN
    PERFORM set_config('app.actor_id', COALESCE(p_actor_id::TEXT, ''), true);

    SELECT EXISTS(SELECT 1 FROM public.aidatlar WHERE id = p_aidat_id) INTO v_exists;
    IF NOT v_exists THEN
        RAISE EXCEPTION 'Aidat bulunamadı.' USING ERRCODE = 'P0002';
    END IF;

    -- Guvenlik: bu aidata odeme eslestirilmis mi?
    SELECT COUNT(*) INTO v_paid_count
    FROM public.cari_hareketler
    WHERE kaynak_id = p_aidat_id
      AND kaynak_tipi IN ('aidat', 'gecikme_faizi')
      AND borc > 0.009;

    IF v_paid_count > 0 THEN
        RAISE EXCEPTION 'Bu aidata ödeme eşleştirilmiş. Önce ödeme eşleştirmesini (Tahsilat Eşleşmesini Geri Al) kaldırın.'
            USING ERRCODE = 'P0001';
    END IF;

    -- Tahakkuk + faiz cari hareketlerini sil
    DELETE FROM public.cari_hareketler
    WHERE kaynak_id = p_aidat_id
      AND kaynak_tipi IN ('aidat', 'gecikme_faizi');

    -- Aidat satirini sil
    DELETE FROM public.aidatlar WHERE id = p_aidat_id;

    RETURN jsonb_build_object('success', true, 'message', 'Aidat kaydı silindi.');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.fn_delete_aidat_row(UUID, UUID) IS
  'Tekil aidat satiri sil (tahakkuk/faiz cari hareketleri ile). Odeme eslestirmesi '
  'varsa P0001. p_actor_id audit icin.';

COMMIT;
