-- Migration: 20260423000009_fresh_start_cleanup.sql
-- Description: Truncate all data tables for a fresh start, except for configuration/lookup tables like birimler and pozlar.

BEGIN;

-- Structural/Master Tables (Cascade will handle transactional children)
-- We truncate from top to bottom
TRUNCATE TABLE public.projeler CASCADE;
TRUNCATE TABLE public.firmalar CASCADE;
TRUNCATE TABLE public.uyeler CASCADE;
TRUNCATE TABLE public.banka_hesaplari CASCADE;
TRUNCATE TABLE public.gelir_gider_kategorileri CASCADE;
TRUNCATE TABLE public.aidat_tanimlari CASCADE;

-- Transactional tables explicitly (for safety)
TRUNCATE TABLE public.hakedisler CASCADE;
TRUNCATE TABLE public.irsaliyeler CASCADE;
TRUNCATE TABLE public.faturalar CASCADE;
TRUNCATE TABLE public.cari_hareketler CASCADE;
TRUNCATE TABLE public.cekler CASCADE;
TRUNCATE TABLE public.gelir_giderler CASCADE;

COMMIT;
