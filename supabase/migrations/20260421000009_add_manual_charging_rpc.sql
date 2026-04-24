-- Migration: 20260421000009_add_manual_charging_rpc.sql
-- Description: Add a function to manually charge a specific aidat definition.

BEGIN;

CREATE OR REPLACE FUNCTION public.fn_charge_aidat_tanimi(p_tanim_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_record RECORD;
    v_daire RECORD;
    v_count INTEGER := 0;
    v_son_odeme_tarihi DATE;
BEGIN
    -- Tanımı getir ve kontrol et
    SELECT * INTO v_record FROM public.aidat_tanimlari WHERE id = p_tanim_id;
    
    IF v_record IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Aidat tanımı bulunamadı.');
    END IF;
    
    IF v_record.durum = 'borclandi' THEN
        RETURN jsonb_build_object('success', false, 'message', 'Bu tanım zaten borçlandırılmış.');
    END IF;

    v_son_odeme_tarihi := (v_record.yil::TEXT || '-' || v_record.ay::TEXT || '-' || v_record.son_odeme_gunu::TEXT)::DATE;

    -- Her daire (serefiye) için aidat kaydı oluştur
    FOR v_daire IN 
        SELECT id FROM public.serefiye_tablosu 
        WHERE proje_id = v_record.proje_id
    LOOP
        INSERT INTO public.aidatlar (
            proje_id, serefiye_id, uye_id, aidat_tanimi_id, son_odeme_tarihi
        )
        SELECT 
            v_record.proje_id, 
            v_daire.id, 
            (SELECT id FROM public.uyeler WHERE serefiye_id = v_daire.id AND durum = 'aktif' LIMIT 1),
            v_record.id,
            v_son_odeme_tarihi
        ON CONFLICT (serefiye_id, aidat_tanimi_id) DO NOTHING;
        
        v_count := v_count + 1;
    END LOOP;

    -- Tanım durumunu güncelle
    UPDATE public.aidat_tanimlari SET durum = 'borclandi', updated_at = NOW() WHERE id = p_tanim_id;

    RETURN jsonb_build_object(
        'success', true,
        'total_aidat_created', v_count
    );
END;
$$ LANGUAGE plpgsql;

COMMIT;
