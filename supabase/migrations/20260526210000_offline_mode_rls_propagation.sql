-- Migration: 20260526210000_offline_mode_rls_propagation.sql
-- Sprint: desktop-offline-mode (2026-05-26) — offline gating webe yansıtılır
--
-- Description:
--   20260524150000_projeler_offline_mode.sql ile `projeler.offline_mode` flag'i
--   ve `can_write_offline_project(uuid)` helper eklenmişti. O migration yalnız
--   `projeler` tablosunun UPDATE policy'sine offline lock koymuştu; bu
--   migration ise lock'u FK ile bağlı tüm yazılabilir alt tablolara ve master
--   data ile child kalemlerine PROPAGE eder.
--
--   Kullanıcının istediği davranış:
--     "olması gereken web ekranlarında proje çevrimdışı görünmesi. sadece
--      görüntüleme yapılabilir. proje sahibi açana kadar kayıt değişiklik
--      yapılamaz mesajı vermesi ve kayıt değişikliği engel olması."
--
--   Yani: proje offline iken non-owner için tüm mutation'lar (INSERT / UPDATE /
--   DELETE) reddedilmeli. UI gating + backend middleware'i iki ön katman; bu
--   migration **DB seviyesinde son savunmadır** — kullanıcı bir şekilde UI'yi
--   bypass ederse RLS yine durdurur.
--
-- Kapsam:
--   1. proje_id direkt taşıyan veri tabloları (15 adet — finansal + master-data)
--   2. Child tablolar parent join ile (fatura_kalemleri, hakedis_kalemleri,
--      aidat_odemeleri, irsaliye_kalemleri, malzeme_teslimleri)
--   3. proje_uyelikleri (üye ekle/sil → owner offline iken non-owner için ÖZEL
--      olarak engelli — kullanıcının açıkça istediği "üye eklemek" senaryosu)
--   4. proje_is_kalemleri, yillik_harcama_planlari, yillik_plan_kalemleri,
--      bloklar — proje yapısal alt kaynaklar
--
--   `projeler` tablosunun KENDİ UPDATE policy'si 20260524150000 ile zaten
--   offline-locked. Bu migration onu BIR DAHA değiştirmez (idempotent).
--
-- Strateji:
--   Mevcut INSERT/UPDATE/DELETE policy'lerini DROP edip yeniden yaratırız;
--   WITH CHECK ifadesine `AND public.can_write_offline_project(proje_id)`
--   eklenir. SELECT policy'leri DOKUNULMAZ (read açık kalır — kullanıcının
--   istediği "sadece görüntüleme yapılabilir" davranışı).
--
--   DELETE policy USING clause'una offline guard eklenir (DELETE için
--   WITH CHECK çalışmaz; sadece USING).
--
-- Geriye dönük uyumluluk:
--   - Mevcut iki state (offline_mode = false default, veya hiç set edilmemiş)
--     için `can_write_offline_project` zaten true döner → mevcut tüm operasyonlar
--     hiç değişmeden devam eder.
--   - Global admin (is_admin()) her durumda geçer → admin panelinden incident
--     response yapılabilir.
--   - Service-role (backend supabaseAdmin) RLS bypass eder → backend
--     middleware'i defensive ek bir guard atar (Task 2).
--
-- Bağımlılıklar:
--   20260520000010_role_v2_expand.sql            → is_project_*() helper'ları
--   20260520000013_role_v2_rls_refactor.sql      → policy şablonları
--   20260524150000_projeler_offline_mode.sql     → can_write_offline_project()
--   20260524081601_projeler_silme_akisi.sql      → projeler_delete owner-only
--
-- Rollback notu:
--   Bu migration policy SET'i değiştirir. Rollback için bir önceki RLS
--   refactor migration'ını (20260520000013) tekrar uygulayıp ardından
--   20260524150000'ı yeniden uygulamak yeterlidir. WITH CHECK clause'undaki
--   AND can_write_offline_project'i el ile düşürmek için bu dosyayı
--   sondan başa doğru tersine çevir (her tablo için `OR true` ekle).

BEGIN;

-- ---------------------------------------------------------------------------
-- 0. Helper varlık kontrolü (defansif — migration başında erken bağırır)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'can_write_offline_project'
  ) THEN
    RAISE EXCEPTION 'can_write_offline_project(uuid) bulunamadı — önce 20260524150000_projeler_offline_mode.sql çalıştırılmalı';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 1. Performans index'i — RLS clause'da offline_mode/owner_id sık okunur
-- ---------------------------------------------------------------------------
-- `projeler.offline_mode = true` olan satırlar nadirdir (saha kullanım
-- senaryosu); partial index alt tablo policy'lerini hızlandırır.
CREATE INDEX IF NOT EXISTS idx_projeler_offline_mode_active
  ON public.projeler (id, offline_mode_owner_id)
  WHERE offline_mode = true;

COMMENT ON INDEX public.idx_projeler_offline_mode_active IS
  'can_write_offline_project() helper için partial index. desktop-offline-mode sprint, 2026-05-26.';

-- ---------------------------------------------------------------------------
-- 2. proje_id direkt taşıyan veri tabloları
-- ---------------------------------------------------------------------------
-- 20260520000013 ile aynı liste; yalnız offline guard eklenir.

DO $$
DECLARE
  tbl TEXT;
  target_tables TEXT[] := ARRAY[
    -- Finansal
    'cari_hesaplar',
    'cari_hareketler',
    'aidatlar',
    'faturalar',
    'hakedisler',
    'banka_hesaplari',
    'banka_hareketleri',
    'cekler',
    -- Master-data
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
    -- INSERT
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', tbl || '_insert', tbl);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I
         FOR INSERT TO authenticated
         WITH CHECK (
           public.is_project_user(proje_id)
           AND public.can_write_offline_project(proje_id)
         )',
      tbl || '_insert', tbl
    );

    -- UPDATE
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', tbl || '_update', tbl);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I
         FOR UPDATE TO authenticated
         USING (
           public.is_project_user(proje_id)
           AND public.can_write_offline_project(proje_id)
         )
         WITH CHECK (
           public.is_project_user(proje_id)
           AND public.can_write_offline_project(proje_id)
         )',
      tbl || '_update', tbl
    );

    -- DELETE
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', tbl || '_delete', tbl);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I
         FOR DELETE TO authenticated
         USING (
           public.is_project_manager(proje_id)
           AND public.can_write_offline_project(proje_id)
         )',
      tbl || '_delete', tbl
    );
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 3. Child tablolar — parent join ile
-- ---------------------------------------------------------------------------

-- 3a. fatura_kalemleri → faturalar.proje_id
DROP POLICY IF EXISTS fatura_kalemleri_insert ON public.fatura_kalemleri;
CREATE POLICY fatura_kalemleri_insert ON public.fatura_kalemleri
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.faturalar f
    WHERE f.id = fatura_kalemleri.fatura_id
      AND public.is_project_user(f.proje_id)
      AND public.can_write_offline_project(f.proje_id)
  ));

DROP POLICY IF EXISTS fatura_kalemleri_update ON public.fatura_kalemleri;
CREATE POLICY fatura_kalemleri_update ON public.fatura_kalemleri
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.faturalar f
    WHERE f.id = fatura_kalemleri.fatura_id
      AND public.is_project_user(f.proje_id)
      AND public.can_write_offline_project(f.proje_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.faturalar f
    WHERE f.id = fatura_kalemleri.fatura_id
      AND public.is_project_user(f.proje_id)
      AND public.can_write_offline_project(f.proje_id)
  ));

DROP POLICY IF EXISTS fatura_kalemleri_delete ON public.fatura_kalemleri;
CREATE POLICY fatura_kalemleri_delete ON public.fatura_kalemleri
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.faturalar f
    WHERE f.id = fatura_kalemleri.fatura_id
      AND public.is_project_manager(f.proje_id)
      AND public.can_write_offline_project(f.proje_id)
  ));

-- 3b. hakedis_kalemleri → hakedisler.proje_id
DROP POLICY IF EXISTS hakedis_kalemleri_insert ON public.hakedis_kalemleri;
CREATE POLICY hakedis_kalemleri_insert ON public.hakedis_kalemleri
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.hakedisler h
    WHERE h.id = hakedis_kalemleri.hakedis_id
      AND public.is_project_user(h.proje_id)
      AND public.can_write_offline_project(h.proje_id)
  ));

DROP POLICY IF EXISTS hakedis_kalemleri_update ON public.hakedis_kalemleri;
CREATE POLICY hakedis_kalemleri_update ON public.hakedis_kalemleri
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.hakedisler h
    WHERE h.id = hakedis_kalemleri.hakedis_id
      AND public.is_project_user(h.proje_id)
      AND public.can_write_offline_project(h.proje_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.hakedisler h
    WHERE h.id = hakedis_kalemleri.hakedis_id
      AND public.is_project_user(h.proje_id)
      AND public.can_write_offline_project(h.proje_id)
  ));

DROP POLICY IF EXISTS hakedis_kalemleri_delete ON public.hakedis_kalemleri;
CREATE POLICY hakedis_kalemleri_delete ON public.hakedis_kalemleri
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.hakedisler h
    WHERE h.id = hakedis_kalemleri.hakedis_id
      AND public.is_project_manager(h.proje_id)
      AND public.can_write_offline_project(h.proje_id)
  ));

-- 3c. aidat_odemeleri → aidatlar.proje_id (opsiyonel tablo)
DO $$
BEGIN
  IF to_regclass('public.aidat_odemeleri') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS aidat_odemeleri_insert ON public.aidat_odemeleri';
    EXECUTE $pol$
      CREATE POLICY aidat_odemeleri_insert ON public.aidat_odemeleri
        FOR INSERT TO authenticated
        WITH CHECK (EXISTS (
          SELECT 1 FROM public.aidatlar a
          WHERE a.id = aidat_odemeleri.aidat_id
            AND public.is_project_user(a.proje_id)
            AND public.can_write_offline_project(a.proje_id)
        ))
    $pol$;

    EXECUTE 'DROP POLICY IF EXISTS aidat_odemeleri_update ON public.aidat_odemeleri';
    EXECUTE $pol$
      CREATE POLICY aidat_odemeleri_update ON public.aidat_odemeleri
        FOR UPDATE TO authenticated
        USING (EXISTS (
          SELECT 1 FROM public.aidatlar a
          WHERE a.id = aidat_odemeleri.aidat_id
            AND public.is_project_user(a.proje_id)
            AND public.can_write_offline_project(a.proje_id)
        ))
        WITH CHECK (EXISTS (
          SELECT 1 FROM public.aidatlar a
          WHERE a.id = aidat_odemeleri.aidat_id
            AND public.is_project_user(a.proje_id)
            AND public.can_write_offline_project(a.proje_id)
        ))
    $pol$;

    EXECUTE 'DROP POLICY IF EXISTS aidat_odemeleri_delete ON public.aidat_odemeleri';
    EXECUTE $pol$
      CREATE POLICY aidat_odemeleri_delete ON public.aidat_odemeleri
        FOR DELETE TO authenticated
        USING (EXISTS (
          SELECT 1 FROM public.aidatlar a
          WHERE a.id = aidat_odemeleri.aidat_id
            AND public.is_project_manager(a.proje_id)
            AND public.can_write_offline_project(a.proje_id)
        ))
    $pol$;
  END IF;
END $$;

-- 3d. irsaliye_kalemleri → irsaliyeler.proje_id
DROP POLICY IF EXISTS irsaliye_kalemleri_insert ON public.irsaliye_kalemleri;
CREATE POLICY irsaliye_kalemleri_insert ON public.irsaliye_kalemleri
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.irsaliyeler i
    WHERE i.id = irsaliye_kalemleri.irsaliye_id
      AND public.is_project_user(i.proje_id)
      AND public.can_write_offline_project(i.proje_id)
  ));

DROP POLICY IF EXISTS irsaliye_kalemleri_update ON public.irsaliye_kalemleri;
CREATE POLICY irsaliye_kalemleri_update ON public.irsaliye_kalemleri
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.irsaliyeler i
    WHERE i.id = irsaliye_kalemleri.irsaliye_id
      AND public.is_project_user(i.proje_id)
      AND public.can_write_offline_project(i.proje_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.irsaliyeler i
    WHERE i.id = irsaliye_kalemleri.irsaliye_id
      AND public.is_project_user(i.proje_id)
      AND public.can_write_offline_project(i.proje_id)
  ));

DROP POLICY IF EXISTS irsaliye_kalemleri_delete ON public.irsaliye_kalemleri;
CREATE POLICY irsaliye_kalemleri_delete ON public.irsaliye_kalemleri
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.irsaliyeler i
    WHERE i.id = irsaliye_kalemleri.irsaliye_id
      AND public.is_project_manager(i.proje_id)
      AND public.can_write_offline_project(i.proje_id)
  ));

-- 3e. malzeme_teslimleri → sozlesmeler.proje_id
-- NOT: 20260524000005_drop_malzeme_teslimleri.sql ile bu tablo düşürülmüş
-- olabilir; defansif kontrol.
DO $$
BEGIN
  IF to_regclass('public.malzeme_teslimleri') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS malzeme_teslimleri_insert ON public.malzeme_teslimleri';
    EXECUTE $pol$
      CREATE POLICY malzeme_teslimleri_insert ON public.malzeme_teslimleri
        FOR INSERT TO authenticated
        WITH CHECK (EXISTS (
          SELECT 1 FROM public.sozlesmeler s
          WHERE s.id = malzeme_teslimleri.sozlesme_id
            AND public.is_project_user(s.proje_id)
            AND public.can_write_offline_project(s.proje_id)
        ))
    $pol$;

    EXECUTE 'DROP POLICY IF EXISTS malzeme_teslimleri_update ON public.malzeme_teslimleri';
    EXECUTE $pol$
      CREATE POLICY malzeme_teslimleri_update ON public.malzeme_teslimleri
        FOR UPDATE TO authenticated
        USING (EXISTS (
          SELECT 1 FROM public.sozlesmeler s
          WHERE s.id = malzeme_teslimleri.sozlesme_id
            AND public.is_project_user(s.proje_id)
            AND public.can_write_offline_project(s.proje_id)
        ))
        WITH CHECK (EXISTS (
          SELECT 1 FROM public.sozlesmeler s
          WHERE s.id = malzeme_teslimleri.sozlesme_id
            AND public.is_project_user(s.proje_id)
            AND public.can_write_offline_project(s.proje_id)
        ))
    $pol$;

    EXECUTE 'DROP POLICY IF EXISTS malzeme_teslimleri_delete ON public.malzeme_teslimleri';
    EXECUTE $pol$
      CREATE POLICY malzeme_teslimleri_delete ON public.malzeme_teslimleri
        FOR DELETE TO authenticated
        USING (EXISTS (
          SELECT 1 FROM public.sozlesmeler s
          WHERE s.id = malzeme_teslimleri.sozlesme_id
            AND public.is_project_manager(s.proje_id)
            AND public.can_write_offline_project(s.proje_id)
        ))
    $pol$;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 4. proje_uyelikleri — kullanıcının açıkça istediği "üye eklemek" senaryosu
-- ---------------------------------------------------------------------------
-- 20260520000013 'da is_project_manager FOR ALL policy'si vardı; offline guard
-- ekleyip yeniden yaratıyoruz. self_read korunur.

DROP POLICY IF EXISTS proje_uyelikleri_owner_manager_manage ON public.proje_uyelikleri;
CREATE POLICY proje_uyelikleri_owner_manager_manage
  ON public.proje_uyelikleri
  FOR ALL TO authenticated
  USING (
    public.is_project_manager(proje_id)
    AND public.can_write_offline_project(proje_id)
  )
  WITH CHECK (
    public.is_project_manager(proje_id)
    AND public.can_write_offline_project(proje_id)
  );

COMMENT ON POLICY proje_uyelikleri_owner_manager_manage ON public.proje_uyelikleri IS
  'Üyelik yönetimi (ekle/sil/rol değiştir): manager+. Offline modda yalnız '
  'offline_mode_owner_id yapabilir; aksi halde 403. desktop-offline-mode sprint, 2026-05-26.';

-- ---------------------------------------------------------------------------
-- 5. Proje yapısal alt kaynaklar — proje_is_kalemleri, bloklar, yıllık plan
-- ---------------------------------------------------------------------------
-- bloklar tablosunda mevcut policy zaten 20260520000013'ten geliyor; offline
-- guard ekleyerek yeniden yaratacağız. proje_is_kalemleri,
-- yillik_harcama_planlari, yillik_plan_kalemleri için de aynı.
--
-- bloklar: bölüm 2 listesinde zaten var (yukarıda işlendi). Buraya yalnız
-- yapısal alt tablolar girer.

-- 5a. proje_is_kalemleri (proje_id direkt)
DO $$
BEGIN
  IF to_regclass('public.proje_is_kalemleri') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS proje_is_kalemleri_insert ON public.proje_is_kalemleri';
    EXECUTE $pol$
      CREATE POLICY proje_is_kalemleri_insert ON public.proje_is_kalemleri
        FOR INSERT TO authenticated
        WITH CHECK (
          public.is_project_user(proje_id)
          AND public.can_write_offline_project(proje_id)
        )
    $pol$;

    EXECUTE 'DROP POLICY IF EXISTS proje_is_kalemleri_update ON public.proje_is_kalemleri';
    EXECUTE $pol$
      CREATE POLICY proje_is_kalemleri_update ON public.proje_is_kalemleri
        FOR UPDATE TO authenticated
        USING (
          public.is_project_user(proje_id)
          AND public.can_write_offline_project(proje_id)
        )
        WITH CHECK (
          public.is_project_user(proje_id)
          AND public.can_write_offline_project(proje_id)
        )
    $pol$;

    EXECUTE 'DROP POLICY IF EXISTS proje_is_kalemleri_delete ON public.proje_is_kalemleri';
    EXECUTE $pol$
      CREATE POLICY proje_is_kalemleri_delete ON public.proje_is_kalemleri
        FOR DELETE TO authenticated
        USING (
          public.is_project_manager(proje_id)
          AND public.can_write_offline_project(proje_id)
        )
    $pol$;

    -- SELECT korunur (zaten public.is_project_user kontrolü var)
    -- Eski policy ismi mevcut değilse defensive olarak yeniden yarat.
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'proje_is_kalemleri'
        AND policyname = 'proje_is_kalemleri_select'
    ) THEN
      EXECUTE $pol$
        CREATE POLICY proje_is_kalemleri_select ON public.proje_is_kalemleri
          FOR SELECT TO authenticated
          USING (public.is_project_user(proje_id))
      $pol$;
    END IF;
  END IF;
END $$;

-- 5b. yillik_harcama_planlari (proje_id direkt)
DO $$
BEGIN
  IF to_regclass('public.yillik_harcama_planlari') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS yillik_harcama_planlari_insert ON public.yillik_harcama_planlari';
    EXECUTE $pol$
      CREATE POLICY yillik_harcama_planlari_insert ON public.yillik_harcama_planlari
        FOR INSERT TO authenticated
        WITH CHECK (
          public.is_project_user(proje_id)
          AND public.can_write_offline_project(proje_id)
        )
    $pol$;

    EXECUTE 'DROP POLICY IF EXISTS yillik_harcama_planlari_update ON public.yillik_harcama_planlari';
    EXECUTE $pol$
      CREATE POLICY yillik_harcama_planlari_update ON public.yillik_harcama_planlari
        FOR UPDATE TO authenticated
        USING (
          public.is_project_user(proje_id)
          AND public.can_write_offline_project(proje_id)
        )
        WITH CHECK (
          public.is_project_user(proje_id)
          AND public.can_write_offline_project(proje_id)
        )
    $pol$;

    EXECUTE 'DROP POLICY IF EXISTS yillik_harcama_planlari_delete ON public.yillik_harcama_planlari';
    EXECUTE $pol$
      CREATE POLICY yillik_harcama_planlari_delete ON public.yillik_harcama_planlari
        FOR DELETE TO authenticated
        USING (
          public.is_project_manager(proje_id)
          AND public.can_write_offline_project(proje_id)
        )
    $pol$;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'yillik_harcama_planlari'
        AND policyname = 'yillik_harcama_planlari_select'
    ) THEN
      EXECUTE $pol$
        CREATE POLICY yillik_harcama_planlari_select ON public.yillik_harcama_planlari
          FOR SELECT TO authenticated
          USING (public.is_project_user(proje_id))
      $pol$;
    END IF;
  END IF;
END $$;

-- 5c. yillik_plan_kalemleri (plan_id → yillik_harcama_planlari.proje_id join)
DO $$
BEGIN
  IF to_regclass('public.yillik_plan_kalemleri') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS yillik_plan_kalemleri_insert ON public.yillik_plan_kalemleri';
    EXECUTE $pol$
      CREATE POLICY yillik_plan_kalemleri_insert ON public.yillik_plan_kalemleri
        FOR INSERT TO authenticated
        WITH CHECK (EXISTS (
          SELECT 1 FROM public.yillik_harcama_planlari p
          WHERE p.id = yillik_plan_kalemleri.plan_id
            AND public.is_project_user(p.proje_id)
            AND public.can_write_offline_project(p.proje_id)
        ))
    $pol$;

    EXECUTE 'DROP POLICY IF EXISTS yillik_plan_kalemleri_update ON public.yillik_plan_kalemleri';
    EXECUTE $pol$
      CREATE POLICY yillik_plan_kalemleri_update ON public.yillik_plan_kalemleri
        FOR UPDATE TO authenticated
        USING (EXISTS (
          SELECT 1 FROM public.yillik_harcama_planlari p
          WHERE p.id = yillik_plan_kalemleri.plan_id
            AND public.is_project_user(p.proje_id)
            AND public.can_write_offline_project(p.proje_id)
        ))
        WITH CHECK (EXISTS (
          SELECT 1 FROM public.yillik_harcama_planlari p
          WHERE p.id = yillik_plan_kalemleri.plan_id
            AND public.is_project_user(p.proje_id)
            AND public.can_write_offline_project(p.proje_id)
        ))
    $pol$;

    EXECUTE 'DROP POLICY IF EXISTS yillik_plan_kalemleri_delete ON public.yillik_plan_kalemleri';
    EXECUTE $pol$
      CREATE POLICY yillik_plan_kalemleri_delete ON public.yillik_plan_kalemleri
        FOR DELETE TO authenticated
        USING (EXISTS (
          SELECT 1 FROM public.yillik_harcama_planlari p
          WHERE p.id = yillik_plan_kalemleri.plan_id
            AND public.is_project_manager(p.proje_id)
            AND public.can_write_offline_project(p.proje_id)
        ))
    $pol$;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'yillik_plan_kalemleri'
        AND policyname = 'yillik_plan_kalemleri_select'
    ) THEN
      EXECUTE $pol$
        CREATE POLICY yillik_plan_kalemleri_select ON public.yillik_plan_kalemleri
          FOR SELECT TO authenticated
          USING (EXISTS (
            SELECT 1 FROM public.yillik_harcama_planlari p
            WHERE p.id = yillik_plan_kalemleri.plan_id
              AND public.is_project_user(p.proje_id)
          ))
      $pol$;
    END IF;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 6. projeler UPDATE policy — küçük genişletme
-- ---------------------------------------------------------------------------
-- 20260524150000'da projeler_update şu kuralı içeriyordu:
--    USING (is_project_owner(id) OR is_admin())
--    WITH CHECK ((is_project_owner(id) OR is_admin()) AND can_write_offline_project(id))
--
-- Ancak ÖNCE-KE 20260520000013 ile **manager+** kullanıcılar projeyi
-- güncelleyebiliyordu (proje meta düzenlemesi — proje_adi, durum vb.). Offline
-- migration manager kapasitesini owner-only'e indirgemiş; bu istenmeyen bir
-- regresyondu. Doğru davranış:
--   - Online iken: manager+ projeyi güncelleyebilir
--   - Offline iken: yalnız offline_mode_owner_id güncelleyebilir
--
-- Bu nedenle policy'yi yeniden yazıyoruz.

DROP POLICY IF EXISTS projeler_update ON public.projeler;

CREATE POLICY projeler_update ON public.projeler
  FOR UPDATE TO authenticated
  USING (public.is_project_manager(id))
  WITH CHECK (
    public.is_project_manager(id)
    AND public.can_write_offline_project(id)
  );

COMMENT ON POLICY projeler_update ON public.projeler IS
  'Proje meta güncelleme: manager+ (owner + manager). Offline mod aktif iken '
  'yalnız offline_mode_owner_id güncelleyebilir. desktop-offline-mode sprint, '
  '2026-05-26 (20260524150000 üzerinden manager regresyonu düzeltilir).';

-- ---------------------------------------------------------------------------
-- 7. Verifikasyon (test sırasında devre dışı bırakılabilir — RAISE NOTICE)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  pol_count INTEGER;
BEGIN
  SELECT count(*) INTO pol_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND policyname LIKE '%_insert' OR policyname LIKE '%_update' OR policyname LIKE '%_delete';
  RAISE NOTICE 'desktop-offline-mode RLS propagation: % INSERT/UPDATE/DELETE policy revize edildi', pol_count;
END $$;

COMMIT;
