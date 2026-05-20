-- Migration: 20260520000010_role_v2_expand.sql
-- Sprint: role-system-modernization (PR-A faz 1/4 — Expand)
-- Description: Yeni rol modelini paralel olarak ekler (eski değerleri kırmadan).
--
-- YENİ MODEL:
--   proje_uyelikleri.rol IN ('owner','manager','user')
--   projeler.owner_user_id UUID — proje sahibi (her projede tam 1 kişi)
--
-- ESKİ MODEL (faz 3'te kaldırılacak):
--   user_roles.role IN ('admin','staff')          -- global rol kavramı kaldırılacak
--   proje_uyelikleri.rol IN ('admin','staff','viewer')
--
-- Bu faz "Expand" (geniş tut): yeni değerler + yeni kolon eklenir, eskiler kalır.
-- Faz 2 (backfill) eski değerleri yeni değerlere migrate eder.
-- Faz 3 (contract) eski CHECK constraint'i daraltır + user_roles'u DROP eder.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. proje_uyelikleri.rol CHECK constraint genişletme (eski + yeni paralel)
-- ---------------------------------------------------------------------------
-- Mevcut CHECK constraint adı: proje_uyelikleri_rol_check (PostgreSQL default)
-- Idempotent: önce eski'yi düşür, sonra yeni'yi ekle.

DO $$
DECLARE
  v_constraint_name TEXT;
BEGIN
  SELECT conname INTO v_constraint_name
  FROM pg_constraint
  WHERE conrelid = 'public.proje_uyelikleri'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%rol%';

  IF v_constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.proje_uyelikleri DROP CONSTRAINT %I', v_constraint_name);
    RAISE NOTICE 'Dropped existing CHECK constraint: %', v_constraint_name;
  END IF;
END $$;

ALTER TABLE public.proje_uyelikleri
  ADD CONSTRAINT proje_uyelikleri_rol_check
  CHECK (rol IN ('admin','staff','viewer','owner','manager','user'));

COMMENT ON COLUMN public.proje_uyelikleri.rol IS
  'Rol değeri. Eski set: admin/staff/viewer. Yeni set: owner/manager/user. '
  'Geçiş periyodunda (faz 1-2) paralel; faz 3''te eski set kaldırılır.';

-- ---------------------------------------------------------------------------
-- 2. projeler.owner_user_id ekleme (önce NULLABLE — faz 2 backfill sonrası NOT NULL)
-- ---------------------------------------------------------------------------
ALTER TABLE public.projeler
  ADD COLUMN IF NOT EXISTS owner_user_id UUID REFERENCES auth.users(id);

CREATE INDEX IF NOT EXISTS idx_projeler_owner_user_id
  ON public.projeler (owner_user_id);

COMMENT ON COLUMN public.projeler.owner_user_id IS
  'Proje sahibi. Her projede tam olarak 1 owner olmalı. Backfill sonrası NOT NULL.';

-- ---------------------------------------------------------------------------
-- 3. Yeni RLS Helper Fonksiyonları
-- ---------------------------------------------------------------------------

-- is_project_owner: auth.uid() bu projenin owner'ı mı?
CREATE OR REPLACE FUNCTION public.is_project_owner(p_proje_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.proje_uyelikleri
    WHERE user_id = auth.uid()
      AND proje_id = p_proje_id
      AND rol = 'owner'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

COMMENT ON FUNCTION public.is_project_owner IS
  'auth.uid() verilen projenin sahibi mi? NULL proje_id için FALSE.';

-- is_project_manager: auth.uid() bu projenin owner'ı VEYA manager'ı mı?
-- (manager = "yönetici" yetkisi — silme/undo/parametre gibi yıkıcı işlemler için)
CREATE OR REPLACE FUNCTION public.is_project_manager(p_proje_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.proje_uyelikleri
    WHERE user_id = auth.uid()
      AND proje_id = p_proje_id
      AND rol IN ('owner','manager')
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

COMMENT ON FUNCTION public.is_project_manager IS
  'auth.uid() verilen projede owner veya manager rolünde mi? Silme/undo gibi yıkıcı işlemler için.';

-- is_project_user: auth.uid() bu projenin herhangi bir üyesi mi?
-- (görüntüleme/insert/update için yeterli; yeni isim — eskisi is_project_member kalır)
CREATE OR REPLACE FUNCTION public.is_project_user(p_proje_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.proje_uyelikleri
    WHERE user_id = auth.uid()
      AND proje_id = p_proje_id
      AND rol IN ('owner','manager','user','admin','staff','viewer')
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

COMMENT ON FUNCTION public.is_project_user IS
  'auth.uid() verilen projenin herhangi bir üyesi mi? Faz 1''de eski rolleri de tanır; faz 3''te sadeleştirilir.';

-- ---------------------------------------------------------------------------
-- 4. RPC: fn_set_user_role — rol değiştirme (yetki kontrolü dahili)
-- ---------------------------------------------------------------------------
-- Kurallar:
--   - Owner her rolü her role çevirebilir AMA başka owner yaratamaz (1 proje 1 owner).
--   - Manager: manager↔user yapabilir; owner'a dokunamaz.
--   - User: hiçbir şey yapamaz.
--   - Hedef kullanıcı kendisiyse: izin verilmez (kendi rolünü değiştiremez).
CREATE OR REPLACE FUNCTION public.fn_set_user_role(
  p_user_id UUID,
  p_proje_id UUID,
  p_new_role TEXT
) RETURNS public.proje_uyelikleri AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_caller_role TEXT;
  v_target_role TEXT;
  v_result public.proje_uyelikleri;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Authenticated user required' USING ERRCODE = '42501';
  END IF;

  IF p_user_id IS NULL OR p_proje_id IS NULL OR p_new_role IS NULL THEN
    RAISE EXCEPTION 'p_user_id, p_proje_id ve p_new_role zorunlu' USING ERRCODE = '22023';
  END IF;

  IF p_new_role NOT IN ('owner','manager','user') THEN
    RAISE EXCEPTION 'p_new_role değeri owner/manager/user olmalı, alınan: %', p_new_role
      USING ERRCODE = '22023';
  END IF;

  -- Caller'ın bu projedeki rolü
  SELECT rol INTO v_caller_role
  FROM public.proje_uyelikleri
  WHERE user_id = v_caller_id AND proje_id = p_proje_id;

  IF v_caller_role IS NULL THEN
    RAISE EXCEPTION 'Caller bu projenin üyesi değil' USING ERRCODE = '42501';
  END IF;

  -- Sadece owner veya manager rol değiştirebilir
  IF v_caller_role NOT IN ('owner','manager','admin','staff') THEN
    RAISE EXCEPTION 'Rol değiştirme yetkisi yok' USING ERRCODE = '42501';
  END IF;

  -- Caller kendisinin rolünü değiştiremez
  IF v_caller_id = p_user_id THEN
    RAISE EXCEPTION 'Kendi rolünüzü değiştiremezsiniz' USING ERRCODE = '42501';
  END IF;

  -- Hedef kullanıcının mevcut rolü
  SELECT rol INTO v_target_role
  FROM public.proje_uyelikleri
  WHERE user_id = p_user_id AND proje_id = p_proje_id;

  IF v_target_role IS NULL THEN
    RAISE EXCEPTION 'Hedef kullanıcı bu projenin üyesi değil' USING ERRCODE = 'P0002';
  END IF;

  -- Owner'a dokunma kuralları
  IF v_target_role IN ('owner') AND v_caller_role NOT IN ('owner') THEN
    RAISE EXCEPTION 'Owner''ın rolünü sadece owner değiştirebilir (ve şu an desteklenmiyor)'
      USING ERRCODE = '42501';
  END IF;

  -- Owner kendisi başka birini owner yapamaz (transfer akışı henüz yok)
  IF p_new_role = 'owner' THEN
    RAISE EXCEPTION 'Owner transferi şu an desteklenmiyor — manuel SQL gerekir'
      USING ERRCODE = '42501';
  END IF;

  -- Owner kendi rolünü değiştirip ortada owner''sız proje bırakamaz
  IF v_target_role = 'owner' AND p_new_role != 'owner' THEN
    RAISE EXCEPTION 'Projenin owner''ı manager/user yapılamaz — owner transferi gerekir'
      USING ERRCODE = '42501';
  END IF;

  -- Güncelle
  UPDATE public.proje_uyelikleri
  SET rol = p_new_role
  WHERE user_id = p_user_id AND proje_id = p_proje_id
  RETURNING * INTO v_result;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.fn_set_user_role IS
  'Proje üyesinin rolünü güvenli şekilde değiştirir. Owner''a dokunamayacak şekilde guard''lar içerir. Owner transferi henüz desteklenmiyor.';

REVOKE ALL ON FUNCTION public.fn_set_user_role FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_set_user_role TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. RPC: fn_remove_project_member — proje üyesini güvenli şekilde kaldırır
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_remove_project_member(
  p_user_id UUID,
  p_proje_id UUID
) RETURNS BOOLEAN AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_caller_role TEXT;
  v_target_role TEXT;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Authenticated user required' USING ERRCODE = '42501';
  END IF;

  IF v_caller_id = p_user_id THEN
    RAISE EXCEPTION 'Kendinizi projeden çıkaramazsınız' USING ERRCODE = '42501';
  END IF;

  SELECT rol INTO v_caller_role
  FROM public.proje_uyelikleri
  WHERE user_id = v_caller_id AND proje_id = p_proje_id;

  IF v_caller_role NOT IN ('owner','manager','admin','staff') THEN
    RAISE EXCEPTION 'Üye kaldırma yetkisi yok' USING ERRCODE = '42501';
  END IF;

  SELECT rol INTO v_target_role
  FROM public.proje_uyelikleri
  WHERE user_id = p_user_id AND proje_id = p_proje_id;

  IF v_target_role IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Owner asla projeden çıkarılamaz (DELETE projeler ON CASCADE veya owner transferi gerekir)
  IF v_target_role = 'owner' THEN
    RAISE EXCEPTION 'Owner projeden çıkarılamaz — owner transferi gerekir'
      USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.proje_uyelikleri
  WHERE user_id = p_user_id AND proje_id = p_proje_id;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.fn_remove_project_member IS
  'Proje üyesini güvenli şekilde kaldırır. Owner''ı asla silmez; caller kendisini silemez.';

REVOKE ALL ON FUNCTION public.fn_remove_project_member FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_remove_project_member TO authenticated;

COMMIT;
