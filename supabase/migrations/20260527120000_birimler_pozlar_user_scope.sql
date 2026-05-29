-- Migration: 20260527120000_birimler_pozlar_user_scope.sql
-- Sprint: birim-poz-user-scope (2026-05-27)
--
-- Amaç:
--   birimler ve pozlar tablolarına kullanıcı-bazlı sahiplik (kullanici_id) ekle.
--   Hibrit model:
--     - kullanici_id IS NULL  → GLOBAL kayıt (tüm authenticated kullanıcılara görünür)
--     - kullanici_id = auth.uid() → KİŞİSEL kayıt (yalnız sahibine görünür)
--
--   İzin matrisi (önceki 20260524130000_birim_poz_split_policies.sql refactor):
--     SELECT : kullanici_id IS NULL OR kullanici_id = auth.uid()
--     INSERT : kullanici_id = auth.uid() (kişisel)
--              VEYA kullanici_id IS NULL AND (is_admin OR is_yetkili OR is_any_project_manager) (global)
--     UPDATE : is_admin VEYA kullanici_id = auth.uid()
--     DELETE : is_admin VEYA kullanici_id = auth.uid()
--
--   Unique constraint refactor: partial unique indexes ile global ve user-scope
--   namespaces ayrılır. Aynı isim/poz_no farklı kullanıcılarda olabilir.
--
-- Geriye uyumluluk:
--   Mevcut 9 birim + 200 poz seed kayıtları kullanici_id NULL kalır (global).
--   Mevcut auth flow (yetkili + manager global ekleme) korunur.
--
-- Bağımlılıklar:
--   20260421000011_add_birimler_and_pozlar.sql — base schema + ad/poz_no UNIQUE
--   20260524130000_birim_poz_split_policies.sql — 4'lü split policies

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. kullanici_id kolonu ekle
-- ---------------------------------------------------------------------------

ALTER TABLE public.birimler
  ADD COLUMN IF NOT EXISTS kullanici_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.pozlar
  ADD COLUMN IF NOT EXISTS kullanici_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- Partial indexes — sadece user-scope kayıtları için (NULL satırlar global,
-- indeksten dışlanır → mevcut 9 + 200 satıra ek storage maliyeti yok).
CREATE INDEX IF NOT EXISTS birimler_kullanici_id_idx
  ON public.birimler(kullanici_id) WHERE kullanici_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS pozlar_kullanici_id_idx
  ON public.pozlar(kullanici_id) WHERE kullanici_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. Unique constraint refactor — partial unique indexes
-- ---------------------------------------------------------------------------
-- Önceki ad UNIQUE / poz_no UNIQUE constraint'i her satırı tek namespace'e
-- zorluyordu. Hibrit modelde global ve per-user namespace ayrılır:
--   - Global: aynı isim bir kez (admin ekledi → tüm kullanıcılar görür)
--   - User-scope: aynı kullanıcının iki aynı isimli kaydı olamaz; farklı
--     kullanıcılar aynı ismi paralel kullanabilir (ör. herkes kendi "Paket")

ALTER TABLE public.birimler DROP CONSTRAINT IF EXISTS birimler_ad_key;
CREATE UNIQUE INDEX IF NOT EXISTS birimler_ad_global_uq
  ON public.birimler(ad) WHERE kullanici_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS birimler_ad_user_uq
  ON public.birimler(ad, kullanici_id) WHERE kullanici_id IS NOT NULL;

ALTER TABLE public.pozlar DROP CONSTRAINT IF EXISTS pozlar_poz_no_key;
CREATE UNIQUE INDEX IF NOT EXISTS pozlar_poz_no_global_uq
  ON public.pozlar(poz_no) WHERE kullanici_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS pozlar_poz_no_user_uq
  ON public.pozlar(poz_no, kullanici_id) WHERE kullanici_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 3. RLS policies — eski 4'lü split'i hibrit modele replace et
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS birimler_select ON public.birimler;
DROP POLICY IF EXISTS birimler_insert ON public.birimler;
DROP POLICY IF EXISTS birimler_update ON public.birimler;
DROP POLICY IF EXISTS birimler_delete ON public.birimler;

DROP POLICY IF EXISTS pozlar_select ON public.pozlar;
DROP POLICY IF EXISTS pozlar_insert ON public.pozlar;
DROP POLICY IF EXISTS pozlar_update ON public.pozlar;
DROP POLICY IF EXISTS pozlar_delete ON public.pozlar;

-- birimler — hibrit policies
CREATE POLICY birimler_select ON public.birimler
  FOR SELECT TO authenticated
  USING (kullanici_id IS NULL OR kullanici_id = auth.uid());

CREATE POLICY birimler_insert ON public.birimler
  FOR INSERT TO authenticated
  WITH CHECK (
    -- (A) Kişisel kayıt: kullanıcı kendi adına ekler
    (kullanici_id = auth.uid())
    OR
    -- (B) Global kayıt: admin/yetkili/herhangi proje owner-manager
    (kullanici_id IS NULL AND (
      public.is_admin() OR public.is_yetkili() OR public.is_any_project_manager()
    ))
  );

CREATE POLICY birimler_update ON public.birimler
  FOR UPDATE TO authenticated
  USING      (public.is_admin() OR kullanici_id = auth.uid())
  WITH CHECK (public.is_admin() OR kullanici_id = auth.uid());

CREATE POLICY birimler_delete ON public.birimler
  FOR DELETE TO authenticated
  USING (public.is_admin() OR kullanici_id = auth.uid());

-- pozlar — hibrit policies (birimler ile aynı mantık)
CREATE POLICY pozlar_select ON public.pozlar
  FOR SELECT TO authenticated
  USING (kullanici_id IS NULL OR kullanici_id = auth.uid());

CREATE POLICY pozlar_insert ON public.pozlar
  FOR INSERT TO authenticated
  WITH CHECK (
    (kullanici_id = auth.uid())
    OR
    (kullanici_id IS NULL AND (
      public.is_admin() OR public.is_yetkili() OR public.is_any_project_manager()
    ))
  );

CREATE POLICY pozlar_update ON public.pozlar
  FOR UPDATE TO authenticated
  USING      (public.is_admin() OR kullanici_id = auth.uid())
  WITH CHECK (public.is_admin() OR kullanici_id = auth.uid());

CREATE POLICY pozlar_delete ON public.pozlar
  FOR DELETE TO authenticated
  USING (public.is_admin() OR kullanici_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 4. Dokümantasyon
-- ---------------------------------------------------------------------------

COMMENT ON COLUMN public.birimler.kullanici_id IS
  'Kişisel birim sahibi. NULL = global (admin/yetkili/manager tarafından eklenmiş, '
  'tüm kullanıcılara görünür). 2026-05-27 user-scope sprint.';

COMMENT ON COLUMN public.pozlar.kullanici_id IS
  'Kişisel poz sahibi. NULL = global. 2026-05-27 user-scope sprint.';

COMMENT ON POLICY birimler_select ON public.birimler IS
  'Hibrit görünürlük: global (kullanici_id NULL) + kişisel (kullanici_id = auth.uid). 2026-05-27.';
COMMENT ON POLICY birimler_insert ON public.birimler IS
  'Kişisel ekleme her authenticated kullanıcıya açık; global ekleme admin/yetkili/any-manager. 2026-05-27.';
COMMENT ON POLICY birimler_update ON public.birimler IS
  'Admin tüm kayıtlar; kullanıcı sadece kendi kayıtları. 2026-05-27.';
COMMENT ON POLICY birimler_delete ON public.birimler IS
  'Admin tüm kayıtlar; kullanıcı sadece kendi kayıtları. 2026-05-27.';

COMMENT ON POLICY pozlar_select ON public.pozlar IS
  'Hibrit görünürlük: global (kullanici_id NULL) + kişisel (kullanici_id = auth.uid). 2026-05-27.';
COMMENT ON POLICY pozlar_insert ON public.pozlar IS
  'Kişisel ekleme her authenticated kullanıcıya açık; global ekleme admin/yetkili/any-manager. 2026-05-27.';
COMMENT ON POLICY pozlar_update ON public.pozlar IS
  'Admin tüm kayıtlar; kullanıcı sadece kendi kayıtları. 2026-05-27.';
COMMENT ON POLICY pozlar_delete ON public.pozlar IS
  'Admin tüm kayıtlar; kullanıcı sadece kendi kayıtları. 2026-05-27.';

COMMIT;
