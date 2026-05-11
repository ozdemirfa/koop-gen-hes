-- Migration: 20260512000004_fn_undo_aidat_closure.sql
-- Description: A3 (sprint 20260511-uye-tahsilat-firma-revisions) — aidat satırı
-- bazında toplu undo. Verilen aidat_id'e bağlı (kaynak_tipi='aidat', kaynak_id=p_aidat_id)
-- tüm cari_hareketler kayıtlarının eşleştirmesini temizler, ardından aidat
-- durumunu yeniden hesaplar (aidat_detaylari view'ından okuyarak).
--
-- Tek-hareket undo (fn_undo_payment_match) tek bir movement_id alır. Bu RPC ise
-- bir aidata bağlı n adet eşleşmeyi tek transaction'da çözer — UI'da "aidat satırı
-- kapama iptal" akışı için.
--
-- Audit pattern (20260511000001/3 ile uyumlu):
--   - p_actor_id DEFAULT NULL geriye uyumluluk için
--   - set_config('app.actor_id', ...) audit trigger'ı için
--
-- Push edilmedi — kullanıcı manuel `supabase db push` ile uygulayacak.

BEGIN;

CREATE OR REPLACE FUNCTION public.fn_undo_aidat_closure(
  p_aidat_id UUID,
  p_actor_id UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_aidat_status public.aidat_durumu;
    v_son_odeme_tarihi DATE;
    v_total_paid NUMERIC(14,2);
    v_total_due NUMERIC(14,2);
    v_cleared_count INT;
BEGIN
    -- Audit actor binding
    PERFORM set_config('app.actor_id', COALESCE(p_actor_id::TEXT, ''), true);

    -- 1. Aidat var mı?
    IF NOT EXISTS (SELECT 1 FROM public.aidatlar WHERE id = p_aidat_id) THEN
        RETURN jsonb_build_object('success', false, 'message', 'Aidat kaydı bulunamadı.');
    END IF;

    -- 2. Bu aidata bağlı tüm eşleşmeleri temizle (cari_hareketler.kaynak_id)
    UPDATE public.cari_hareketler
    SET kaynak_tipi = NULL,
        kaynak_id   = NULL
    WHERE kaynak_tipi = 'aidat'
      AND kaynak_id   = p_aidat_id;

    GET DIAGNOSTICS v_cleared_count = ROW_COUNT;

    IF v_cleared_count = 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'Bu aidat satırına bağlı kapama (eşleşme) bulunamadı.'
        );
    END IF;

    -- 3. Aidat durumunu yeniden hesapla (aidat_detaylari view'ından)
    SELECT toplam_tahakkuk, son_odeme_tarihi, toplam_odenen
    INTO v_total_due, v_son_odeme_tarihi, v_total_paid
    FROM public.aidat_detaylari
    WHERE id = p_aidat_id;

    IF v_total_paid IS NULL OR v_total_paid < COALESCE(v_total_due, 0) THEN
        v_aidat_status := CASE
            WHEN v_son_odeme_tarihi < CURRENT_DATE THEN 'gecikti'::public.aidat_durumu
            ELSE 'bekliyor'::public.aidat_durumu
        END;

        UPDATE public.aidatlar
        SET durum = v_aidat_status
        WHERE id = p_aidat_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'message', format('%s eşleşme kaldırıldı, aidat durumu güncellendi.', v_cleared_count),
        'cleared_count', v_cleared_count,
        'aidat_id', p_aidat_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.fn_undo_aidat_closure(UUID, UUID) IS
'A3 sprint 20260511-uye-tahsilat-firma-revisions: Aidat satırı bazında toplu undo. '
'cari_hareketler.kaynak_id=p_aidat_id olan tüm eşleşmeleri temizler, aidat durumunu yeniden hesaplar.';

COMMIT;
