-- Migration: 20260510000016_default_user_role_trigger.sql
-- Description:
--   1) Mark seed_all_users_admin as a one-shot data migration (documentation only).
--   2) Add a trigger so new auth.users INSERTs get role='staff' by default.
--      Existing users untouched. Admin promotion is manual.
--   3) This DOES NOT downgrade any currently-admin user — admin needs to do that
--      via UPDATE user_roles. See README-admin-rollback.md in this directory.
--
-- NOTE: The original task requested filename 20260510000014, but that sequence number
-- is already taken by yillik_plan_adet_birim_fiyat.sql. Using 00016 instead (next available).

-- 1. Trigger function: new users default to 'staff' role
CREATE OR REPLACE FUNCTION public.fn_default_user_role()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'staff')
    ON CONFLICT (user_id, role) DO NOTHING;
    RETURN NEW;
END;
$$;

-- 2. Trigger on auth.users
DROP TRIGGER IF EXISTS trg_default_user_role ON auth.users;
CREATE TRIGGER trg_default_user_role
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_default_user_role();

COMMENT ON FUNCTION public.fn_default_user_role IS
    'Yeni auth.users insert sonrası user_roles''a default staff rolü yazar. Idempotent (ON CONFLICT DO NOTHING). Admin promotion manuel SQL ile yapılır.';
