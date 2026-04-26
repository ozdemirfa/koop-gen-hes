-- Migration: 20260427000009_reseed_birimler.sql
-- Description: Reseed the units table after cleanup.

BEGIN;

INSERT INTO public.birimler (ad) VALUES 
('Adet'), 
('m2'), 
('m3'), 
('kg'), 
('ton'), 
('Metretül'), 
('Saat'), 
('Gün'), 
('Lumpsum')
ON CONFLICT (ad) DO NOTHING;

COMMIT;
