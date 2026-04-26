-- Migration: 20260424000007_fix_zero_interest_rate.sql
-- Description: Set default 5% interest rate for existing definitions and recalculate.

BEGIN;

-- 1. Disable the protection trigger temporarily
ALTER TABLE public.aidat_tanimlari DISABLE TRIGGER trg_prevent_update_on_borclandi;

-- 2. Update interest rates from 0 to 5%
UPDATE public.aidat_tanimlari 
SET gecikme_faiz_orani = 5 
WHERE gecikme_faiz_orani = 0;

-- 3. Re-enable the trigger
ALTER TABLE public.aidat_tanimlari ENABLE TRIGGER trg_prevent_update_on_borclandi;

-- 4. Run global interest calculation for all projects
-- This will update aidatlar.gecikme_faizi based on the new 5% rate
SELECT public.hesapla_gecikme_faizi();

COMMIT;
