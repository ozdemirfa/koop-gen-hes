-- Migration: 20260427000006_robust_undo_status_reversion.sql
-- Description: Improve undo matching RPC to correctly revert aidat status using robust calculation.

BEGIN;

CREATE OR REPLACE FUNCTION public.fn_undo_payment_match(p_movement_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_kaynak_tipi TEXT;
    v_kaynak_id UUID;
    v_aidat_status public.aidat_durumu;
    v_son_odeme_tarihi DATE;
    v_total_paid NUMERIC(14,2);
    v_total_due NUMERIC(14,2);
    v_is_matched BOOLEAN;
BEGIN
    -- 1. Get current match info
    SELECT kaynak_tipi, kaynak_id, (kaynak_id IS NOT NULL)
    INTO v_kaynak_tipi, v_kaynak_id, v_is_matched
    FROM public.cari_hareketler
    WHERE id = p_movement_id;

    IF NOT v_is_matched THEN
        RETURN jsonb_build_object('success', false, 'message', 'Bu hareket zaten bir eşleşmeye sahip değil.');
    END IF;

    -- 2. Clear match in cari_hareketler
    UPDATE public.cari_hareketler
    SET kaynak_tipi = NULL, kaynak_id = NULL
    WHERE id = p_movement_id;

    -- 3. Update target record status
    IF v_kaynak_tipi = 'aidat' THEN
        -- Use the same logic as aidat_detaylari view to determine status
        SELECT 
            toplam_tahakkuk, 
            son_odeme_tarihi,
            toplam_odenen
        INTO v_total_due, v_son_odeme_tarihi, v_total_paid
        FROM public.aidat_detaylari
        WHERE id = v_kaynak_id;

        IF v_total_paid < v_total_due THEN
            v_aidat_status := CASE
                WHEN v_son_odeme_tarihi < CURRENT_DATE THEN 'gecikti'::public.aidat_durumu
                ELSE 'bekliyor'::public.aidat_durumu
            END;

            UPDATE public.aidatlar
            SET durum = v_aidat_status
            WHERE id = v_kaynak_id;
        END IF;

    ELSIF v_kaynak_tipi = 'hakedis' THEN
        -- Revert hakedis to 'onaylandi'
        UPDATE public.hakedisler
        SET durum = 'onaylandi'
        WHERE id = v_kaynak_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true, 
        'message', 'Eşleşme başarıyla kaldırıldı',
        'kaynak_tipi', v_kaynak_tipi,
        'kaynak_id', v_kaynak_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;
