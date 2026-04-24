-- Migration: 20260421000003_auto_cari_hesap_for_new_project.sql
-- Description: Automatically create cari_hesap records for all firms when a new project is created.
-- This ensures that firms can have transactions in any project immediately upon project creation.

BEGIN;

-- 1. Create the trigger function
CREATE OR REPLACE FUNCTION public.fn_auto_create_cari_hesap_for_new_project()
RETURNS TRIGGER AS $$
BEGIN
    -- Tüm mevcut firmalar için yeni proje bazlı cari hesap oluştur
    -- cari_adi olarak firmanın unvanını kullanıyoruz.
    INSERT INTO public.cari_hesaplar (proje_id, cari_adi, cari_turu, firma_id)
    SELECT NEW.id, unvan, 'firma', id 
    FROM public.firmalar
    ON CONFLICT (proje_id, firma_id) DO NOTHING;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION public.fn_auto_create_cari_hesap_for_new_project IS 'Yeni bir proje eklendiğinde tüm mevcut firmalar için otomatik cari hesap oluşturur.';

-- 2. Create the trigger on projeler table
DROP TRIGGER IF EXISTS trg_auto_create_cari_hesap_project ON public.projeler;
CREATE TRIGGER trg_auto_create_cari_hesap_project
AFTER INSERT ON public.projeler
FOR EACH ROW EXECUTE FUNCTION public.fn_auto_create_cari_hesap_for_new_project();

-- 3. Verification of unique constraint
-- 20260421000001 migration'ında oluşturulan unique_proje_firma kısıtlamasının varlığını garanti ediyoruz.
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE table_name = 'cari_hesaplar' AND constraint_name = 'unique_proje_firma'
    ) THEN
        ALTER TABLE public.cari_hesaplar 
        ADD CONSTRAINT unique_proje_firma UNIQUE (proje_id, firma_id);
    END IF;
END $$;

COMMIT;
