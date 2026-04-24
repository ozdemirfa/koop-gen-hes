-- Migration: 20260423000002_add_kdv_to_hakedis.sql
-- Description: Add KDV support to progress payments (hakediş).

BEGIN;

-- 1. Update sozlesme_is_kalemleri to include KDV rate
ALTER TABLE public.sozlesme_is_kalemleri 
ADD COLUMN IF NOT EXISTS kdv_orani NUMERIC(5,2) DEFAULT 20;

-- 2. Update hakedis_kalemleri to include KDV rate
ALTER TABLE public.hakedis_kalemleri 
ADD COLUMN IF NOT EXISTS kdv_orani NUMERIC(5,2) DEFAULT 20;

-- 3. Update hakedisler table structure
-- Renaming brut_tutar to ara_toplam for clarity (exclusive of VAT)
ALTER TABLE public.hakedisler RENAME COLUMN brut_tutar TO ara_toplam;

-- Add kdv_tutar and rename net_tutar to hakedis_toplam if we want to follow user's naming
-- But user said "Hakediş toplam değeri olarak KDVli tutar kullanılacak".
-- In our summary card, we will show this.

ALTER TABLE public.hakedisler ADD COLUMN IF NOT EXISTS kdv_tutar NUMERIC(14,2) DEFAULT 0;

-- We'll keep net_tutar as the final amount after deductions.
-- The user wants to see "Hakediş Toplam" as the VAT-inclusive amount.

COMMIT;
