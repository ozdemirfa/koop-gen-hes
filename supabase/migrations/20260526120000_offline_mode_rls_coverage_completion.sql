-- Migration: 20260526120000_offline_mode_rls_coverage_completion.sql
-- Sprint: web-offline-gating-investigation (2026-05-26) — RLS coverage gap kapatma
--
-- Description:
--   Prod audit sonucu: `{tablo}_offline_lock_{ins|upd|del}` policy'si olan 15 tablo
--   mevcut; aşağıdaki tablolarda eksik (gap). Bu migration eksikleri kapatır.
--
-- Gap analizi:
--   EKLENECEK (proje_id direkt taşıyanlar):
--     cari_hesaplar, irsaliyeler, birikmis_teminatlar, serefiye_tablosu,
--     yillik_harcama_planlari
--
--   EKLENECEK (child — parent join):
--     fatura_kalemleri  → faturalar.proje_id
--     irsaliye_kalemleri → irsaliyeler.proje_id
--
--   KAPSAM DIŞI (global tablolar — proje_id yok, offline lock uygulanamaz):
--     firmalar     — 20260420000001 ile global yapıldı; proje bazlı lock imkansız.
--     birimler     — Global referans tablo; 20260524130000'da is_admin korumalı.
--     pozlar       — Global referans tablo; aynı şekilde korumalı.
--
-- Smoking gun fix:
--   faturalar parent INSERT policy ile korumalı ama mevcut fatura'ya child kalem
--   eklenmesi (fatura_kalemleri INSERT) bloklenmıyordu. Bu migration kapatır.
--
-- Pattern:
--   20260526210000_offline_mode_rls_propagation.sql ile birebir tutarlı.
--   Mevcut policy'ler DROP + yeniden yaratılır (WITH CHECK offline guard AND'lenir).
--   SELECT policy'lere DOKUNULMAZ (okuma açık kalır).
--   DELETE: USING clause — is_project_manager + can_write_offline_project.
--
-- Bağımlılıklar:
--   20260524150000_projeler_offline_mode.sql       → can_write_offline_project(uuid)
--   20260520000010_role_v2_expand.sql              → is_project_user(), is_project_manager()
--   20260520000013_role_v2_rls_refactor.sql        → mevcut policy'ler (DROP hedefleri)
--
-- Rollback:
--   Her DROP + CREATE çiftini tersine çevir: AND can_write_offline_project(...) kısmını
--   kaldırarak 20260520000013 pattern'ına geri dön.

BEGIN;

-- ---------------------------------------------------------------------------
-- 0. Helper varlık kontrolü
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'can_write_offline_project'
  ) THEN
    RAISE EXCEPTION 'can_write_offline_project(uuid) bulunamadi — once 20260524150000_projeler_offline_mode.sql calistirilmali';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 1. cari_hesaplar — proje_id direkt
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS cari_hesaplar_offline_lock_ins ON public.cari_hesaplar;
CREATE POLICY cari_hesaplar_offline_lock_ins ON public.cari_hesaplar
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_project_user(proje_id)
    AND public.can_write_offline_project(proje_id)
  );

COMMENT ON POLICY cari_hesaplar_offline_lock_ins ON public.cari_hesaplar IS
  'Cari hesap ekle: proje uyesi + offline modda yalniz offline_mode_owner_id. web-offline-gating sprint, 2026-05-26.';

DROP POLICY IF EXISTS cari_hesaplar_offline_lock_upd ON public.cari_hesaplar;
CREATE POLICY cari_hesaplar_offline_lock_upd ON public.cari_hesaplar
  FOR UPDATE TO authenticated
  USING (
    public.is_project_user(proje_id)
    AND public.can_write_offline_project(proje_id)
  )
  WITH CHECK (
    public.is_project_user(proje_id)
    AND public.can_write_offline_project(proje_id)
  );

COMMENT ON POLICY cari_hesaplar_offline_lock_upd ON public.cari_hesaplar IS
  'Cari hesap guncelle: proje uyesi + offline guard. web-offline-gating sprint, 2026-05-26.';

DROP POLICY IF EXISTS cari_hesaplar_offline_lock_del ON public.cari_hesaplar;
CREATE POLICY cari_hesaplar_offline_lock_del ON public.cari_hesaplar
  FOR DELETE TO authenticated
  USING (
    public.is_project_manager(proje_id)
    AND public.can_write_offline_project(proje_id)
  );

COMMENT ON POLICY cari_hesaplar_offline_lock_del ON public.cari_hesaplar IS
  'Cari hesap sil: manager+ + offline guard. web-offline-gating sprint, 2026-05-26.';

-- ---------------------------------------------------------------------------
-- 2. irsaliyeler — proje_id direkt
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS irsaliyeler_offline_lock_ins ON public.irsaliyeler;
CREATE POLICY irsaliyeler_offline_lock_ins ON public.irsaliyeler
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_project_user(proje_id)
    AND public.can_write_offline_project(proje_id)
  );

COMMENT ON POLICY irsaliyeler_offline_lock_ins ON public.irsaliyeler IS
  'Irsaliye ekle: proje uyesi + offline guard. web-offline-gating sprint, 2026-05-26.';

DROP POLICY IF EXISTS irsaliyeler_offline_lock_upd ON public.irsaliyeler;
CREATE POLICY irsaliyeler_offline_lock_upd ON public.irsaliyeler
  FOR UPDATE TO authenticated
  USING (
    public.is_project_user(proje_id)
    AND public.can_write_offline_project(proje_id)
  )
  WITH CHECK (
    public.is_project_user(proje_id)
    AND public.can_write_offline_project(proje_id)
  );

COMMENT ON POLICY irsaliyeler_offline_lock_upd ON public.irsaliyeler IS
  'Irsaliye guncelle: proje uyesi + offline guard. web-offline-gating sprint, 2026-05-26.';

DROP POLICY IF EXISTS irsaliyeler_offline_lock_del ON public.irsaliyeler;
CREATE POLICY irsaliyeler_offline_lock_del ON public.irsaliyeler
  FOR DELETE TO authenticated
  USING (
    public.is_project_manager(proje_id)
    AND public.can_write_offline_project(proje_id)
  );

COMMENT ON POLICY irsaliyeler_offline_lock_del ON public.irsaliyeler IS
  'Irsaliye sil: manager+ + offline guard. web-offline-gating sprint, 2026-05-26.';

-- ---------------------------------------------------------------------------
-- 3. birikmis_teminatlar — proje_id direkt
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS birikmis_teminatlar_offline_lock_ins ON public.birikmis_teminatlar;
CREATE POLICY birikmis_teminatlar_offline_lock_ins ON public.birikmis_teminatlar
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_project_user(proje_id)
    AND public.can_write_offline_project(proje_id)
  );

COMMENT ON POLICY birikmis_teminatlar_offline_lock_ins ON public.birikmis_teminatlar IS
  'Teminat ekle: proje uyesi + offline guard. web-offline-gating sprint, 2026-05-26.';

DROP POLICY IF EXISTS birikmis_teminatlar_offline_lock_upd ON public.birikmis_teminatlar;
CREATE POLICY birikmis_teminatlar_offline_lock_upd ON public.birikmis_teminatlar
  FOR UPDATE TO authenticated
  USING (
    public.is_project_user(proje_id)
    AND public.can_write_offline_project(proje_id)
  )
  WITH CHECK (
    public.is_project_user(proje_id)
    AND public.can_write_offline_project(proje_id)
  );

COMMENT ON POLICY birikmis_teminatlar_offline_lock_upd ON public.birikmis_teminatlar IS
  'Teminat guncelle: proje uyesi + offline guard. web-offline-gating sprint, 2026-05-26.';

DROP POLICY IF EXISTS birikmis_teminatlar_offline_lock_del ON public.birikmis_teminatlar;
CREATE POLICY birikmis_teminatlar_offline_lock_del ON public.birikmis_teminatlar
  FOR DELETE TO authenticated
  USING (
    public.is_project_manager(proje_id)
    AND public.can_write_offline_project(proje_id)
  );

COMMENT ON POLICY birikmis_teminatlar_offline_lock_del ON public.birikmis_teminatlar IS
  'Teminat sil: manager+ + offline guard. web-offline-gating sprint, 2026-05-26.';

-- ---------------------------------------------------------------------------
-- 4. serefiye_tablosu — proje_id direkt
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS serefiye_tablosu_offline_lock_ins ON public.serefiye_tablosu;
CREATE POLICY serefiye_tablosu_offline_lock_ins ON public.serefiye_tablosu
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_project_user(proje_id)
    AND public.can_write_offline_project(proje_id)
  );

COMMENT ON POLICY serefiye_tablosu_offline_lock_ins ON public.serefiye_tablosu IS
  'Serefiye kaydı ekle: proje uyesi + offline guard. web-offline-gating sprint, 2026-05-26.';

DROP POLICY IF EXISTS serefiye_tablosu_offline_lock_upd ON public.serefiye_tablosu;
CREATE POLICY serefiye_tablosu_offline_lock_upd ON public.serefiye_tablosu
  FOR UPDATE TO authenticated
  USING (
    public.is_project_user(proje_id)
    AND public.can_write_offline_project(proje_id)
  )
  WITH CHECK (
    public.is_project_user(proje_id)
    AND public.can_write_offline_project(proje_id)
  );

COMMENT ON POLICY serefiye_tablosu_offline_lock_upd ON public.serefiye_tablosu IS
  'Serefiye kaydı guncelle: proje uyesi + offline guard. web-offline-gating sprint, 2026-05-26.';

DROP POLICY IF EXISTS serefiye_tablosu_offline_lock_del ON public.serefiye_tablosu;
CREATE POLICY serefiye_tablosu_offline_lock_del ON public.serefiye_tablosu
  FOR DELETE TO authenticated
  USING (
    public.is_project_manager(proje_id)
    AND public.can_write_offline_project(proje_id)
  );

COMMENT ON POLICY serefiye_tablosu_offline_lock_del ON public.serefiye_tablosu IS
  'Serefiye kaydı sil: manager+ + offline guard. web-offline-gating sprint, 2026-05-26.';

-- ---------------------------------------------------------------------------
-- 5. yillik_harcama_planlari — proje_id direkt
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS yillik_harcama_planlari_offline_lock_ins ON public.yillik_harcama_planlari;
CREATE POLICY yillik_harcama_planlari_offline_lock_ins ON public.yillik_harcama_planlari
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_project_user(proje_id)
    AND public.can_write_offline_project(proje_id)
  );

COMMENT ON POLICY yillik_harcama_planlari_offline_lock_ins ON public.yillik_harcama_planlari IS
  'Yillik plan ekle: proje uyesi + offline guard. web-offline-gating sprint, 2026-05-26.';

DROP POLICY IF EXISTS yillik_harcama_planlari_offline_lock_upd ON public.yillik_harcama_planlari;
CREATE POLICY yillik_harcama_planlari_offline_lock_upd ON public.yillik_harcama_planlari
  FOR UPDATE TO authenticated
  USING (
    public.is_project_user(proje_id)
    AND public.can_write_offline_project(proje_id)
  )
  WITH CHECK (
    public.is_project_user(proje_id)
    AND public.can_write_offline_project(proje_id)
  );

COMMENT ON POLICY yillik_harcama_planlari_offline_lock_upd ON public.yillik_harcama_planlari IS
  'Yillik plan guncelle: proje uyesi + offline guard. web-offline-gating sprint, 2026-05-26.';

DROP POLICY IF EXISTS yillik_harcama_planlari_offline_lock_del ON public.yillik_harcama_planlari;
CREATE POLICY yillik_harcama_planlari_offline_lock_del ON public.yillik_harcama_planlari
  FOR DELETE TO authenticated
  USING (
    public.is_project_manager(proje_id)
    AND public.can_write_offline_project(proje_id)
  );

COMMENT ON POLICY yillik_harcama_planlari_offline_lock_del ON public.yillik_harcama_planlari IS
  'Yillik plan sil: manager+ + offline guard. web-offline-gating sprint, 2026-05-26.';

-- ---------------------------------------------------------------------------
-- 6. fatura_kalemleri — faturalar.proje_id (child join) — SMOKING GUN
-- ---------------------------------------------------------------------------
-- faturalar INSERT policy offline-locked ama mevcut faturaya kalem eklenmesi
-- (fatura_kalemleri INSERT) bloklanmiyordu — bu gap kapatilir.

DROP POLICY IF EXISTS fatura_kalemleri_offline_lock_ins ON public.fatura_kalemleri;
CREATE POLICY fatura_kalemleri_offline_lock_ins ON public.fatura_kalemleri
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.faturalar f
    WHERE f.id = fatura_kalemleri.fatura_id
      AND public.is_project_user(f.proje_id)
      AND public.can_write_offline_project(f.proje_id)
  ));

COMMENT ON POLICY fatura_kalemleri_offline_lock_ins ON public.fatura_kalemleri IS
  'Fatura kalemi ekle: parent fatura uzerinden proje uyesi + offline guard. Smoking gun fix. web-offline-gating sprint, 2026-05-26.';

DROP POLICY IF EXISTS fatura_kalemleri_offline_lock_upd ON public.fatura_kalemleri;
CREATE POLICY fatura_kalemleri_offline_lock_upd ON public.fatura_kalemleri
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

COMMENT ON POLICY fatura_kalemleri_offline_lock_upd ON public.fatura_kalemleri IS
  'Fatura kalemi guncelle: parent fatura uzerinden proje uyesi + offline guard. web-offline-gating sprint, 2026-05-26.';

DROP POLICY IF EXISTS fatura_kalemleri_offline_lock_del ON public.fatura_kalemleri;
CREATE POLICY fatura_kalemleri_offline_lock_del ON public.fatura_kalemleri
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.faturalar f
    WHERE f.id = fatura_kalemleri.fatura_id
      AND public.is_project_manager(f.proje_id)
      AND public.can_write_offline_project(f.proje_id)
  ));

COMMENT ON POLICY fatura_kalemleri_offline_lock_del ON public.fatura_kalemleri IS
  'Fatura kalemi sil: parent fatura uzerinden manager+ + offline guard. web-offline-gating sprint, 2026-05-26.';

-- ---------------------------------------------------------------------------
-- 7. irsaliye_kalemleri — irsaliyeler.proje_id (child join)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS irsaliye_kalemleri_offline_lock_ins ON public.irsaliye_kalemleri;
CREATE POLICY irsaliye_kalemleri_offline_lock_ins ON public.irsaliye_kalemleri
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.irsaliyeler i
    WHERE i.id = irsaliye_kalemleri.irsaliye_id
      AND public.is_project_user(i.proje_id)
      AND public.can_write_offline_project(i.proje_id)
  ));

COMMENT ON POLICY irsaliye_kalemleri_offline_lock_ins ON public.irsaliye_kalemleri IS
  'Irsaliye kalemi ekle: parent irsaliye uzerinden proje uyesi + offline guard. web-offline-gating sprint, 2026-05-26.';

DROP POLICY IF EXISTS irsaliye_kalemleri_offline_lock_upd ON public.irsaliye_kalemleri;
CREATE POLICY irsaliye_kalemleri_offline_lock_upd ON public.irsaliye_kalemleri
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

COMMENT ON POLICY irsaliye_kalemleri_offline_lock_upd ON public.irsaliye_kalemleri IS
  'Irsaliye kalemi guncelle: parent irsaliye uzerinden proje uyesi + offline guard. web-offline-gating sprint, 2026-05-26.';

DROP POLICY IF EXISTS irsaliye_kalemleri_offline_lock_del ON public.irsaliye_kalemleri;
CREATE POLICY irsaliye_kalemleri_offline_lock_del ON public.irsaliye_kalemleri
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.irsaliyeler i
    WHERE i.id = irsaliye_kalemleri.irsaliye_id
      AND public.is_project_manager(i.proje_id)
      AND public.can_write_offline_project(i.proje_id)
  ));

COMMENT ON POLICY irsaliye_kalemleri_offline_lock_del ON public.irsaliye_kalemleri IS
  'Irsaliye kalemi sil: parent irsaliye uzerinden manager+ + offline guard. web-offline-gating sprint, 2026-05-26.';

-- ---------------------------------------------------------------------------
-- 8. Dogrulama
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  new_policy_count INTEGER;
BEGIN
  SELECT count(*) INTO new_policy_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND policyname LIKE '%_offline_lock_%';

  RAISE NOTICE 'offline_lock policy toplami (bu migration sonrasi): %', new_policy_count;

  -- 7 tablo x 3 = 21 yeni policy bu migration ile eklendi.
  -- Onceki migrasyonlardan (20260526210000) gelenlere ek olarak toplam >= 21 olmali.
  IF new_policy_count < 21 THEN
    RAISE WARNING 'Beklenen en az 21 offline_lock policy; bulunan: %. Onceki migration uygulanmamis olabilir.', new_policy_count;
  END IF;
END $$;

COMMIT;
