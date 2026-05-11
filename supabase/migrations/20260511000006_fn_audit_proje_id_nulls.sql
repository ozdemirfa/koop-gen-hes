-- Migration: 20260511000006_fn_audit_proje_id_nulls.sql
-- Description: TASK-DB-04 hazirlik. proje_id kolonu olan nullable tablolari
-- runtime'da tarayip NULL count + total satir sayisi donduren RPC.
-- Kalici fonksiyon (DB saglik check icin de yararli olur).
--
-- Kullanim:
--   SELECT * FROM public.fn_audit_proje_id_nulls();
--
-- Auth: SECURITY DEFINER (sadece information_schema + COUNT(*) yapiyor, RLS ile carpismaz).
-- RLS bypass icin authenticated/service_role rolleri icin GRANT EXECUTE veriliyor.

BEGIN;

DROP FUNCTION IF EXISTS public.fn_audit_proje_id_nulls();

CREATE OR REPLACE FUNCTION public.fn_audit_proje_id_nulls()
RETURNS TABLE(tbl TEXT, null_cnt BIGINT, total BIGINT)
AS $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT table_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND column_name = 'proje_id'
      AND is_nullable = 'YES'
    ORDER BY table_name
  LOOP
    RETURN QUERY EXECUTE format(
      'SELECT %L::TEXT, COUNT(*) FILTER (WHERE proje_id IS NULL)::BIGINT, COUNT(*)::BIGINT FROM public.%I',
      r.table_name, r.table_name
    );
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.fn_audit_proje_id_nulls() IS
  'TASK-DB-04 hazirlik: public schema''da proje_id nullable tablolar icin NULL/total sayilari.';

GRANT EXECUTE ON FUNCTION public.fn_audit_proje_id_nulls() TO authenticated, service_role;

COMMIT;
