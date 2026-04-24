-- Migration: 20260421000012_robust_aidat_charging.sql
-- Description: Ensure robust manual and automatic aidat charging functions.

BEGIN;

-- 1. Manual charging function for a specific definition
CREATE OR REPLACE FUNCTION public.fn_charge_aidat_tanimi(p_tanim_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_record RECORD;
    v_daire RECORD;
    v_count INTEGER := 0;
    v_son_odeme_tarihi DATE;
BEGIN
    -- Tanımı getir
    SELECT * INTO v_record FROM public.aidat_tanimlari WHERE id = p_tanim_id;
    
    IF v_record IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Aidat tanımı bulunamadı.');
    END IF;
    
    IF v_record.durum = 'borclandi' THEN
        RETURN jsonb_build_object('success', false, 'message', 'Bu tanım zaten borçlandırılmış.');
    END IF;

    -- Son ödeme tarihini oluştur (Yıl-Ay-Gün)
    v_son_odeme_tarihi := (v_record.yil::TEXT || '-' || v_record.ay::TEXT || '-' || v_record.son_odeme_gunu::TEXT)::DATE;

    -- Her daire (serefiye) için aidat borcu oluştur
    FOR v_daire IN 
        SELECT id FROM public.serefiye_tablosu 
        WHERE proje_id = v_record.proje_id
    LOOP
        INSERT INTO public.aidatlar (
            proje_id, 
            serefiye_id, 
            uye_id, 
            aidat_tanimi_id, 
            son_odeme_tarihi
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

    -- Durumu güncelle
    UPDATE public.aidat_tanimlari 
    SET durum = 'borclandi', updated_at = NOW() 
    WHERE id = p_tanim_id;

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Borçlandırma başarıyla tamamlandı',
        'total_aidat_created', v_count
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Automatic charging function for all pending definitions up to a date
CREATE OR REPLACE FUNCTION public.fn_execute_aidat_charging(p_date DATE DEFAULT CURRENT_DATE)
RETURNS JSONB AS $$
DECLARE
    v_record RECORD;
    v_count INTEGER := 0;
    v_charged_definitions INTEGER := 0;
    v_year INTEGER;
    v_month INTEGER;
    v_res JSONB;
BEGIN
    v_year := EXTRACT(YEAR FROM p_date);
    v_month := EXTRACT(MONTH FROM p_date);

    -- Plan aşamasında olan ve zamanı gelmiş (veya geçmiş) tüm tanımları borçlandır
    FOR v_record IN 
        SELECT id FROM public.aidat_tanimlari
        WHERE durum = 'plan'
        AND (yil < v_year OR (yil = v_year AND ay <= v_month))
        ORDER BY yil, ay
    LOOP
        v_res := public.fn_charge_aidat_tanimi(v_record.id);
        IF (v_res->>'success')::BOOLEAN THEN
            v_charged_definitions := v_charged_definitions + 1;
            v_count := v_count + (v_res->>'total_aidat_created')::INTEGER;
        END IF;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'charged_definitions', v_charged_definitions,
        'total_aidat_created', v_count
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;
