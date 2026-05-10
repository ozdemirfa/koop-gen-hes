-- Migration: 20260510000017_audit_actor_session_var.sql
-- Description: Audit log actor_id'yi session variable'dan okuyacak şekilde helper ekle.
-- Backend her mutate öncesi `SELECT set_config('app.actor_id', '<uuid>', true)` çağırır.
--
-- NOTE: The original task requested filename 20260510000015, but that sequence number
-- is already taken by devir_islem_turleri.sql. Using 00017 instead (next available).
--
-- Bu migration mevcut fn_audit_log trigger'ına DOKUNMAZ.
-- Sadece fn_get_session_actor() helper'ı ekler.
-- Trigger entegrasyonu sonraki sprint'te ayrı migration ile yapılacak.

CREATE OR REPLACE FUNCTION public.fn_get_session_actor()
RETURNS UUID
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_actor UUID;
BEGIN
    -- Önce auth.uid() (RLS context'inden gelir)
    v_actor := auth.uid();
    IF v_actor IS NOT NULL THEN RETURN v_actor; END IF;

    -- Sonra session variable (service-role akışı için)
    BEGIN
        v_actor := NULLIF(current_setting('app.actor_id', true), '')::UUID;
    EXCEPTION WHEN OTHERS THEN
        v_actor := NULL;
    END;

    RETURN v_actor;
END;
$$;

COMMENT ON FUNCTION public.fn_get_session_actor IS
    'Audit log için actor UUID döndürür. Önce auth.uid() (RLS), sonra app.actor_id session var (service-role). Backend SET LOCAL ile actor geçmediyse NULL döner.';
