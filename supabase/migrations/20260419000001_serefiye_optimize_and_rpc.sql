-- Migration: 20260419000001_serefiye_optimize_and_rpc.sql
-- Description: Add indexes to serefiye_tablosu and create reset_serefiye_table RPC function.

-- 1. Indexes for performance
-- Speed up deletions and lookups by project and status
CREATE INDEX IF NOT EXISTS idx_serefiye_tablosu_proje_id ON public.serefiye_tablosu(proje_id);
CREATE INDEX IF NOT EXISTS idx_serefiye_tablosu_durum ON public.serefiye_tablosu(durum);

-- 2. Reset Serefiye Table RPC
-- Moves heavy generation logic to database to avoid timeouts
CREATE OR REPLACE FUNCTION public.reset_serefiye_table(p_proje_id UUID)
RETURNS INTEGER AS $$
DECLARE
    v_count INTEGER := 0;
    v_blok RECORD;
    i INTEGER;
    v_daire_no VARCHAR(20);
    v_daire_sira_no INTEGER;
BEGIN
    -- Step 1: Check if any row for the project has 'durum' = 'dolu'
    -- If there are members assigned to units, we must not reset the table.
    IF EXISTS (
        SELECT 1 FROM public.serefiye_tablosu 
        WHERE proje_id = p_proje_id AND durum = 'dolu'
    ) THEN
        RAISE EXCEPTION 'Projede dolu (üye atanmış) daireler bulunmaktadır. Şerefiye tablosu sıfırlanamaz.';
    END IF;

    -- Step 2: Delete all existing rows for the project in 'serefiye_tablosu'
    DELETE FROM public.serefiye_tablosu WHERE proje_id = p_proje_id;

    -- Step 3: Fetch all blocks for the project
    FOR v_blok IN (
        SELECT id, blok_adi, toplam_daire, daire_baslangic_no 
        FROM public.bloklar 
        WHERE proje_id = p_proje_id
        ORDER BY blok_adi
    ) LOOP
        -- Step 4: Generate new rows for each block based on total units
        FOR i IN 0..(v_blok.toplam_daire - 1) LOOP
            v_daire_sira_no := COALESCE(v_blok.daire_baslangic_no, 1) + i;
            v_daire_no := v_blok.blok_adi || '.' || v_daire_sira_no;
            
            INSERT INTO public.serefiye_tablosu (
                proje_id,
                blok_id,
                daire_sira_no,
                daire_no,
                serefiye_orani,
                durum
            ) VALUES (
                p_proje_id,
                v_blok.id,
                v_daire_sira_no,
                v_daire_no,
                1.000, -- Default coefficient
                'bos'
            );
            v_count := v_count + 1;
        END LOOP;
    END LOOP;

    -- Step 5: Return the count of generated rows
    RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Documentation
COMMENT ON FUNCTION public.reset_serefiye_table(UUID) IS 'Proje bazlı şerefiye tablosunu blok tanımlarına göre yeniden oluşturur. Dolu daire varsa hata verir.';
