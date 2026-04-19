-- Migration: 20260419000003_add_m2_oda_sayisi_to_serefiye.sql
-- Description: Add m2 and oda_sayisi columns to serefiye_tablosu and update reset_serefiye_table RPC.

-- 1. Add new columns to serefiye_tablosu
ALTER TABLE public.serefiye_tablosu 
ADD COLUMN IF NOT EXISTS m2 NUMERIC(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS oda_sayisi VARCHAR(20) DEFAULT NULL;

COMMENT ON COLUMN public.serefiye_tablosu.m2 IS 'Dairenin brüt/net metrekaresi';
COMMENT ON COLUMN public.serefiye_tablosu.oda_sayisi IS 'Dairenin oda sayısı (örn: 3+1, 2+1)';

-- 2. Update reset_serefiye_table RPC function to handle new columns
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

    -- 3. Set-based Bulk Insert
    WITH new_rows AS (
        INSERT INTO public.serefiye_tablosu (
            proje_id,
            blok_id,
            daire_sira_no,
            daire_no,
            serefiye_orani,
            durum,
            m2,
            oda_sayisi
        )
        SELECT 
            p_proje_id,
            b.id as blok_id,
            gs.sira as daire_sira_no,
            b.blok_adi || '.' || gs.sira as daire_no,
            1.000 as serefiye_orani,
            'bos' as durum,
            0 as m2,
            NULL as oda_sayisi
        FROM public.bloklar b
        CROSS JOIN LATERAL generate_series(
            COALESCE(b.daire_baslangic_no, 1), 
            COALESCE(b.daire_baslangic_no, 1) + b.toplam_daire - 1
        ) AS gs(sira)
        WHERE b.proje_id = p_proje_id
        RETURNING 1
    )
    SELECT count(*) INTO v_count FROM new_rows;

    -- 4. Update project timestamp
    UPDATE public.projeler SET updated_at = now() WHERE id = p_proje_id;

    RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.reset_serefiye_table(UUID) IS 'Proje bazlı şerefiye tablosunu blok tanımlarına göre yeniden oluşturur. Yeni kolonları (m2, oda_sayisi) varsayılan değerlerle başlatır.';
