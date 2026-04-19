-- Migration: 20260418000007_fix_yillik_plan_cascade.sql
-- Harcama kalemi silindiğinde plan satırlarının da silinmesini sağlar.

ALTER TABLE public.yillik_plan_kalemleri 
DROP CONSTRAINT IF EXISTS yillik_plan_kalemleri_proje_is_kalemi_id_fkey;

ALTER TABLE public.yillik_plan_kalemleri
ADD CONSTRAINT yillik_plan_kalemleri_proje_is_kalemi_id_fkey 
FOREIGN KEY (proje_is_kalemi_id) 
REFERENCES public.proje_is_kalemleri(id) 
ON DELETE CASCADE;
