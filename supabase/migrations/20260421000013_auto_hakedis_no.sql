-- Migration: 20260421000013_auto_hakedis_no.sql
-- Description: Automate progress payment numbering per contract.

BEGIN;

CREATE OR REPLACE FUNCTION public.func_generate_hakedis_no()
RETURNS TRIGGER AS $$
DECLARE
    v_max INTEGER;
BEGIN
    IF NEW.hakedis_no IS NULL OR NEW.hakedis_no = 0 THEN
        SELECT COALESCE(MAX(hakedis_no), 0) INTO v_max FROM public.hakedisler 
        WHERE sozlesme_id = NEW.sozlesme_id;
        
        NEW.hakedis_no := v_max + 1;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_generate_hakedis_no ON public.hakedisler;
CREATE TRIGGER trg_generate_hakedis_no
    BEFORE INSERT ON public.hakedisler
    FOR EACH ROW EXECUTE FUNCTION public.func_generate_hakedis_no();

COMMIT;
