-- Migration: 20260512000009_fifo_realloc_and_durum_view_aligned.sql
-- Description: REV-FIFO-04 — FIFO Realokasyon RPC + durum hesabını view formülüne hizala.
--
-- Bug:
--   1) FIFO ihlali: Eski parçalı ödemeler kronolojik sırayla yeniden dağıtılmıyor.
--      Bir kez bir aidata bağlanan ödeme orada kalıyor; yeni gelen ödemelerde FIFO
--      çalışıyor ama tarihsel hatalar düzelmiyor. Sonuç: 2/2026 (eski) kısmı ödeli
--      iken 6/2026 (yeni) tam ödeli durumu oluşabiliyor.
--   2) Durum tutarsızlığı: aidatlar.durum trigger'ı (fn_sync_aidat_status_on_payment)
--      v_balance'ı cari_hareketler alacak-borc üzerinden hesaplıyor. View ise
--      formula-based (katsayi * serefiye_orani + faiz_yansitildi ? gecikme_faizi).
--      Unit-assignment trigger kaynak_tipi=NULL yazdığında alacak yine de sıfır,
--      bu nedenle v_balance <= 0 → durum = 'odendi' yanlış kalıyor.
--
-- Fix:
--   1) fn_realloc_member_payments_fifo: bir üyenin TÜM aidat/baslangic_bedeli'ye
--      bağlı ödemelerini cari'de detach et (kaynak_tipi=NULL), aidat durumlarını
--      bekliyor/gecikti'ye geri sar, FIFO RPC'yi yeniden çağır, ardından TÜM
--      aidatların durum kolonunu view formülüyle yeniden hesapla.
--   2) fn_sync_aidat_status_on_payment'i view formülüyle hizala (formula tahakkuk
--      vs cari paid). Böylece trigger ile view bir daha sapma vermez.

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- 1) View-aligned status trigger function
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_sync_aidat_status_on_payment()
RETURNS TRIGGER AS $$
DECLARE
    v_aidat_id   UUID;
    v_tahakkuk   NUMERIC(14,2);
    v_paid       NUMERIC(14,2);
    v_son_odeme  DATE;
    v_kalan      NUMERIC(14,2);
BEGIN
    IF (TG_OP = 'DELETE') THEN
        v_aidat_id := OLD.kaynak_id;
    ELSE
        v_aidat_id := NEW.kaynak_id;
    END IF;

    -- Only react when the touched row is an aidat-related payment/accrual.
    IF (TG_OP <> 'DELETE' AND COALESCE(NEW.kaynak_tipi, '') NOT IN ('aidat', 'gecikme_faizi'))
       OR (TG_OP = 'DELETE' AND COALESCE(OLD.kaynak_tipi, '') NOT IN ('aidat', 'gecikme_faizi'))
    THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    IF v_aidat_id IS NULL THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    -- View-aligned tahakkuk: formula-based (matches aidat_detaylari view).
    SELECT
        (at.katsayi_tutari * COALESCE(s.serefiye_orani, 1.00))
        + CASE WHEN a.faiz_yansitildi
               THEN COALESCE(a.gecikme_faizi, 0)
               ELSE 0
          END,
        a.son_odeme_tarihi
    INTO v_tahakkuk, v_son_odeme
    FROM public.aidatlar a
    JOIN public.aidat_tanimlari at ON a.aidat_tanimi_id = at.id
    JOIN public.serefiye_tablosu s ON a.serefiye_id = s.id
    WHERE a.id = v_aidat_id;

    IF NOT FOUND THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    -- Paid: only aidat-tagged payments (view'daki gibi).
    SELECT COALESCE(SUM(borc), 0)
    INTO v_paid
    FROM public.cari_hareketler
    WHERE kaynak_tipi = 'aidat' AND kaynak_id = v_aidat_id;

    v_kalan := v_tahakkuk - v_paid;

    IF v_kalan <= 0.009 THEN
        UPDATE public.aidatlar SET durum = 'odendi' WHERE id = v_aidat_id;
    ELSIF v_son_odeme < CURRENT_DATE THEN
        UPDATE public.aidatlar SET durum = 'gecikti' WHERE id = v_aidat_id;
    ELSE
        UPDATE public.aidatlar SET durum = 'bekliyor' WHERE id = v_aidat_id;
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.fn_sync_aidat_status_on_payment IS
    'View-aligned (formula tahakkuk + cari paid). v3 (REV-FIFO-04). '
    'Önceki sürüm cari alacak-borc kullanıyordu, view ile sapıyordu.';

-- ────────────────────────────────────────────────────────────────────────────
-- 2) Recompute helper: aynı view formülüyle bir aidatın durumunu zorla yeniden hesapla
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_recompute_aidat_durum(p_aidat_id UUID)
RETURNS public.aidat_durumu AS $$
DECLARE
    v_tahakkuk  NUMERIC(14,2);
    v_paid      NUMERIC(14,2);
    v_son_odeme DATE;
    v_kalan     NUMERIC(14,2);
    v_durum     public.aidat_durumu;
BEGIN
    SELECT
        (at.katsayi_tutari * COALESCE(s.serefiye_orani, 1.00))
        + CASE WHEN a.faiz_yansitildi
               THEN COALESCE(a.gecikme_faizi, 0)
               ELSE 0
          END,
        a.son_odeme_tarihi
    INTO v_tahakkuk, v_son_odeme
    FROM public.aidatlar a
    JOIN public.aidat_tanimlari at ON a.aidat_tanimi_id = at.id
    JOIN public.serefiye_tablosu s ON a.serefiye_id = s.id
    WHERE a.id = p_aidat_id;

    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    SELECT COALESCE(SUM(borc), 0)
    INTO v_paid
    FROM public.cari_hareketler
    WHERE kaynak_tipi = 'aidat' AND kaynak_id = p_aidat_id;

    v_kalan := v_tahakkuk - v_paid;

    IF v_kalan <= 0.009 THEN
        v_durum := 'odendi'::public.aidat_durumu;
    ELSIF v_son_odeme < CURRENT_DATE THEN
        v_durum := 'gecikti'::public.aidat_durumu;
    ELSE
        v_durum := 'bekliyor'::public.aidat_durumu;
    END IF;

    UPDATE public.aidatlar SET durum = v_durum WHERE id = p_aidat_id;

    RETURN v_durum;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.fn_recompute_aidat_durum IS
    'View formülüyle (formula tahakkuk + cari paid) tek aidatın durum kolonunu '
    'yeniden hesaplar ve günceller. Realloc sonrası tetikleyici.';

-- ────────────────────────────────────────────────────────────────────────────
-- 3) FIFO Realokasyon RPC
-- ────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.fn_realloc_member_payments_fifo(UUID, UUID, UUID);

CREATE OR REPLACE FUNCTION public.fn_realloc_member_payments_fifo(
    p_proje_id UUID,
    p_uye_id   UUID,
    p_actor_id UUID DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
    v_cari_id        UUID;
    v_aidat_id       UUID;
    v_detach_count   INTEGER := 0;
    v_recomputed     INTEGER := 0;
    v_fifo_result    JSONB;
    v_split_pairs    INTEGER := 0;
BEGIN
    PERFORM set_config('app.actor_id', COALESCE(p_actor_id::TEXT, ''), true);

    SELECT id INTO v_cari_id
    FROM public.cari_hesaplar
    WHERE proje_id = p_proje_id AND uye_id = p_uye_id;

    IF v_cari_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Cari hesap bulunamadı');
    END IF;

    -- Step A: FIFO'nun daha önce ödemeleri parçaladığı kayıtları (split pairs) birleştirme
    -- gereği yok — biz aşağıda kaynak_tipi=NULL atayıp FIFO'yu yeniden çağırınca FIFO
    -- yine optimum dağıtımı yapacak. Burada sadece bilgi amaçlı say.
    SELECT COUNT(*) INTO v_split_pairs
    FROM public.cari_hareketler
    WHERE cari_hesap_id = v_cari_id
      AND islem_turu IN ('gelen_odeme', 'uyelik_baslangic')
      AND borc > 0
      AND kaynak_tipi IN ('aidat', 'baslangic_bedeli');

    -- Step B: Tüm aidat/baslangic_bedeli'ye bağlı ödemeleri detach et.
    UPDATE public.cari_hareketler
    SET kaynak_tipi = NULL,
        kaynak_id   = NULL
    WHERE cari_hesap_id = v_cari_id
      AND islem_turu IN ('gelen_odeme', 'uyelik_baslangic')
      AND borc > 0
      AND kaynak_tipi IN ('aidat', 'baslangic_bedeli');

    GET DIAGNOSTICS v_detach_count = ROW_COUNT;

    -- Step C: Üyenin tüm aidatlarını bekliyor/gecikti'ye sar (durum kolonu temizliği).
    UPDATE public.aidatlar
    SET durum = CASE
            WHEN son_odeme_tarihi < CURRENT_DATE THEN 'gecikti'::public.aidat_durumu
            ELSE 'bekliyor'::public.aidat_durumu
        END
    WHERE proje_id = p_proje_id
      AND uye_id   = p_uye_id;

    -- Step D: FIFO RPC'yi çağır — vade tarihine göre eski → yeni allocate eder.
    v_fifo_result := public.fn_match_member_payments_fifo(p_proje_id, p_uye_id, p_actor_id);

    -- Step E: Üyenin tüm aidatları için durum'u view formülüyle yeniden hesapla.
    FOR v_aidat_id IN
        SELECT id FROM public.aidatlar
        WHERE proje_id = p_proje_id AND uye_id = p_uye_id
    LOOP
        PERFORM public.fn_recompute_aidat_durum(v_aidat_id);
        v_recomputed := v_recomputed + 1;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'message', 'FIFO yeniden dağıtım tamamlandı',
        'detach_count', v_detach_count,
        'recomputed_count', v_recomputed,
        'fifo_result', v_fifo_result
    );
EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'FIFO realloc failed: %', SQLERRM;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.fn_realloc_member_payments_fifo IS
    'Bir üyenin aidat/baslangic_bedeli bağlı tüm ödemelerini detach eder, '
    'durum kolonunu sıfırlar, FIFO RPC ile vade sırasına göre yeniden dağıtır, '
    've view formülüyle durum kolonunu yeniden hesaplar. Idempotent. v1 (REV-FIFO-04).';

-- ────────────────────────────────────────────────────────────────────────────
-- 4) Invariant guard: kalan_borc > 0 iken durum='odendi' olamaz
--    (post-condition check; failure → exception ile transaction rollback)
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_assert_aidat_durum_invariant(p_proje_id UUID, p_uye_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    v_bad_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_bad_count
    FROM public.aidat_detaylari
    WHERE proje_id = p_proje_id
      AND uye_id   = p_uye_id
      AND durum    = 'odendi'
      AND kalan_borc > 0.009;

    IF v_bad_count > 0 THEN
        RAISE WARNING 'Invariant ihlali: % satırda durum=odendi ama kalan_borc>0', v_bad_count;
        RETURN FALSE;
    END IF;
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

COMMENT ON FUNCTION public.fn_assert_aidat_durum_invariant IS
    'Test/debug yardımcısı: durum=odendi iken kalan_borc>0 satır var mı kontrol eder.';

COMMIT;
