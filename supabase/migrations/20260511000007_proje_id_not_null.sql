-- Migration: 20260511000007_proje_id_not_null.sql
-- Description: TASK-DB-04 apply. Production audit (fn_audit_proje_id_nulls) tum
-- 14 nullable proje_id tablosunda NULL count = 0 raporladi. Bu yuzden backfill
-- gerekmiyor; dogrudan ALTER COLUMN ... SET NOT NULL guvenli.
--
-- Audit cikti (2026-05-11, fn_audit_proje_id_nulls + table_type filtreli):
--   aidat_tanimlari    | BASE TABLE | null=0 | total=13
--   aidatlar           | BASE TABLE | null=0 | total=240
--   audit_logs         | BASE TABLE | null=0 | total=273
--   banka_hareketleri  | BASE TABLE | null=0 | total=3
--   banka_hesaplari    | BASE TABLE | null=0 | total=2
--   bloklar            | BASE TABLE | null=0 | total=2
--   cekler             | BASE TABLE | null=0 | total=0
--   faturalar          | BASE TABLE | null=0 | total=8
--   hakedisler         | BASE TABLE | null=0 | total=0
--   irsaliyeler        | BASE TABLE | null=0 | total=0
--   sozlesmeler        | BASE TABLE | null=0 | total=0
--   uyeler             | BASE TABLE | null=0 | total=7
--   aidat_detaylari    | VIEW       | -                  -- skip (NOT NULL view'larda gecersiz)
--   kasa_durumu        | VIEW       | -                  -- skip
--
-- BACKWARDS COMPAT: Zod schema'lari ayri commit'te proje_id required olarak
-- guncellenecek (12 schema). Servis kodu zaten activeProject'ten proje_id
-- aliyor (backend controller'lar). Eski client'lar proje_id'siz POST yaparsa
-- artik 23502 not_null_violation alir.

BEGIN;

-- Sira: total satir sayisi az olanlardan baslayarak ALTER.

ALTER TABLE public.cekler            ALTER COLUMN proje_id SET NOT NULL;
ALTER TABLE public.hakedisler        ALTER COLUMN proje_id SET NOT NULL;
ALTER TABLE public.irsaliyeler       ALTER COLUMN proje_id SET NOT NULL;
ALTER TABLE public.sozlesmeler       ALTER COLUMN proje_id SET NOT NULL;
ALTER TABLE public.bloklar           ALTER COLUMN proje_id SET NOT NULL;
ALTER TABLE public.banka_hesaplari   ALTER COLUMN proje_id SET NOT NULL;
ALTER TABLE public.banka_hareketleri ALTER COLUMN proje_id SET NOT NULL;
ALTER TABLE public.uyeler            ALTER COLUMN proje_id SET NOT NULL;
ALTER TABLE public.faturalar         ALTER COLUMN proje_id SET NOT NULL;
ALTER TABLE public.aidat_tanimlari   ALTER COLUMN proje_id SET NOT NULL;
ALTER TABLE public.audit_logs        ALTER COLUMN proje_id SET NOT NULL;
ALTER TABLE public.aidatlar          ALTER COLUMN proje_id SET NOT NULL;

COMMIT;
