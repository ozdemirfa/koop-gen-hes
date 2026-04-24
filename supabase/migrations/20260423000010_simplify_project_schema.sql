-- Migration: 20260423000010_simplify_project_schema.sql
-- Description: Remove redundant columns from projeler and proje_is_kalemleri tables.

BEGIN;

-- 1. Remove columns from projeler
ALTER TABLE public.projeler DROP COLUMN IF EXISTS daire_kodlama_sistemi;
ALTER TABLE public.projeler DROP COLUMN IF EXISTS daire_sayisi_per_blok;
ALTER TABLE public.projeler DROP COLUMN IF EXISTS blok_sayisi;

-- 2. Remove ust_kalem_id from proje_is_kalemleri (Flat list only)
ALTER TABLE public.proje_is_kalemleri DROP COLUMN IF EXISTS ust_kalem_id;

COMMIT;
