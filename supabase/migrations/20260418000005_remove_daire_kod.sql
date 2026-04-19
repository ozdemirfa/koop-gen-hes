-- Migration: 20260418000005_remove_daire_kod.sql
-- Step 4: Remove daire_kod from serefiye_tablosu

-- 1. Tetikleyiciyi kaldır
DROP TRIGGER IF EXISTS trg_generate_daire_kod ON public.serefiye_tablosu;
DROP FUNCTION IF EXISTS public.generate_daire_kod();

-- 2. Kolonu kaldır
ALTER TABLE public.serefiye_tablosu DROP COLUMN IF EXISTS daire_kod;
