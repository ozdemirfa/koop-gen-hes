-- Migration: 20260427000003_undo_closure_mechanism.sql
-- Description: Implement RPC to undo payment matching (closures) for dues and hakedis.

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
BEGIN
    -- 1. Get current match info
    SELECT kaynak_tipi, kaynak_id 
    INTO v_kaynak_tipi, v_kaynak_id
    FROM public.cari_hareketler
    WHERE id = p_movement_id;

    IF v_kaynak_tipi IS NULL OR v_kaynak_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Bu hareket zaten bir eşleşmeye sahip değil.');
    END IF;

    -- 2. Clear match in cari_hareketler
    UPDATE public.cari_hareketler
    SET kaynak_tipi = NULL, kaynak_id = NULL
    WHERE id = p_movement_id;

    -- 3. Update target record status
    IF v_kaynak_tipi = 'aidat' THEN
        -- Re-calculate status based on remaining payments
        SELECT 
            ((at.katsayi_tutari * COALESCE(s.serefiye_orani, 1.00)) + 
             CASE WHEN a.faiz_yansitildi THEN COALESCE(a.gecikme_faizi, 0) ELSE 0 END) as total_due,
            a.son_odeme_tarihi
        INTO v_total_due, v_son_odeme_tarihi
        FROM public.aidatlar a
        JOIN public.aidat_tanimlari at ON a.aidat_tanimi_id = at.id
        JOIN public.serefiye_tablosu s ON a.serefiye_id = s.id
        WHERE a.id = v_kaynak_id;

        SELECT COALESCE(SUM(borc), 0) INTO v_total_paid -- Project Perspective: BORC is payment
        FROM public.cari_hareketler
        WHERE kaynak_tipi = 'aidat' AND kaynak_id = v_kaynak_id;

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
        -- Simply revert hakedis to 'onaylandi' (matching for hakedis is manual or 1-to-1)
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
