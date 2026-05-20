-- Migration: 20260520000012_role_v2_auto_owner_trigger.sql
-- Sprint: role-system-modernization (PR-A faz 3/4 — Auto-owner trigger)
-- Description: Yeni proje oluşturulduğunda:
--   - owner_user_id boşsa session user (auth.uid()) atanır
--   - proje_uyelikleri'ne (owner_user_id, NEW.id, 'owner') eklenir
--
-- Backend zaten projeyi oluşturduktan sonra üyelik ekliyor olabilir; bu trigger
-- güvenlik ağı olarak idempotent çalışır (ON CONFLICT DO UPDATE).

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. BEFORE INSERT: owner_user_id boşsa auth.uid()'i ata
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_projeler_set_owner_before_insert()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.owner_user_id IS NULL THEN
    NEW.owner_user_id := auth.uid();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_projeler_set_owner_before_insert ON public.projeler;
CREATE TRIGGER trg_projeler_set_owner_before_insert
  BEFORE INSERT ON public.projeler
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_projeler_set_owner_before_insert();

-- ---------------------------------------------------------------------------
-- 2. AFTER INSERT: proje_uyelikleri'ne owner ekle
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_projeler_seed_owner_membership_after_insert()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.owner_user_id IS NOT NULL THEN
    INSERT INTO public.proje_uyelikleri (user_id, proje_id, rol)
    VALUES (NEW.owner_user_id, NEW.id, 'owner')
    ON CONFLICT (user_id, proje_id) DO UPDATE SET rol = 'owner';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_projeler_seed_owner_membership_after_insert ON public.projeler;
CREATE TRIGGER trg_projeler_seed_owner_membership_after_insert
  AFTER INSERT ON public.projeler
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_projeler_seed_owner_membership_after_insert();

COMMENT ON FUNCTION public.fn_projeler_set_owner_before_insert IS
  'Proje INSERT öncesi owner_user_id boşsa auth.uid() ile doldurur.';

COMMENT ON FUNCTION public.fn_projeler_seed_owner_membership_after_insert IS
  'Proje INSERT sonrası owner_user_id''yi proje_uyelikleri.owner olarak ekler. Idempotent: ON CONFLICT DO UPDATE.';

COMMIT;
