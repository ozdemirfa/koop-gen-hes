-- Migration: 20260510000008_rls_proje_uyelikleri.sql
-- Description: Proje bazlı RLS izolasyonu — defense in depth.
-- Backend service-role kullandığı için bu policy'ler normal akışta bypass edilir;
-- ama anon-key ile sorgu, service-role key sızıntısı veya multi-tenant senaryoda
-- proje izolasyonu devreye girer. Mevcut user_roles üyeleri tüm projelere otomatik
-- seed edilerek geriye uyumluluk korunur (kırılma yok); yeni kullanıcılar için
-- explicit proje atama gerekir.

BEGIN;

-- 1. proje_uyelikleri tablosu: kullanıcı-proje-rol haritası
CREATE TABLE IF NOT EXISTS public.proje_uyelikleri (
    user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    proje_id   UUID NOT NULL REFERENCES public.projeler(id) ON DELETE CASCADE,
    rol        VARCHAR(20) NOT NULL DEFAULT 'staff' CHECK (rol IN ('admin', 'staff', 'viewer')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, proje_id)
);

CREATE INDEX IF NOT EXISTS idx_proje_uyelikleri_proje
    ON public.proje_uyelikleri (proje_id);

COMMENT ON TABLE public.proje_uyelikleri IS
    'Kullanıcı-proje-rol haritası. is_project_member() helper bu tabloya bakar.';

-- 2. RLS proje_uyelikleri için: admin yönetir, kullanıcı kendi kayıtlarını okur
ALTER TABLE public.proje_uyelikleri ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS proje_uyelikleri_admin_manage ON public.proje_uyelikleri;
CREATE POLICY proje_uyelikleri_admin_manage
    ON public.proje_uyelikleri
    FOR ALL TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS proje_uyelikleri_self_read ON public.proje_uyelikleri;
CREATE POLICY proje_uyelikleri_self_read
    ON public.proje_uyelikleri
    FOR SELECT TO authenticated
    USING (user_id = auth.uid());

-- Eski legacy policy'ler (DO bloğunun proje_uyelikleri'ne dokunmaması için emniyet)
DROP POLICY IF EXISTS "Admins have full access" ON public.proje_uyelikleri;
DROP POLICY IF EXISTS "Staff can read all" ON public.proje_uyelikleri;
DROP POLICY IF EXISTS "Staff can insert activity" ON public.proje_uyelikleri;
DROP POLICY IF EXISTS authenticated_full_access ON public.proje_uyelikleri;

-- 3. is_project_member helper — RLS policy'lerinde kullanılır
CREATE OR REPLACE FUNCTION public.is_project_member(p_proje_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.proje_uyelikleri
    WHERE user_id = auth.uid() AND proje_id = p_proje_id
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

COMMENT ON FUNCTION public.is_project_member IS
    'auth.uid() verilen proje_id''nin üyesi mi? RLS policy''lerinde kullanılır. NULL proje_id için her zaman FALSE döner.';

-- 4. Geriye uyumluluk seed: mevcut user_roles içindeki tüm kullanıcıları
-- tüm projelere üye yap. Yeni eklenen kullanıcılar için admin UI/SQL ile
-- explicit atama gerekir.
INSERT INTO public.proje_uyelikleri (user_id, proje_id, rol)
SELECT ur.user_id, p.id, ur.role
FROM public.user_roles ur
CROSS JOIN public.projeler p
ON CONFLICT (user_id, proje_id) DO NOTHING;

-- 5. Ana finansal tablolarda RLS policy refactor
-- Mevcut geniş policy'leri ('Admins have full access', 'Staff can read all',
-- 'Staff can insert activity', '{tbl}_access') düşür ve tek bir
-- '{tbl}_proje_isolation' policy'siyle değiştir.
DO $$
DECLARE
    tbl TEXT;
    legacy_policy TEXT;
    legacy_policies TEXT[] := ARRAY[
        'Admins have full access',
        'Staff can read all',
        'Staff can insert activity',
        'authenticated_full_access'
    ];
    target_tables TEXT[] := ARRAY[
        'cari_hesaplar',
        'cari_hareketler',
        'aidatlar',
        'faturalar',
        'hakedisler',
        'banka_hesaplari',
        'banka_hareketleri',
        'cekler'
    ];
BEGIN
    FOREACH tbl IN ARRAY target_tables LOOP
        FOREACH legacy_policy IN ARRAY legacy_policies LOOP
            EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', legacy_policy, tbl);
        END LOOP;
        -- tabloya özgü ad'lı eski policy'ler (örn. cari_hesaplar_access)
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', tbl || '_access', tbl);
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', tbl || '_proje_isolation', tbl);

        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);

        -- Yeni proje izolasyon policy'si:
        --  - admin global erişim
        --  - staff/viewer sadece üyesi olduğu projelerin satırlarını görür
        --  - proje_id NULL olan satırlar (örn. project'e atanmamış çek) sadece admin'e açık
        EXECUTE format(
            'CREATE POLICY %I ON public.%I
                FOR ALL TO authenticated
                USING (public.is_admin() OR public.is_project_member(proje_id))
                WITH CHECK (public.is_admin() OR public.is_project_member(proje_id))',
            tbl || '_proje_isolation', tbl
        );
    END LOOP;
END $$;

-- 6. Child tablolar — parent'a join üzerinden proje izolasyonu
-- proje_id direkt yok; parent (faturalar, hakedisler, aidatlar) üzerinden çekilir.

-- 6a. fatura_kalemleri → faturalar.proje_id
DROP POLICY IF EXISTS "Admins have full access" ON public.fatura_kalemleri;
DROP POLICY IF EXISTS "Staff can read all" ON public.fatura_kalemleri;
DROP POLICY IF EXISTS "Staff can insert activity" ON public.fatura_kalemleri;
DROP POLICY IF EXISTS authenticated_full_access ON public.fatura_kalemleri;
DROP POLICY IF EXISTS fatura_kalemleri_proje_isolation ON public.fatura_kalemleri;

ALTER TABLE public.fatura_kalemleri ENABLE ROW LEVEL SECURITY;

CREATE POLICY fatura_kalemleri_proje_isolation
    ON public.fatura_kalemleri
    FOR ALL TO authenticated
    USING (
        public.is_admin() OR EXISTS (
            SELECT 1 FROM public.faturalar f
            WHERE f.id = fatura_kalemleri.fatura_id
              AND public.is_project_member(f.proje_id)
        )
    )
    WITH CHECK (
        public.is_admin() OR EXISTS (
            SELECT 1 FROM public.faturalar f
            WHERE f.id = fatura_kalemleri.fatura_id
              AND public.is_project_member(f.proje_id)
        )
    );

-- 6b. hakedis_kalemleri → hakedisler.proje_id
DROP POLICY IF EXISTS "Admins have full access" ON public.hakedis_kalemleri;
DROP POLICY IF EXISTS "Staff can read all" ON public.hakedis_kalemleri;
DROP POLICY IF EXISTS "Staff can insert activity" ON public.hakedis_kalemleri;
DROP POLICY IF EXISTS authenticated_full_access ON public.hakedis_kalemleri;
DROP POLICY IF EXISTS hakedis_kalemleri_proje_isolation ON public.hakedis_kalemleri;

ALTER TABLE public.hakedis_kalemleri ENABLE ROW LEVEL SECURITY;

CREATE POLICY hakedis_kalemleri_proje_isolation
    ON public.hakedis_kalemleri
    FOR ALL TO authenticated
    USING (
        public.is_admin() OR EXISTS (
            SELECT 1 FROM public.hakedisler h
            WHERE h.id = hakedis_kalemleri.hakedis_id
              AND public.is_project_member(h.proje_id)
        )
    )
    WITH CHECK (
        public.is_admin() OR EXISTS (
            SELECT 1 FROM public.hakedisler h
            WHERE h.id = hakedis_kalemleri.hakedis_id
              AND public.is_project_member(h.proje_id)
        )
    );

-- 6c. aidat_odemeleri → aidatlar.proje_id (tablo varsa uygulanır)
DO $$
BEGIN
    IF to_regclass('public.aidat_odemeleri') IS NOT NULL THEN
        EXECUTE 'DROP POLICY IF EXISTS "Admins have full access" ON public.aidat_odemeleri';
        EXECUTE 'DROP POLICY IF EXISTS "Staff can read all" ON public.aidat_odemeleri';
        EXECUTE 'DROP POLICY IF EXISTS "Staff can insert activity" ON public.aidat_odemeleri';
        EXECUTE 'DROP POLICY IF EXISTS authenticated_full_access ON public.aidat_odemeleri';
        EXECUTE 'DROP POLICY IF EXISTS aidat_odemeleri_proje_isolation ON public.aidat_odemeleri';
        EXECUTE 'ALTER TABLE public.aidat_odemeleri ENABLE ROW LEVEL SECURITY';
        EXECUTE $pol$
            CREATE POLICY aidat_odemeleri_proje_isolation
                ON public.aidat_odemeleri
                FOR ALL TO authenticated
                USING (
                    public.is_admin() OR EXISTS (
                        SELECT 1 FROM public.aidatlar a
                        WHERE a.id = aidat_odemeleri.aidat_id
                          AND public.is_project_member(a.proje_id)
                    )
                )
                WITH CHECK (
                    public.is_admin() OR EXISTS (
                        SELECT 1 FROM public.aidatlar a
                        WHERE a.id = aidat_odemeleri.aidat_id
                          AND public.is_project_member(a.proje_id)
                    )
                )
        $pol$;
    END IF;
END $$;

COMMIT;
