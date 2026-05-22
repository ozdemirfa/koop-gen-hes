-- Migration: 20260522000004_yetkili_invitation_support.sql
-- Sprint: yetkili-role-system (PR-A Faz 1) — 2026-05-22
-- Description:
--   1) invitations.invited_role CHECK'e 'yetkili' eklenir.
--   2) invitations.proje_id NULLABLE yapılır (yetkili daveti projeye bağlı değil).
--   3) Tutarlılık CHECK: yetkili → proje_id NULL; manager/user → proje_id NOT NULL.
--   4) Partial unique index'ler yeniden düzenlenir:
--      - yetkili: (email) WHERE status='pending' AND invited_role='yetkili'
--      - manager/user: (proje_id, email) WHERE status='pending' AND invited_role IN (...)
--   5) invitations RLS: admin tüm yetkili davetlerini okuyabilir.
--
-- Bağımlılıklar:
--   20260522000001_invitations_table.sql → invitations tablosu, uniq_invite_active index,
--                                           invited_role CHECK constraint

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. invitations.invited_role CHECK: 'yetkili' eklenir
-- ---------------------------------------------------------------------------
-- Mevcut constraint adını dinamik bul (PostgreSQL default: invitations_invited_role_check)

DO $$
DECLARE
  v_constraint_name TEXT;
BEGIN
  SELECT conname INTO v_constraint_name
  FROM pg_constraint
  WHERE conrelid = 'public.invitations'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%invited_role%';

  IF v_constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.invitations DROP CONSTRAINT %I', v_constraint_name);
    RAISE NOTICE 'invitations invited_role CHECK constraint düşürüldü: %', v_constraint_name;
  END IF;
END $$;

ALTER TABLE public.invitations
  ADD CONSTRAINT invitations_invited_role_check
  CHECK (invited_role IN ('manager', 'user', 'yetkili'));

COMMENT ON COLUMN public.invitations.invited_role IS
  'Davet edilen rolü. manager/user: proje üyeliği (proje_id zorunlu). '
  'yetkili: global rol daveti (proje_id NULL olmalı). '
  '2026-05-22 yetkili-role-system PR-A.';

-- ---------------------------------------------------------------------------
-- 2. invitations.proje_id NULLABLE yapılır
-- ---------------------------------------------------------------------------
-- Yetkili daveti herhangi bir projeye bağlı değil; proje_id NULL olacak.
-- Mevcut kayıtlar (manager/user) etkilenmez (hepsi zaten proje_id dolu).
--
-- Tutarlılık için önce NOT NULL kısıtını kaldır, sonra consistency CHECK ekle (adım 3).

ALTER TABLE public.invitations
  ALTER COLUMN proje_id DROP NOT NULL;

COMMENT ON COLUMN public.invitations.proje_id IS
  'Davet hedef projesi. yetkili daveti için NULL (global rol — projeden bağımsız). '
  'manager ve user davetleri için NOT NULL (consistency CHECK ile zorlanır). '
  '2026-05-22 yetkili-role-system PR-A.';

-- ---------------------------------------------------------------------------
-- 3. Tutarlılık CHECK: yetkili ↔ proje_id NULL, diğerleri ↔ proje_id NOT NULL
-- ---------------------------------------------------------------------------
ALTER TABLE public.invitations
  DROP CONSTRAINT IF EXISTS invitations_proje_id_role_consistency;

ALTER TABLE public.invitations
  ADD CONSTRAINT invitations_proje_id_role_consistency
  CHECK (
    (invited_role = 'yetkili' AND proje_id IS NULL) OR
    (invited_role IN ('manager', 'user') AND proje_id IS NOT NULL)
  );

COMMENT ON CONSTRAINT invitations_proje_id_role_consistency ON public.invitations IS
  'yetkili daveti proje_id=NULL gerektirir; manager/user daveti proje_id NOT NULL gerektirir. '
  '2026-05-22 yetkili-role-system PR-A.';

-- ---------------------------------------------------------------------------
-- 4a. Mevcut (proje_id, email) partial unique index yetkili satırları dışlar
-- ---------------------------------------------------------------------------
-- Mevcut index adı (20260522000001): uniq_invite_active
--   ON invitations (proje_id, email) WHERE status = 'pending'
-- Sorun: yetkili davetleri proje_id=NULL olacak — (NULL, email) UNIQUE çalışmaz
--   ve bu index yetkili satırlarını dışlamamalı.
-- Çözüm: index'i sadece manager/user davetlerine kısıtla.

DROP INDEX IF EXISTS public.uniq_invite_active;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_invite_active_proje
  ON public.invitations (proje_id, email)
  WHERE status = 'pending' AND invited_role IN ('manager', 'user');

COMMENT ON INDEX public.uniq_invite_active_proje IS
  'Aynı (proje, email) için birden fazla pending manager/user daveti engeller. '
  'yetkili davetleri ayrı index ile kontrol edilir. 2026-05-22 yetkili-role-system PR-A.';

-- ---------------------------------------------------------------------------
-- 4b. Yetkili davetleri için yeni partial unique index
-- ---------------------------------------------------------------------------
-- Aynı email'e birden fazla pending yetkili daveti yasak.

CREATE UNIQUE INDEX IF NOT EXISTS uniq_invite_pending_yetkili_email
  ON public.invitations (email)
  WHERE status = 'pending' AND invited_role = 'yetkili';

COMMENT ON INDEX public.uniq_invite_pending_yetkili_email IS
  'Aynı email''e birden fazla pending yetkili daveti engeller. '
  '2026-05-22 yetkili-role-system PR-A.';

-- ---------------------------------------------------------------------------
-- 5. RLS: admin tüm yetkili davetlerini okuyabilir
-- ---------------------------------------------------------------------------
-- Mevcut policy'ler (20260522000001):
--   invitations_read_owner_manager → is_project_manager(proje_id) [manager/user davetleri için geçerli]
--   invitations_read_self          → user_id = auth.uid()
-- Yeni: admin tüm yetkili davetlerini görmeli (proje_id NULL olduğundan
--   is_project_manager NULL geçirir → FALSE döner; owner_manager policy kör kalır).

DROP POLICY IF EXISTS invitations_select_admin_yetkili ON public.invitations;

CREATE POLICY invitations_select_admin_yetkili ON public.invitations
  FOR SELECT
  TO authenticated
  USING (
    invited_role = 'yetkili'
    AND public.is_admin()
  );

COMMENT ON POLICY invitations_select_admin_yetkili ON public.invitations IS
  'Admin, tüm pending/geçmiş yetkili davetlerini okuyabilir. '
  'is_project_manager NULL proje_id için FALSE döndüğünden ayrı policy gerekir. '
  '2026-05-22 yetkili-role-system PR-A.';

COMMIT;
