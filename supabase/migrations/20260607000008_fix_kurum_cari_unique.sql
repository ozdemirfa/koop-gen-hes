-- Migration: 20260607000008_fix_kurum_cari_unique.sql
-- Sprint: kurumsal-cari-bugfix (2026-06-07)
-- Description: BUG FIX — "Yeni kurum ekle" → 500.
--
-- Kök neden: 20260607000002'de cari_hesaplar (proje_id, kurum_id) için PARTIAL unique
--   index (uq_cari_hesaplar_proje_kurum WHERE kurum_id IS NOT NULL) oluşturulmuştu.
--   Ancak kurum auto-create trigger'ları (fn_auto_create_cari_hesap_for_kurum,
--   fn_auto_create_kurum_cari_for_owner_project) `ON CONFLICT (proje_id, kurum_id)`
--   kullanıyor. PostgreSQL partial index'i WHERE predicate'i olmadan ON CONFLICT'te
--   infer EDEMEZ (42P10) → kurum INSERT'ünün AFTER trigger'ı patlar → 500.
--
-- Fix: partial index'i TAM UNIQUE constraint ile değiştir (firma/üye pattern'i:
--   unique_proje_firma / unique_proje_uye tam constraint, nullable kolonla NULL-distinct
--   olarak sorunsuz yaşar). Trigger gövdeleri değişmez; ON CONFLICT artık infer eder.
--
-- Prod'da kurum create 500 verdiğinden kurumsal cari yok → duplicate riski yok.

BEGIN;

DROP INDEX IF EXISTS public.uq_cari_hesaplar_proje_kurum;

ALTER TABLE public.cari_hesaplar
  ADD CONSTRAINT unique_proje_kurum UNIQUE (proje_id, kurum_id);

COMMENT ON CONSTRAINT unique_proje_kurum ON public.cari_hesaplar IS
  'Proje başına tek kurum carisi. Tam UNIQUE (kurum_id NULL satırlar NULL-distinct → '
  'üye/firma carileri etkilenmez). ON CONFLICT (proje_id, kurum_id) bunu infer eder.';

COMMIT;
