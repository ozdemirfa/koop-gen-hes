-- Migration: 20260419000002_serefiye_bulk_optimize.sql
-- Description: Further optimize serefiye refresh using set-based operations instead of loops.

CREATE OR REPLACE FUNCTION public.reset_serefiye_table(p_proje_id UUID)
RETURNS INTEGER AS $$
DECLARE
    v_count INTEGER := 0;
BEGIN
    -- 1. Safety Check: Occupied units
    IF EXISTS (
        SELECT 1 FROM public.serefiye_tablosu 
        WHERE proje_id = p_proje_id AND durum = 'dolu'
    ) THEN
        RAISE EXCEPTION 'Projede dolu (üye atanmış) daireler bulunmaktadır. Şerefiye tablosu sıfırlanamaz.';
    END IF;

    -- 2. Atomic Delete
    DELETE FROM public.serefiye_tablosu WHERE proje_id = p_proje_id;

    -- 3. Set-based Bulk Insert (Much faster than loops)
    WITH new_rows AS (
        INSERT INTO public.serefiye_tablosu (
            proje_id,
            blok_id,
            daire_sira_no,
            daire_no,
            serefiye_orani,
            durum
        )
        SELECT 
            p_proje_id,
            b.id as blok_id,
            gs.sira as daire_sira_no,
            b.blok_adi || '.' || gs.sira as daire_no,
            1.000 as serefiye_orani,
            'bos' as durum
        FROM public.bloklar b
        CROSS JOIN LATERAL generate_series(
            COALESCE(b.daire_baslangic_no, 1), 
            COALESCE(b.daire_baslangic_no, 1) + b.toplam_daire - 1
        ) AS gs(sira)
        WHERE b.proje_id = p_proje_id
        RETURNING 1
    )
    SELECT count(*) INTO v_count FROM new_rows;

    -- 4. Update project timestamp to trigger frontend refresh if watching
    UPDATE public.projeler SET updated_at = now() WHERE id = p_proje_id;

    RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
