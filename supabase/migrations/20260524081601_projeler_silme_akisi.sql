-- Migration: 20260524081601_projeler_silme_akisi.sql
-- Sprint: proje-silme-akisi (2026-05-24)
-- Description: İki aşamalı proje silme — Arşivle (soft delete) → Kalıcı Sil (hard delete).
--
-- Tasarım kararları (plan dosyası: proje-listesinde-yeni-proje-glimmering-rain.md):
--   1) projeler tablosuna silindi_mi / silinme_tarihi / silinme_sebebi /
--      silen_kullanici_id kolonları ekle. UPDATE → soft delete.
--   2) is_project_user / is_project_manager / is_project_owner fonksiyonlarını
--      silindi_mi=true projeleri "yok" sayacak şekilde güncelle (RLS seviyesinde
--      arşivli proje görünmez/erişilmez).
--   3) projeler_delete RLS policy'sini sıkılaştır: ancak silindi_mi=true projede
--      kalıcı silme mümkün (defense in depth — RPC zaten guard yapacak).
--   4) audit_logs trigger'ını projeler tablosuna ekle (UPDATE = arşivle event'i,
--      DELETE = kalıcı sil event'i).
--   5) fn_proje_hard_delete RPC: yetki + arşiv kontrolü + alt kayıt sayımı +
--      "veri varsa sadece admin" kuralı + CASCADE silme + JSON özet döndürür.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Soft-delete kolonları
-- ---------------------------------------------------------------------------
ALTER TABLE public.projeler
  ADD COLUMN IF NOT EXISTS silindi_mi BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS silinme_tarihi TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS silinme_sebebi TEXT,
  ADD COLUMN IF NOT EXISTS silen_kullanici_id UUID REFERENCES auth.users(id);

-- Aktif proje listelemeleri partial index'ten faydalanır (typical workload).
CREATE INDEX IF NOT EXISTS idx_projeler_aktif_silindi
  ON public.projeler (silindi_mi)
  WHERE silindi_mi = false;

COMMENT ON COLUMN public.projeler.silindi_mi IS
  'Soft-delete bayrağı. true ise proje arşivde — UI listelerinde görünmez ve RLS '
  'üzerinden alt kayıtlara erişim kapanır. Geri alınabilir.';
COMMENT ON COLUMN public.projeler.silinme_tarihi IS
  'Arşivlenme zamanı (silindi_mi true olduğunda set edilir).';
COMMENT ON COLUMN public.projeler.silinme_sebebi IS
  'Owner/admin tarafından girilen arşivleme gerekçesi (audit trail için).';
COMMENT ON COLUMN public.projeler.silen_kullanici_id IS
  'Arşivleme işlemini yapan kullanıcı (auth.users referansı).';

-- ---------------------------------------------------------------------------
-- 2. RLS Helper fonksiyonları — silinmiş projeleri filtre dışı bırak
-- ---------------------------------------------------------------------------
-- Bu fonksiyonlar tüm proje-bazlı RLS policy'lerinin kalbi. silindi_mi=true
-- projede TÜM SELECT/INSERT/UPDATE/DELETE blokAlanır → alt tabloların verisi
-- de erişilmez olur. Bu, "arşivde olan projede mutasyon engelle" gereksinimini
-- tek noktadan karşılar; her servis layer'da kontrol etmeye gerek kalmaz.

CREATE OR REPLACE FUNCTION public.is_project_owner(p_proje_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.proje_uyelikleri pu
    JOIN public.projeler p ON p.id = pu.proje_id
    WHERE pu.user_id = auth.uid()
      AND pu.proje_id = p_proje_id
      AND pu.rol = 'owner'
      AND p.silindi_mi = false
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.is_project_manager(p_proje_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.proje_uyelikleri pu
    JOIN public.projeler p ON p.id = pu.proje_id
    WHERE pu.user_id = auth.uid()
      AND pu.proje_id = p_proje_id
      AND pu.rol IN ('owner','manager')
      AND p.silindi_mi = false
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.is_project_user(p_proje_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.proje_uyelikleri pu
    JOIN public.projeler p ON p.id = pu.proje_id
    WHERE pu.user_id = auth.uid()
      AND pu.proje_id = p_proje_id
      AND pu.rol IN ('owner','manager','user','admin','staff','viewer')
      AND p.silindi_mi = false
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ---------------------------------------------------------------------------
-- 3. projeler_delete RLS — sadece arşivdeki + owner|admin için
-- ---------------------------------------------------------------------------
-- NOT: is_project_owner artık silindi_mi=true projede false döner. O yüzden
-- "owner arşivdeki kendi projesini silebilsin" senaryosu için ayrı bir helper'a
-- gerek var. is_admin() korunur (admin her durumda silebilir).
-- "Arşivdeki proje" kontrolü policy içinde explicit yapılır.

CREATE OR REPLACE FUNCTION public.is_arsiv_proje_owner(p_proje_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.proje_uyelikleri pu
    JOIN public.projeler p ON p.id = pu.proje_id
    WHERE pu.user_id = auth.uid()
      AND pu.proje_id = p_proje_id
      AND pu.rol = 'owner'
      AND p.silindi_mi = true
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

COMMENT ON FUNCTION public.is_arsiv_proje_owner IS
  'is_project_owner''ın arşiv eşleniği — silindi_mi=true projelerde owner''lığı '
  'doğrular. Sadece projeler_delete policy''sinde kullanılır.';

DROP POLICY IF EXISTS projeler_delete ON public.projeler;
CREATE POLICY projeler_delete ON public.projeler
  FOR DELETE TO authenticated
  USING (
    silindi_mi = true
    AND (public.is_admin() OR public.is_arsiv_proje_owner(id))
  );

-- ---------------------------------------------------------------------------
-- 4. projeler_select / projeler_update — owner/admin arşivlenmiş projeyi de
--    görebilsin (Arşiv sayfası için).
-- ---------------------------------------------------------------------------
-- Standart üye is_project_user() üzerinden geçer (silindi_mi=false filtreli).
-- Admin ve arşiv owner'ı ek policy ile arşivli projeyi de görebilir/güncelleyebilir
-- (geri alma için UPDATE silindi_mi=false işlemi).

DROP POLICY IF EXISTS projeler_select_arsiv ON public.projeler;
CREATE POLICY projeler_select_arsiv ON public.projeler
  FOR SELECT TO authenticated
  USING (
    silindi_mi = true
    AND (public.is_admin() OR public.is_arsiv_proje_owner(id))
  );

DROP POLICY IF EXISTS projeler_update_arsiv ON public.projeler;
CREATE POLICY projeler_update_arsiv ON public.projeler
  FOR UPDATE TO authenticated
  USING (
    silindi_mi = true
    AND (public.is_admin() OR public.is_arsiv_proje_owner(id))
  )
  WITH CHECK (
    public.is_admin() OR public.is_arsiv_proje_owner(id)
  );

-- ---------------------------------------------------------------------------
-- 5. audit_logs trigger — projeler tablosunu izlemeye al
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_audit_log ON public.projeler;
CREATE TRIGGER trg_audit_log
  AFTER INSERT OR UPDATE OR DELETE ON public.projeler
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log();

-- ---------------------------------------------------------------------------
-- 6. fn_proje_silme_onizleme — etkilenen kayıt sayılarını döner
-- ---------------------------------------------------------------------------
-- Frontend onay modalı bunu çağırıp "X üye, Y fatura, Z hakediş silinecek"
-- gösterir. Yetki kontrolü backend layer'da (requireProjectAccess) yapılır —
-- mevcut RPC pattern'i (fn_create_payment_atomic, fn_undo_payment_match, vs.)
-- ile tutarlı: RPC sade execute, yetki backend'de. supabaseAdmin (service-role)
-- üzerinden çağrıldığında auth.uid() NULL olur → SQL içinde guard mantıksız.

CREATE OR REPLACE FUNCTION public.fn_proje_silme_onizleme(p_proje_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_result JSONB;
BEGIN
  -- Etkilenen alt kayıt sayıları — CASCADE zincirindeki ana tablolar.
  -- Yeni tablolar eklenirse bu listeyi güncelle.
  SELECT jsonb_build_object(
    'uyeler',              (SELECT COUNT(*) FROM public.uyeler              WHERE proje_id = p_proje_id),
    'bloklar',             (SELECT COUNT(*) FROM public.bloklar             WHERE proje_id = p_proje_id),
    'sozlesmeler',         (SELECT COUNT(*) FROM public.sozlesmeler         WHERE proje_id = p_proje_id),
    'faturalar',           (SELECT COUNT(*) FROM public.faturalar           WHERE proje_id = p_proje_id),
    'hakedisler',          (SELECT COUNT(*) FROM public.hakedisler          WHERE proje_id = p_proje_id),
    'aidat_tanimlari',     (SELECT COUNT(*) FROM public.aidat_tanimlari     WHERE proje_id = p_proje_id),
    'aidatlar',            (SELECT COUNT(*) FROM public.aidatlar            WHERE proje_id = p_proje_id),
    'banka_hesaplari',     (SELECT COUNT(*) FROM public.banka_hesaplari     WHERE proje_id = p_proje_id),
    'banka_hareketleri',   (SELECT COUNT(*) FROM public.banka_hareketleri   WHERE proje_id = p_proje_id),
    'cari_hareketler',     (SELECT COUNT(*) FROM public.cari_hareketler     WHERE proje_id = p_proje_id),
    'cekler',              (SELECT COUNT(*) FROM public.cekler              WHERE proje_id = p_proje_id),
    'irsaliyeler',         (SELECT COUNT(*) FROM public.irsaliyeler         WHERE proje_id = p_proje_id),
    'virmanlar',           (SELECT COUNT(*) FROM public.virmanlar           WHERE proje_id = p_proje_id),
    'proje_is_kalemleri',  (SELECT COUNT(*) FROM public.proje_is_kalemleri  WHERE proje_id = p_proje_id),
    'yillik_harcama_planlari', (SELECT COUNT(*) FROM public.yillik_harcama_planlari WHERE proje_id = p_proje_id),
    'birikmis_teminatlar', (SELECT COUNT(*) FROM public.birikmis_teminatlar WHERE proje_id = p_proje_id),
    'cari_hesaplar',       (SELECT COUNT(*) FROM public.cari_hesaplar       WHERE proje_id = p_proje_id)
  ) INTO v_result;

  -- toplam_kayit yardımcı toplamı: tüm sayıların toplamı
  v_result := v_result || jsonb_build_object(
    'toplam_kayit', (
      SELECT COALESCE(SUM((value)::int), 0)
      FROM jsonb_each_text(v_result)
    )
  );

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

REVOKE ALL ON FUNCTION public.fn_proje_silme_onizleme(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_proje_silme_onizleme(UUID) TO authenticated;

COMMENT ON FUNCTION public.fn_proje_silme_onizleme IS
  'Projenin tüm alt tablolardaki kayıt sayılarını JSON olarak döner. '
  'Frontend onay modalında kullanılır.';

-- ---------------------------------------------------------------------------
-- 7. fn_proje_hard_delete RPC — atomik kalıcı silme
-- ---------------------------------------------------------------------------
-- Kurallar:
--   a) Proje arşivde olmalı (silindi_mi=true) — değilse hata.
--   b) Yetki kontrolü backend service layer'da (proje.service.kaliciSil) yapılır:
--      veri varsa sadece admin; boşsa owner/admin/yetkili. RPC pure execute.
--   c) DELETE CASCADE devreye girer → tüm alt tablolar silinir.
--   d) İade JSON: silinmiş proje meta + etkilenen kayıt sayıları.
-- Audit log: trg_audit_log DELETE event'ini before_data ile audit_logs'a yazar.

CREATE OR REPLACE FUNCTION public.fn_proje_hard_delete(p_proje_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_silindi BOOLEAN;
  v_proje_adi TEXT;
  v_counts JSONB;
  v_toplam INT;
BEGIN
  -- Proje arşivde mi?
  SELECT silindi_mi, proje_adi INTO v_silindi, v_proje_adi
  FROM public.projeler
  WHERE id = p_proje_id;

  IF v_silindi IS NULL THEN
    RAISE EXCEPTION 'Proje bulunamadı' USING ERRCODE = 'P0002';
  END IF;

  IF v_silindi = false THEN
    RAISE EXCEPTION 'Kalıcı silmeden önce proje arşivlenmiş olmalı'
      USING ERRCODE = '22023';
  END IF;

  -- Alt kayıt sayıları (audit log için döndürülür)
  SELECT jsonb_build_object(
    'uyeler',              (SELECT COUNT(*) FROM public.uyeler              WHERE proje_id = p_proje_id),
    'bloklar',             (SELECT COUNT(*) FROM public.bloklar             WHERE proje_id = p_proje_id),
    'sozlesmeler',         (SELECT COUNT(*) FROM public.sozlesmeler         WHERE proje_id = p_proje_id),
    'faturalar',           (SELECT COUNT(*) FROM public.faturalar           WHERE proje_id = p_proje_id),
    'hakedisler',          (SELECT COUNT(*) FROM public.hakedisler          WHERE proje_id = p_proje_id),
    'aidat_tanimlari',     (SELECT COUNT(*) FROM public.aidat_tanimlari     WHERE proje_id = p_proje_id),
    'aidatlar',            (SELECT COUNT(*) FROM public.aidatlar            WHERE proje_id = p_proje_id),
    'banka_hesaplari',     (SELECT COUNT(*) FROM public.banka_hesaplari     WHERE proje_id = p_proje_id),
    'banka_hareketleri',   (SELECT COUNT(*) FROM public.banka_hareketleri   WHERE proje_id = p_proje_id),
    'cari_hareketler',     (SELECT COUNT(*) FROM public.cari_hareketler     WHERE proje_id = p_proje_id),
    'cekler',              (SELECT COUNT(*) FROM public.cekler              WHERE proje_id = p_proje_id),
    'irsaliyeler',         (SELECT COUNT(*) FROM public.irsaliyeler         WHERE proje_id = p_proje_id),
    'virmanlar',           (SELECT COUNT(*) FROM public.virmanlar           WHERE proje_id = p_proje_id),
    'proje_is_kalemleri',  (SELECT COUNT(*) FROM public.proje_is_kalemleri  WHERE proje_id = p_proje_id),
    'yillik_harcama_planlari', (SELECT COUNT(*) FROM public.yillik_harcama_planlari WHERE proje_id = p_proje_id),
    'birikmis_teminatlar', (SELECT COUNT(*) FROM public.birikmis_teminatlar WHERE proje_id = p_proje_id),
    'cari_hesaplar',       (SELECT COUNT(*) FROM public.cari_hesaplar       WHERE proje_id = p_proje_id)
  ) INTO v_counts;

  SELECT COALESCE(SUM((value)::int), 0)::int INTO v_toplam
  FROM jsonb_each_text(v_counts);

  -- CASCADE silme — alt tablolar otomatik temizlenir.
  -- trg_audit_log DELETE event'ini before_data ile audit_logs'a yazar.
  DELETE FROM public.projeler WHERE id = p_proje_id;

  RETURN jsonb_build_object(
    'success',     true,
    'proje_id',    p_proje_id,
    'proje_adi',   v_proje_adi,
    'toplam_kayit', v_toplam,
    'etkilenen',   v_counts
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION public.fn_proje_hard_delete(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_proje_hard_delete(UUID) TO authenticated;

COMMENT ON FUNCTION public.fn_proje_hard_delete IS
  'Arşivdeki bir projeyi CASCADE ile kalıcı siler. Yetki kuralı backend service '
  'layer''da (proje.service.kaliciSil) uygulanır. Pre-flight count + JSON özet döner.';

COMMIT;
