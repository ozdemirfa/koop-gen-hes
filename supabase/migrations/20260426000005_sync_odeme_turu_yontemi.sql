-- Migration: 20260426000003_sync_odeme_turu_yontemi.sql
-- Description: Sync odeme_turu and odeme_yontemi in cari_hareketler and update existing data.

BEGIN;

-- 1. Sync existing data in cari_hareketler
UPDATE public.cari_hareketler
SET odeme_yontemi = 'nakit'::public.odeme_yontemi
WHERE odeme_turu = 'nakit' AND (odeme_yontemi IS NULL OR odeme_yontemi != 'nakit');

UPDATE public.cari_hareketler
SET odeme_yontemi = 'banka'::public.odeme_yontemi
WHERE odeme_turu = 'banka' AND (odeme_yontemi IS NULL OR odeme_yontemi != 'banka');

UPDATE public.cari_hareketler
SET odeme_yontemi = 'cek'::public.odeme_yontemi
WHERE odeme_turu = 'cek' AND (odeme_yontemi IS NULL OR odeme_yontemi != 'cek');

UPDATE public.cari_hareketler
SET odeme_yontemi = 'kredi_karti'::public.odeme_yontemi
WHERE odeme_turu = 'kredi_karti' AND (odeme_yontemi IS NULL OR odeme_yontemi != 'kredi_karti');

-- 2. Create a trigger function to keep them in sync
CREATE OR REPLACE FUNCTION public.fn_sync_cari_odeme_fields()
RETURNS TRIGGER AS $$
BEGIN
    -- If odeme_turu is set but odeme_yontemi is not, or they differ in a way we want to force
    IF NEW.odeme_turu = 'nakit' THEN
        NEW.odeme_yontemi := 'nakit'::public.odeme_yontemi;
    ELSIF NEW.odeme_turu = 'banka' THEN
        NEW.odeme_yontemi := 'banka'::public.odeme_yontemi;
    ELSIF NEW.odeme_turu = 'cek' THEN
        NEW.odeme_yontemi := 'cek'::public.odeme_yontemi;
    ELSIF NEW.odeme_turu = 'kredi_karti' THEN
        NEW.odeme_yontemi := 'kredi_karti'::public.odeme_yontemi;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Attach the trigger
DROP TRIGGER IF EXISTS trg_sync_cari_odeme_fields ON public.cari_hareketler;
CREATE TRIGGER trg_sync_cari_odeme_fields
BEFORE INSERT OR UPDATE ON public.cari_hareketler
FOR EACH ROW EXECUTE FUNCTION public.fn_sync_cari_odeme_fields();

COMMIT;
