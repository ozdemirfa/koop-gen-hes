-- Migration: 20260427000004_fix_and_backfill_teminatlar.sql
-- Description: Add RLS policies for birikmis_teminatlar, fix trigger logic and backfill existing data.

BEGIN;

-- 1. Add RLS Policies for birikmis_teminatlar
-- Allow authenticated users to view all records
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'birikmis_teminatlar' AND policyname = 'Allow authenticated users to read guarantees'
    ) THEN
        CREATE POLICY "Allow authenticated users to read guarantees" 
        ON public.birikmis_teminatlar FOR SELECT 
        TO authenticated 
        USING (true);
    END IF;
END $$;

-- 2. Improve the Trigger Function
-- Make it more robust and handle potential nulls
CREATE OR REPLACE FUNCTION public.fn_update_birikmis_teminat()
RETURNS TRIGGER AS $$
DECLARE
    v_proje_id UUID;
    v_firma_id UUID;
    v_teminat_tutari NUMERIC(15,2);
BEGIN
    -- Get project and firm from hakedis
    -- NEW record may already have these, but let's be sure
    v_proje_id := NEW.proje_id;
    v_teminat_tutari := COALESCE(NEW.teminat_kesintisi, 0);
    
    -- Get firma_id from sozlesmeler
    SELECT firma_id INTO v_firma_id FROM public.sozlesmeler WHERE id = NEW.sozlesme_id;

    -- Only proceed if we have all data and it's an approval state
    -- We use a simple aggregate approach for better consistency in the long run,
    -- but for now, we'll keep the incremental logic and fix the current issue.
    
    IF v_proje_id IS NOT NULL AND v_firma_id IS NOT NULL THEN
        -- Re-calculate total guarantee for this firm/project to ensure absolute accuracy
        INSERT INTO public.birikmis_teminatlar (proje_id, firma_id, birikmis_teminat)
        SELECT 
            h.proje_id, 
            s.firma_id, 
            SUM(COALESCE(h.teminat_kesintisi, 0))
        FROM public.hakedisler h
        JOIN public.sozlesmeler s ON h.sozlesme_id = s.id
        WHERE h.proje_id = v_proje_id AND s.firma_id = v_firma_id AND h.durum IN ('onaylandi', 'odendi')
        GROUP BY h.proje_id, s.firma_id
        ON CONFLICT (proje_id, firma_id)
        DO UPDATE SET
            birikmis_teminat = EXCLUDED.birikmis_teminat,
            updated_at = NOW();
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Update the Trigger to fire on any relevant change
DROP TRIGGER IF EXISTS trg_hakedis_teminat_update ON public.hakedisler;
CREATE TRIGGER trg_hakedis_teminat_update
AFTER INSERT OR UPDATE OF durum, teminat_kesintisi ON public.hakedisler
FOR EACH ROW
EXECUTE FUNCTION public.fn_update_birikmis_teminat();

-- 4. Backfill existing data
-- This ensures all previous approved hakedis data is captured
INSERT INTO public.birikmis_teminatlar (proje_id, firma_id, birikmis_teminat)
SELECT 
    h.proje_id, 
    s.firma_id, 
    SUM(COALESCE(h.teminat_kesintisi, 0))
FROM public.hakedisler h
JOIN public.sozlesmeler s ON h.sozlesme_id = s.id
WHERE h.durum IN ('onaylandi', 'odendi')
GROUP BY h.proje_id, s.firma_id
ON CONFLICT (proje_id, firma_id)
DO UPDATE SET
    birikmis_teminat = EXCLUDED.birikmis_teminat,
    updated_at = NOW();

COMMIT;
