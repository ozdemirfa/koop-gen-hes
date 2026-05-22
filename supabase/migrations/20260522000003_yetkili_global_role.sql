-- Migration: 20260522000003_yetkili_global_role.sql
-- Sprint: yetkili-role-system (PR-A Faz 1) — 2026-05-22
-- Description:
--   1) user_roles.role CHECK constraint'e 'yetkili' eklenir.
--   2) is_yetkili() helper fonksiyonu eklenir.
--   3) projeler INSERT policy kısıtlanır: sadece admin VEYA yetkili proje oluşturabilir.
--   4) fn_default_user_role trigger + fonksiyonu kaldırılır (yeni sistemde otomatik
--      staff ataması yok — admin/yetkili ataması manuel yapılacak).
--
-- Bağımlılıklar:
--   20260413000001_fix_rls_and_aggregation.sql  → user_roles, is_admin(), is_staff()
--   20260510000016_default_user_role_trigger.sql → fn_default_user_role (burada DROP edilir)
--   20260520000013_role_v2_rls_refactor.sql      → projeler_insert policy (burada değiştirilir)

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. user_roles.role CHECK constraint: 'yetkili' eklenir
-- ---------------------------------------------------------------------------
-- PostgreSQL default naming: tabloadı_kolonadı_check → user_roles_role_check
-- idempotent: önce düşür, sonra yeni tanımı ekle.

DO $$
DECLARE
  v_constraint_name TEXT;
BEGIN
  SELECT conname INTO v_constraint_name
  FROM pg_constraint
  WHERE conrelid = 'public.user_roles'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%role%';

  IF v_constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.user_roles DROP CONSTRAINT %I', v_constraint_name);
    RAISE NOTICE 'user_roles role CHECK constraint düşürüldü: %', v_constraint_name;
  END IF;
END $$;

ALTER TABLE public.user_roles
  ADD CONSTRAINT user_roles_role_check
  CHECK (role IN ('admin', 'yetkili', 'staff'));

COMMENT ON COLUMN public.user_roles.role IS
  'Global rol. admin: tam yetki. yetkili: proje oluşturma hakkı olan uzman. '
  'staff: yalnızca okuma (legacy — faz 3''te kaldırılabilir). '
  '2026-05-22 yetkili-role-system PR-A.';

-- ---------------------------------------------------------------------------
-- 2. is_yetkili() helper fonksiyonu
-- ---------------------------------------------------------------------------
-- admin VEYA yetkili rolüne sahip kullanıcı için TRUE döner.
-- SECURITY DEFINER: RLS context'inde güvenli çağrı için.
-- STABLE: aynı transaction'da aynı sonucu döner.

CREATE OR REPLACE FUNCTION public.is_yetkili()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role IN ('admin', 'yetkili')
  );
$$;

COMMENT ON FUNCTION public.is_yetkili() IS
  'Yeni rol sistemi: admin VEYA yetkili global rolü olan kullanıcı için TRUE döner. '
  'Proje oluşturma ve yetkili-scope işlemler için RLS guard. '
  '2026-05-22 yetkili-role-system PR-A.';

GRANT EXECUTE ON FUNCTION public.is_yetkili() TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. projeler INSERT policy kısıtlaması
-- ---------------------------------------------------------------------------
-- Eski policy (20260520000013): her authenticated kullanıcı proje oluşturabilir
--   (WITH CHECK auth.uid() IS NOT NULL).
-- Yeni policy: sadece admin VEYA yetkili proje oluşturabilir.
--
-- Policy adı korunur: projeler_insert → yeni içerikle yeniden oluşturulur.

DROP POLICY IF EXISTS projeler_insert ON public.projeler;
DROP POLICY IF EXISTS projeler_insert_authenticated ON public.projeler;
DROP POLICY IF EXISTS projeler_insert_anyone ON public.projeler;

CREATE POLICY projeler_insert ON public.projeler
  FOR INSERT TO authenticated
  WITH CHECK (public.is_yetkili());

COMMENT ON POLICY projeler_insert ON public.projeler IS
  'Proje oluşturma: sadece admin veya yetkili rolündeki kullanıcılar. '
  '2026-05-22 yetkili-role-system PR-A.';

-- ---------------------------------------------------------------------------
-- 4. fn_default_user_role trigger + fonksiyon kaldırma
-- ---------------------------------------------------------------------------
-- 20260510000016: yeni kullanıcılara otomatik 'staff' atayan trigger.
-- Yeni sistemde otomatik atama yok; admin/yetkili ataması manuel yapılacak.
-- Mevcut kullanıcıların user_roles kaydı korunur (sadece trigger kaldırılır).

DROP TRIGGER IF EXISTS trg_default_user_role ON auth.users;
DROP FUNCTION IF EXISTS public.fn_default_user_role();

DO $$
BEGIN
  RAISE NOTICE 'trg_default_user_role trigger ve fn_default_user_role fonksiyonu kaldırıldı. Mevcut user_roles kayıtları korundu.';
END $$;

COMMIT;
