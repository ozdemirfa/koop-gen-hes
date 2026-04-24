-- Migration: 20260421000007_sync_member_unit_bidirectional.sql
-- Description: Implement bi-directional synchronization between members (uyeler) and units (serefiye_tablosu).
-- This ensures that when a member is assigned to a unit (or vice-versa), both tables reflect the same relationship.

BEGIN;

-- 1. Ensure unique constraint on uyeler.serefiye_id (if not already present)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'uyeler_serefiye_id_key'
    ) THEN
        ALTER TABLE public.uyeler ADD CONSTRAINT uyeler_serefiye_id_key UNIQUE (serefiye_id);
    END IF;
END $$;

-- 2. Sync Function: serefiye_tablosu -> uyeler
CREATE OR REPLACE FUNCTION public.func_sync_serefiye_to_uye()
RETURNS TRIGGER AS $$
BEGIN
    -- Prevent infinite recursion
    IF pg_trigger_depth() > 1 THEN
        RETURN NEW;
    END IF;

    -- Handle INSERT and UPDATE
    IF (TG_OP = 'INSERT' AND NEW.uye_id IS NOT NULL) OR 
       (TG_OP = 'UPDATE' AND OLD.uye_id IS DISTINCT FROM NEW.uye_id) THEN
        
        -- A. Clear old member's link if it existed
        IF TG_OP = 'UPDATE' AND OLD.uye_id IS NOT NULL THEN
            UPDATE public.uyeler 
            SET serefiye_id = NULL 
            WHERE id = OLD.uye_id AND serefiye_id = OLD.id;
        END IF;

        -- B. Set new member's link
        IF NEW.uye_id IS NOT NULL THEN
            UPDATE public.uyeler 
            SET serefiye_id = NEW.id 
            WHERE id = NEW.uye_id AND (serefiye_id IS DISTINCT FROM NEW.id);
            
            -- Update unit status to 'dolu'
            NEW.durum := 'dolu';
        ELSE
            -- If uye_id was set to NULL, update unit status to 'bos'
            NEW.durum := 'bos';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Sync Function: uyeler -> serefiye_tablosu
CREATE OR REPLACE FUNCTION public.func_sync_uye_to_serefiye()
RETURNS TRIGGER AS $$
BEGIN
    -- Prevent infinite recursion
    IF pg_trigger_depth() > 1 THEN
        RETURN NEW;
    END IF;

    -- Handle INSERT and UPDATE
    IF (TG_OP = 'INSERT' AND NEW.serefiye_id IS NOT NULL) OR 
       (TG_OP = 'UPDATE' AND OLD.serefiye_id IS DISTINCT FROM NEW.serefiye_id) THEN
        
        -- A. Clear old unit's link if it existed
        IF TG_OP = 'UPDATE' AND OLD.serefiye_id IS NOT NULL THEN
            UPDATE public.serefiye_tablosu 
            SET uye_id = NULL,
                durum = 'bos'
            WHERE id = OLD.serefiye_id AND uye_id = OLD.id;
        END IF;

        -- B. Set new unit's link
        IF NEW.serefiye_id IS NOT NULL THEN
            UPDATE public.serefiye_tablosu 
            SET uye_id = NEW.id,
                durum = 'dolu'
            WHERE id = NEW.serefiye_id AND (uye_id IS DISTINCT FROM NEW.id);
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. Create Triggers
DROP TRIGGER IF EXISTS trg_sync_serefiye_to_uye ON public.serefiye_tablosu;
CREATE TRIGGER trg_sync_serefiye_to_uye
    BEFORE INSERT OR UPDATE OF uye_id ON public.serefiye_tablosu
    FOR EACH ROW
    EXECUTE FUNCTION public.func_sync_serefiye_to_uye();

DROP TRIGGER IF EXISTS trg_sync_uye_to_serefiye ON public.uyeler;
CREATE TRIGGER trg_sync_uye_to_serefiye
    AFTER INSERT OR UPDATE OF serefiye_id ON public.uyeler
    FOR EACH ROW
    EXECUTE FUNCTION public.func_sync_uye_to_serefiye();

-- 5. Add Comments
COMMENT ON FUNCTION public.func_sync_serefiye_to_uye() IS 'Serefiye tablosundaki uye atamasını uyeler tablosuyla senkronize eder.';
COMMENT ON FUNCTION public.func_sync_uye_to_serefiye() IS 'Uyeler tablosundaki serefiye atamasını serefiye_tablosu ile senkronize eder.';

COMMIT;
