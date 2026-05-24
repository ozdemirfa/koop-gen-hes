-- Migration: 20260524130000_birim_poz_split_policies.sql
-- Sprint: birim-poz-yetki — 2026-05-24
-- Description:
--   birimler ve pozlar GLOBAL referans tablolar (proje_id yok).
--   Yeni izin matrisi:
--     SELECT: tüm authenticated kullanıcılar
--     INSERT: global admin VEYA global yetkili VEYA herhangi bir projede owner/manager
--     UPDATE: sadece global admin
--     DELETE: sadece global admin
--
--   Önceki tek policy ("birimler_access" / "pozlar_access") FOR ALL ile
--   is_admin() OR is_staff() kontrolü yapıyordu. Bu deprecated rolleri
--   kullanıyor ve ekleme/silme ayrımı yapmıyordu — sil/düzenle artık
--   yalnız sistem admin'e ayrıldı.
--
-- Bağımlılıklar:
--   20260421000011_add_birimler_and_pozlar.sql       → birimler/pozlar + eski policy
--   20260520000010_role_v2_expand.sql                → proje_uyelikleri.rol, is_project_manager()
--   20260522000003_yetkili_global_role.sql           → is_yetkili()
--   (is_admin() halihazırda var — 20260413000001_fix_rls_and_aggregation.sql)

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Yeni helper: is_any_project_manager()
-- ---------------------------------------------------------------------------
-- Kullanıcı *herhangi bir* projede owner/manager rolünde mi? Global referans
-- veri INSERT politikasında kullanılır (proje_id yok, çağıran kullanıcının
-- tüm üyeliklerini tarar).

CREATE OR REPLACE FUNCTION public.is_any_project_manager()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.proje_uyelikleri
    WHERE user_id = auth.uid()
      AND rol IN ('owner', 'manager')
  );
$$;

COMMENT ON FUNCTION public.is_any_project_manager() IS
  'Çağıran kullanıcı en az bir projede owner veya manager rolünde mi? '
  'Global referans tabloların (birimler, pozlar) INSERT policy''sinde kullanılır. '
  '2026-05-24 birim-poz-yetki sprint.';

GRANT EXECUTE ON FUNCTION public.is_any_project_manager() TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. Eski monolit policy'leri düşür
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "birimler_access" ON public.birimler;
DROP POLICY IF EXISTS "pozlar_access" ON public.pozlar;

-- ---------------------------------------------------------------------------
-- 3. Birimler — split policies
-- ---------------------------------------------------------------------------

CREATE POLICY birimler_select ON public.birimler
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY birimler_insert ON public.birimler
  FOR INSERT TO authenticated
  WITH CHECK (public.is_yetkili() OR public.is_any_project_manager());

CREATE POLICY birimler_update ON public.birimler
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY birimler_delete ON public.birimler
  FOR DELETE TO authenticated
  USING (public.is_admin());

COMMENT ON POLICY birimler_select ON public.birimler IS
  'Tüm authenticated kullanıcılar birimleri okuyabilir (Select option vb.). 2026-05-24.';
COMMENT ON POLICY birimler_insert ON public.birimler IS
  'Birim ekleme: admin, yetkili veya herhangi bir projede owner/manager. 2026-05-24.';
COMMENT ON POLICY birimler_update ON public.birimler IS
  'Birim güncelleme: yalnız global admin. 2026-05-24.';
COMMENT ON POLICY birimler_delete ON public.birimler IS
  'Birim silme: yalnız global admin. 2026-05-24.';

-- ---------------------------------------------------------------------------
-- 4. Pozlar — split policies
-- ---------------------------------------------------------------------------

CREATE POLICY pozlar_select ON public.pozlar
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY pozlar_insert ON public.pozlar
  FOR INSERT TO authenticated
  WITH CHECK (public.is_yetkili() OR public.is_any_project_manager());

CREATE POLICY pozlar_update ON public.pozlar
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY pozlar_delete ON public.pozlar
  FOR DELETE TO authenticated
  USING (public.is_admin());

COMMENT ON POLICY pozlar_select ON public.pozlar IS
  'Tüm authenticated kullanıcılar pozları okuyabilir. 2026-05-24.';
COMMENT ON POLICY pozlar_insert ON public.pozlar IS
  'Poz ekleme: admin, yetkili veya herhangi bir projede owner/manager. 2026-05-24.';
COMMENT ON POLICY pozlar_update ON public.pozlar IS
  'Poz güncelleme: yalnız global admin. 2026-05-24.';
COMMENT ON POLICY pozlar_delete ON public.pozlar IS
  'Poz silme: yalnız global admin. 2026-05-24.';

COMMIT;
