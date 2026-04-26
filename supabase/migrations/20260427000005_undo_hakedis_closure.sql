-- Migration: 20260427000005_undo_hakedis_closure.sql
-- Description: RPC to undo all payment matches for a specific hakedis.

BEGIN;

CREATE OR REPLACE FUNCTION public.fn_undo_hakedis_closure(p_hakedis_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_count INTEGER;
BEGIN
    -- 1. Clear links on all payment movements matched to this hakedis
    UPDATE public.cari_hareketler
    SET kaynak_tipi = NULL, kaynak_id = NULL
    WHERE kaynak_tipi = 'hakedis' 
      AND kaynak_id = p_hakedis_id 
      AND islem_turu != 'hakedis'; -- Only free the payments, keep the accrual linked to itself

    GET DIAGNOSTICS v_count = ROW_COUNT;

    -- 2. Revert hakedis status to 'onaylandi'
    UPDATE public.hakedisler
    SET durum = 'onaylandi'
    WHERE id = p_hakedis_id;

    RETURN jsonb_build_object(
        'success', true, 
        'message', 'Hakediş eşleşmeleri başarıyla kaldırıldı.',
        'freed_payments_count', v_count
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;
