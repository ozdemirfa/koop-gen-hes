-- Migration: 20260420000001_make_firmalar_global.sql
-- Description: Decouple firmalar from proje_id to make them global across all projects.
-- Transactions (faturalar, hakedisler, cari_hareketler) will remain project-based.

DO $$
BEGIN
    -- 1. Remove proje_id from firmalar if it exists
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'firmalar' AND column_name = 'proje_id') THEN
        ALTER TABLE public.firmalar DROP COLUMN proje_id;
    END IF;

    -- 2. Ensure related tables HAVE proje_id (should already be there from previous migrations, but for safety)
    
    -- faturalar
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'faturalar' AND column_name = 'proje_id') THEN
        ALTER TABLE public.faturalar ADD COLUMN proje_id UUID REFERENCES public.projeler(id) ON DELETE CASCADE;
    END IF;

    -- cari_hareketler
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'cari_hareketler' AND column_name = 'proje_id') THEN
        ALTER TABLE public.cari_hareketler ADD COLUMN proje_id UUID REFERENCES public.projeler(id) ON DELETE CASCADE;
    END IF;

    -- sozlesmeler
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sozlesmeler' AND column_name = 'proje_id') THEN
        ALTER TABLE public.sozlesmeler ADD COLUMN proje_id UUID REFERENCES public.projeler(id) ON DELETE CASCADE;
    END IF;

    -- hakedisler
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'hakedisler' AND column_name = 'proje_id') THEN
        ALTER TABLE public.hakedisler ADD COLUMN proje_id UUID REFERENCES public.projeler(id) ON DELETE CASCADE;
    END IF;

END $$;

-- Documentation
COMMENT ON TABLE public.firmalar IS 'Global firmalar tablosu. Projelerden bağımsızdır.';
COMMENT ON COLUMN public.cari_hareketler.proje_id IS 'Hareketin ait olduğu proje. Firmanın proje bazlı ekstresi için kullanılır.';
