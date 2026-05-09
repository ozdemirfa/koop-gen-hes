-- Migration: 20260510000009_rls_proje_uyelikleri_faz2.sql
-- Description: Sprint G/Faz 2 — master-data tablolarına proje izolasyon RLS'i.
-- Faz 1 (20260510000008) finansal kritik 8 ana tablo + 3 child kapsamıştı.
-- Bu faz aşağıdaki master-data + destek tablolarını kapsıyor:
--   - 7 ana (proje_id direkt): aidat_tanimlari, bloklar, uyeler, sozlesmeler,
--                              serefiye_tablosu, birikmis_teminatlar, irsaliyeler
--   - 2 child (parent join):   irsaliye_kalemleri → irsaliyeler,
--                              malzeme_teslimleri → sozlesmeler (sozlesme_id NULL ise admin only)
-- Kapsam dışı: firmalar (intentionally global, 20260420000001'de proje_id drop edildi),
--              pozlar/birimler/parametreler (genel master-data UI tanımları).
-- Backend service-role kullandığı için bu policy'ler bypass edilir; defense in depth.

BEGIN;

-- 1. Ana finansal/master-data tablolarda RLS policy refactor (proje_id direkt)
DO $$
DECLARE
    tbl TEXT;
    legacy_policy TEXT;
    legacy_policies TEXT[] := ARRAY[
        'Admins have full access',
        'Staff can read all',
        'Staff can insert activity',
        'authenticated_full_access',
        'Allow authenticated users to read guarantees'
    ];
    target_tables TEXT[] := ARRAY[
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
        FOREACH legacy_policy IN ARRAY legacy_policies LOOP
            EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', legacy_policy, tbl);
        END LOOP;
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', tbl || '_access', tbl);
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', tbl || '_proje_isolation', tbl);

        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);

        -- proje_id NULL olan satırlar (örn. eski seed datası) sadece admin'e açık.
        EXECUTE format(
            'CREATE POLICY %I ON public.%I
                FOR ALL TO authenticated
                USING (public.is_admin() OR public.is_project_member(proje_id))
                WITH CHECK (public.is_admin() OR public.is_project_member(proje_id))',
            tbl || '_proje_isolation', tbl
        );
    END LOOP;
END $$;

-- 2. Child tablolar — parent join üzerinden

-- 2a. irsaliye_kalemleri → irsaliyeler.proje_id
DROP POLICY IF EXISTS "Admins have full access" ON public.irsaliye_kalemleri;
DROP POLICY IF EXISTS "Staff can read all" ON public.irsaliye_kalemleri;
DROP POLICY IF EXISTS "Staff can insert activity" ON public.irsaliye_kalemleri;
DROP POLICY IF EXISTS authenticated_full_access ON public.irsaliye_kalemleri;
DROP POLICY IF EXISTS irsaliye_kalemleri_proje_isolation ON public.irsaliye_kalemleri;

ALTER TABLE public.irsaliye_kalemleri ENABLE ROW LEVEL SECURITY;

CREATE POLICY irsaliye_kalemleri_proje_isolation
    ON public.irsaliye_kalemleri
    FOR ALL TO authenticated
    USING (
        public.is_admin() OR EXISTS (
            SELECT 1 FROM public.irsaliyeler i
            WHERE i.id = irsaliye_kalemleri.irsaliye_id
              AND public.is_project_member(i.proje_id)
        )
    )
    WITH CHECK (
        public.is_admin() OR EXISTS (
            SELECT 1 FROM public.irsaliyeler i
            WHERE i.id = irsaliye_kalemleri.irsaliye_id
              AND public.is_project_member(i.proje_id)
        )
    );

-- 2b. malzeme_teslimleri → sozlesmeler.proje_id (sozlesme_id NULLABLE)
-- sozlesme_id NULL olduğunda EXISTS FALSE döner → sadece admin görür (defansif).
DROP POLICY IF EXISTS "Admins have full access" ON public.malzeme_teslimleri;
DROP POLICY IF EXISTS "Staff can read all" ON public.malzeme_teslimleri;
DROP POLICY IF EXISTS "Staff can insert activity" ON public.malzeme_teslimleri;
DROP POLICY IF EXISTS authenticated_full_access ON public.malzeme_teslimleri;
DROP POLICY IF EXISTS malzeme_teslimleri_proje_isolation ON public.malzeme_teslimleri;

ALTER TABLE public.malzeme_teslimleri ENABLE ROW LEVEL SECURITY;

CREATE POLICY malzeme_teslimleri_proje_isolation
    ON public.malzeme_teslimleri
    FOR ALL TO authenticated
    USING (
        public.is_admin() OR EXISTS (
            SELECT 1 FROM public.sozlesmeler s
            WHERE s.id = malzeme_teslimleri.sozlesme_id
              AND public.is_project_member(s.proje_id)
        )
    )
    WITH CHECK (
        public.is_admin() OR EXISTS (
            SELECT 1 FROM public.sozlesmeler s
            WHERE s.id = malzeme_teslimleri.sozlesme_id
              AND public.is_project_member(s.proje_id)
        )
    );

COMMIT;
