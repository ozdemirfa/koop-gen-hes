-- Migration: 20260421000010_auto_sozlesme_and_is_kalemi.sql
-- Description: Automate contract number and work item sequence number generation.

BEGIN;

-- 1. Function for automatic sozlesme_no
CREATE OR REPLACE FUNCTION public.func_generate_sozlesme_no()
RETURNS TRIGGER AS $$
DECLARE
    v_year TEXT;
    v_count INTEGER;
BEGIN
    IF NEW.sozlesme_no IS NULL OR NEW.sozlesme_no = '' THEN
        v_year := TO_CHAR(CURRENT_DATE, 'YYYY');
        -- Mevcut yıl için kaç sözleşme olduğunu say
        SELECT COUNT(*) INTO v_count FROM public.sozlesmeler 
        WHERE sozlesme_no LIKE 'SZ' || v_year || '%';
        
        NEW.sozlesme_no := 'SZ' || v_year || LPAD((v_count + 1)::TEXT, 3, '0');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_generate_sozlesme_no ON public.sozlesmeler;
CREATE TRIGGER trg_generate_sozlesme_no
    BEFORE INSERT ON public.sozlesmeler
    FOR EACH ROW EXECUTE FUNCTION public.func_generate_sozlesme_no();

-- 2. Function for automatic is_kalemi sira_no
CREATE OR REPLACE FUNCTION public.func_generate_is_kalemi_sira_no()
RETURNS TRIGGER AS $$
DECLARE
    v_max INTEGER;
BEGIN
    IF NEW.sira_no IS NULL OR NEW.sira_no = 0 THEN
        SELECT COALESCE(MAX(sira_no), 0) INTO v_max FROM public.sozlesme_is_kalemleri 
        WHERE sozlesme_id = NEW.sozlesme_id;
        
        NEW.sira_no := v_max + 1;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_generate_is_kalemi_sira_no ON public.sozlesme_is_kalemleri;
CREATE TRIGGER trg_generate_is_kalemi_sira_no
    BEFORE INSERT ON public.sozlesme_is_kalemleri
    FOR EACH ROW EXECUTE FUNCTION public.func_generate_is_kalemi_sira_no();

COMMIT;
