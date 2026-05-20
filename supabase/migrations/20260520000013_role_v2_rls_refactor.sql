-- Migration: 20260520000013_role_v2_rls_refactor.sql
-- Sprint: role-system-modernization (PR-A faz 4/4 — RLS Refactor)
-- Description: Mevcut RLS policy'lerini yeni rol helper'larına geçirir.
--   - SELECT/INSERT/UPDATE: is_project_user(proje_id) — her üye
--   - DELETE: is_project_manager(proje_id) — owner + manager
--
-- ÖNEMLİ: Eski is_admin() / is_project_member() helper'ları KORUNUR — backend
-- bazı yerlerde hâlâ kullanıyor (user_roles + global admin). Faz 5 (PR-B sonrası)
-- bu helper'ları kaldıracak. Bu migration eski helper kullanan policy'leri
-- yeni helper'larla değiştirir AMA helper'ları DROP etmez.
--
-- Strateji: target_tables listesinde 8 ana finansal tablo + 7 master-data + child
-- tablolar (fatura_kalemleri, hakedis_kalemleri, aidat_odemeleri, irsaliye_kalemleri,
-- malzeme_teslimleri) için yeni policy seti.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. proje_id direkt olan tablolar — split SELECT/INSERT/UPDATE vs DELETE
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  tbl TEXT;
  target_tables TEXT[] := ARRAY[
    -- Finansal (faz 1 — 20260510000008)
    'cari_hesaplar',
    'cari_hareketler',
    'aidatlar',
    'faturalar',
    'hakedisler',
    'banka_hesaplari',
    'banka_hareketleri',
    'cekler',
    -- Master-data (faz 2 — 20260510000009)
    'aidat_tanimlari',
    'bloklar',
    'uyeler',
    'sozlesmeler',
    'serefiye_tablosu',
    'birikmis_teminatlar',
    'irsaliyeler'
  ];
BEGIN
  FOREACH tbl IN ARRAY target_tables LOOP
    -- Eski 'all' policy'yi düşür
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', tbl || '_proje_isolation', tbl);
    -- Yeni proje_id NULL satırlar için (eski seed data) — admin/owner fallback yok artık;
    -- proje_id NULL olan satırları görmek için user üye olmalı (NULL == hata data).
    -- Service-role bypass ediyor zaten; bu defense in depth.

    -- SELECT: tüm üyeler
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', tbl || '_select', tbl);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I
         FOR SELECT TO authenticated
         USING (public.is_project_user(proje_id))',
      tbl || '_select', tbl
    );

    -- INSERT: tüm üyeler (form gönderme — user dahil)
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', tbl || '_insert', tbl);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I
         FOR INSERT TO authenticated
         WITH CHECK (public.is_project_user(proje_id))',
      tbl || '_insert', tbl
    );

    -- UPDATE: tüm üyeler (düzenleme — user dahil; parametre/ayar tabloları için
    -- backend endpoint mw'de manager kontrolü yapılacak; bu tablolar veri tabloları)
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', tbl || '_update', tbl);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I
         FOR UPDATE TO authenticated
         USING (public.is_project_user(proje_id))
         WITH CHECK (public.is_project_user(proje_id))',
      tbl || '_update', tbl
    );

    -- DELETE: sadece owner + manager
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', tbl || '_delete', tbl);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I
         FOR DELETE TO authenticated
         USING (public.is_project_manager(proje_id))',
      tbl || '_delete', tbl
    );
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Child tablolar — parent join üzerinden
-- ---------------------------------------------------------------------------

-- 2a. fatura_kalemleri → faturalar.proje_id
DROP POLICY IF EXISTS fatura_kalemleri_proje_isolation ON public.fatura_kalemleri;
DROP POLICY IF EXISTS fatura_kalemleri_select ON public.fatura_kalemleri;
DROP POLICY IF EXISTS fatura_kalemleri_insert ON public.fatura_kalemleri;
DROP POLICY IF EXISTS fatura_kalemleri_update ON public.fatura_kalemleri;
DROP POLICY IF EXISTS fatura_kalemleri_delete ON public.fatura_kalemleri;

CREATE POLICY fatura_kalemleri_select ON public.fatura_kalemleri
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.faturalar f
    WHERE f.id = fatura_kalemleri.fatura_id
      AND public.is_project_user(f.proje_id)
  ));

CREATE POLICY fatura_kalemleri_insert ON public.fatura_kalemleri
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.faturalar f
    WHERE f.id = fatura_kalemleri.fatura_id
      AND public.is_project_user(f.proje_id)
  ));

CREATE POLICY fatura_kalemleri_update ON public.fatura_kalemleri
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.faturalar f
    WHERE f.id = fatura_kalemleri.fatura_id
      AND public.is_project_user(f.proje_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.faturalar f
    WHERE f.id = fatura_kalemleri.fatura_id
      AND public.is_project_user(f.proje_id)
  ));

CREATE POLICY fatura_kalemleri_delete ON public.fatura_kalemleri
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.faturalar f
    WHERE f.id = fatura_kalemleri.fatura_id
      AND public.is_project_manager(f.proje_id)
  ));

-- 2b. hakedis_kalemleri → hakedisler.proje_id
DROP POLICY IF EXISTS hakedis_kalemleri_proje_isolation ON public.hakedis_kalemleri;
DROP POLICY IF EXISTS hakedis_kalemleri_select ON public.hakedis_kalemleri;
DROP POLICY IF EXISTS hakedis_kalemleri_insert ON public.hakedis_kalemleri;
DROP POLICY IF EXISTS hakedis_kalemleri_update ON public.hakedis_kalemleri;
DROP POLICY IF EXISTS hakedis_kalemleri_delete ON public.hakedis_kalemleri;

CREATE POLICY hakedis_kalemleri_select ON public.hakedis_kalemleri
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.hakedisler h
    WHERE h.id = hakedis_kalemleri.hakedis_id
      AND public.is_project_user(h.proje_id)
  ));

CREATE POLICY hakedis_kalemleri_insert ON public.hakedis_kalemleri
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.hakedisler h
    WHERE h.id = hakedis_kalemleri.hakedis_id
      AND public.is_project_user(h.proje_id)
  ));

CREATE POLICY hakedis_kalemleri_update ON public.hakedis_kalemleri
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.hakedisler h
    WHERE h.id = hakedis_kalemleri.hakedis_id
      AND public.is_project_user(h.proje_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.hakedisler h
    WHERE h.id = hakedis_kalemleri.hakedis_id
      AND public.is_project_user(h.proje_id)
  ));

CREATE POLICY hakedis_kalemleri_delete ON public.hakedis_kalemleri
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.hakedisler h
    WHERE h.id = hakedis_kalemleri.hakedis_id
      AND public.is_project_manager(h.proje_id)
  ));

-- 2c. aidat_odemeleri → aidatlar.proje_id (tablo varsa)
DO $$
BEGIN
  IF to_regclass('public.aidat_odemeleri') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS aidat_odemeleri_proje_isolation ON public.aidat_odemeleri';
    EXECUTE 'DROP POLICY IF EXISTS aidat_odemeleri_select ON public.aidat_odemeleri';
    EXECUTE 'DROP POLICY IF EXISTS aidat_odemeleri_insert ON public.aidat_odemeleri';
    EXECUTE 'DROP POLICY IF EXISTS aidat_odemeleri_update ON public.aidat_odemeleri';
    EXECUTE 'DROP POLICY IF EXISTS aidat_odemeleri_delete ON public.aidat_odemeleri';

    EXECUTE $pol$
      CREATE POLICY aidat_odemeleri_select ON public.aidat_odemeleri
        FOR SELECT TO authenticated
        USING (EXISTS (
          SELECT 1 FROM public.aidatlar a
          WHERE a.id = aidat_odemeleri.aidat_id
            AND public.is_project_user(a.proje_id)
        ))
    $pol$;

    EXECUTE $pol$
      CREATE POLICY aidat_odemeleri_insert ON public.aidat_odemeleri
        FOR INSERT TO authenticated
        WITH CHECK (EXISTS (
          SELECT 1 FROM public.aidatlar a
          WHERE a.id = aidat_odemeleri.aidat_id
            AND public.is_project_user(a.proje_id)
        ))
    $pol$;

    EXECUTE $pol$
      CREATE POLICY aidat_odemeleri_update ON public.aidat_odemeleri
        FOR UPDATE TO authenticated
        USING (EXISTS (
          SELECT 1 FROM public.aidatlar a
          WHERE a.id = aidat_odemeleri.aidat_id
            AND public.is_project_user(a.proje_id)
        ))
        WITH CHECK (EXISTS (
          SELECT 1 FROM public.aidatlar a
          WHERE a.id = aidat_odemeleri.aidat_id
            AND public.is_project_user(a.proje_id)
        ))
    $pol$;

    EXECUTE $pol$
      CREATE POLICY aidat_odemeleri_delete ON public.aidat_odemeleri
        FOR DELETE TO authenticated
        USING (EXISTS (
          SELECT 1 FROM public.aidatlar a
          WHERE a.id = aidat_odemeleri.aidat_id
            AND public.is_project_manager(a.proje_id)
        ))
    $pol$;
  END IF;
END $$;

-- 2d. irsaliye_kalemleri → irsaliyeler.proje_id
DROP POLICY IF EXISTS irsaliye_kalemleri_proje_isolation ON public.irsaliye_kalemleri;
DROP POLICY IF EXISTS irsaliye_kalemleri_select ON public.irsaliye_kalemleri;
DROP POLICY IF EXISTS irsaliye_kalemleri_insert ON public.irsaliye_kalemleri;
DROP POLICY IF EXISTS irsaliye_kalemleri_update ON public.irsaliye_kalemleri;
DROP POLICY IF EXISTS irsaliye_kalemleri_delete ON public.irsaliye_kalemleri;

CREATE POLICY irsaliye_kalemleri_select ON public.irsaliye_kalemleri
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.irsaliyeler i
    WHERE i.id = irsaliye_kalemleri.irsaliye_id
      AND public.is_project_user(i.proje_id)
  ));

CREATE POLICY irsaliye_kalemleri_insert ON public.irsaliye_kalemleri
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.irsaliyeler i
    WHERE i.id = irsaliye_kalemleri.irsaliye_id
      AND public.is_project_user(i.proje_id)
  ));

CREATE POLICY irsaliye_kalemleri_update ON public.irsaliye_kalemleri
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.irsaliyeler i
    WHERE i.id = irsaliye_kalemleri.irsaliye_id
      AND public.is_project_user(i.proje_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.irsaliyeler i
    WHERE i.id = irsaliye_kalemleri.irsaliye_id
      AND public.is_project_user(i.proje_id)
  ));

CREATE POLICY irsaliye_kalemleri_delete ON public.irsaliye_kalemleri
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.irsaliyeler i
    WHERE i.id = irsaliye_kalemleri.irsaliye_id
      AND public.is_project_manager(i.proje_id)
  ));

-- 2e. malzeme_teslimleri → sozlesmeler.proje_id (sozlesme_id NULLABLE)
DROP POLICY IF EXISTS malzeme_teslimleri_proje_isolation ON public.malzeme_teslimleri;
DROP POLICY IF EXISTS malzeme_teslimleri_select ON public.malzeme_teslimleri;
DROP POLICY IF EXISTS malzeme_teslimleri_insert ON public.malzeme_teslimleri;
DROP POLICY IF EXISTS malzeme_teslimleri_update ON public.malzeme_teslimleri;
DROP POLICY IF EXISTS malzeme_teslimleri_delete ON public.malzeme_teslimleri;

CREATE POLICY malzeme_teslimleri_select ON public.malzeme_teslimleri
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.sozlesmeler s
    WHERE s.id = malzeme_teslimleri.sozlesme_id
      AND public.is_project_user(s.proje_id)
  ));

CREATE POLICY malzeme_teslimleri_insert ON public.malzeme_teslimleri
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.sozlesmeler s
    WHERE s.id = malzeme_teslimleri.sozlesme_id
      AND public.is_project_user(s.proje_id)
  ));

CREATE POLICY malzeme_teslimleri_update ON public.malzeme_teslimleri
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.sozlesmeler s
    WHERE s.id = malzeme_teslimleri.sozlesme_id
      AND public.is_project_user(s.proje_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.sozlesmeler s
    WHERE s.id = malzeme_teslimleri.sozlesme_id
      AND public.is_project_user(s.proje_id)
  ));

CREATE POLICY malzeme_teslimleri_delete ON public.malzeme_teslimleri
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.sozlesmeler s
    WHERE s.id = malzeme_teslimleri.sozlesme_id
      AND public.is_project_manager(s.proje_id)
  ));

-- ---------------------------------------------------------------------------
-- 3. proje_uyelikleri kendi RLS policy'leri — owner/manager üyelik yönetimi
-- ---------------------------------------------------------------------------
-- Mevcut policy'ler: admin_manage (is_admin) + self_read (auth.uid())
-- Yeni: owner_manager_manage (is_project_manager) + self_read korunur

DROP POLICY IF EXISTS proje_uyelikleri_admin_manage ON public.proje_uyelikleri;
DROP POLICY IF EXISTS proje_uyelikleri_owner_manager_manage ON public.proje_uyelikleri;

CREATE POLICY proje_uyelikleri_owner_manager_manage
  ON public.proje_uyelikleri
  FOR ALL TO authenticated
  USING (public.is_project_manager(proje_id))
  WITH CHECK (public.is_project_manager(proje_id));

-- self_read korunur (zaten varsa idempotent)
DROP POLICY IF EXISTS proje_uyelikleri_self_read ON public.proje_uyelikleri;
CREATE POLICY proje_uyelikleri_self_read
  ON public.proje_uyelikleri
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 4. projeler tablosu RLS — sadece üyeler kendi projelerini görür; sadece owner siler
-- ---------------------------------------------------------------------------
ALTER TABLE public.projeler ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS projeler_select ON public.projeler;
DROP POLICY IF EXISTS projeler_insert ON public.projeler;
DROP POLICY IF EXISTS projeler_update ON public.projeler;
DROP POLICY IF EXISTS projeler_delete ON public.projeler;
DROP POLICY IF EXISTS "Admins have full access" ON public.projeler;
DROP POLICY IF EXISTS "Staff can read all" ON public.projeler;
DROP POLICY IF EXISTS "Staff can insert activity" ON public.projeler;
DROP POLICY IF EXISTS authenticated_full_access ON public.projeler;

CREATE POLICY projeler_select ON public.projeler
  FOR SELECT TO authenticated
  USING (public.is_project_user(id));

-- INSERT: authenticated herkes proje oluşturabilir (otomatik owner trigger devreye girer)
CREATE POLICY projeler_insert ON public.projeler
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- UPDATE: manager+ (proje düzenleme)
CREATE POLICY projeler_update ON public.projeler
  FOR UPDATE TO authenticated
  USING (public.is_project_manager(id))
  WITH CHECK (public.is_project_manager(id));

-- DELETE: sadece owner
CREATE POLICY projeler_delete ON public.projeler
  FOR DELETE TO authenticated
  USING (public.is_project_owner(id));

COMMIT;
