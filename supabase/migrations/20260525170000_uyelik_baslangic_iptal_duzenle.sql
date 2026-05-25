-- Sprint uyelik-baslangic-iptal-duzenle (2026-05-25)
-- ============================================================================
-- Uyelik baslangic bedeli tahakkukunu duzenle veya iptal et — atomik RPC
-- ----------------------------------------------------------------------------
-- BAGLAM:
--   `cari_hareketler.islem_turu='uyelik_baslangic' AND alacak>0 AND
--   kaynak_tipi IS NULL` satirlari UI'da Aidat Hesaplari tab'inde virtual row
--   olarak gosteriliyor. Bu satirlarin tutar/tarih/aciklama duzeltmesi veya
--   tamamen iptali icin ozel guard'li bir RPC gerekti:
--
--   1. Mevcut `fn_delete_cari_hareket_with_banka` (20260525120000) sadece
--      `kaynak_tipi NOT NULL` icin engelleme yapar — tahakkuk satirinin kendisi
--      `kaynak_tipi IS NULL` olduyu icin yanlis pozitif yesil sinyal verir
--      (tahsilat varsa orphan kalir).
--   2. Mevcut `cariHesap.service.update` whitelist'i bu alanlara izin veriyor
--      ama UI yok ve `alacak` degisikligi FIFO sonrasi dagilim bozar — bu
--      kayit icin tahsilat-yoklugu garantisi sart.
--
-- TAHSILAT BAGI: Bir tahsilat bu tahakkuka baglandiginda
--   `cari_hareketler.kaynak_tipi='baslangic_bedeli' AND kaynak_id=<tahakkuk_id>`
-- set olur (FIFO match veya manuel). Engelleme bu varligi kontrol eder.
--
-- AUDIT: cari_hareketler tablosunda trg_audit_log aktif (20260510000007).
-- RPC icinde `set_config('app.actor_id', ...)` ile binding yeterli — trigger
-- UPDATE/DELETE before/after diff'i audit_logs'a otomatik yazar.
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. fn_update_uyelik_baslangic_tahakkuk
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_update_uyelik_baslangic_tahakkuk(
  p_id        UUID,
  p_tutar     NUMERIC,
  p_tarih     DATE,
  p_aciklama  TEXT,
  p_actor_id  UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing RECORD;
  v_has_tahsilat BOOLEAN;
  v_updated RECORD;
BEGIN
  -- Audit actor binding
  PERFORM set_config('app.actor_id', COALESCE(p_actor_id::TEXT, ''), true);

  -- Tutar validasyonu
  IF p_tutar IS NULL OR p_tutar <= 0 THEN
    RAISE EXCEPTION 'Tutar pozitif olmalidir'
      USING ERRCODE = 'P0001';
  END IF;
  IF p_tutar > 1000000000 THEN
    RAISE EXCEPTION 'Tutar 1.000.000.000 TL uzerinde olamaz'
      USING ERRCODE = 'P0001';
  END IF;

  -- Varlik + tip kontrolu
  SELECT id, islem_turu, alacak, kaynak_tipi
    INTO v_existing
    FROM public.cari_hareketler
   WHERE id = p_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Baslangic bedeli tahakkuku bulunamadi'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_existing.islem_turu <> 'uyelik_baslangic' OR COALESCE(v_existing.alacak, 0) <= 0 THEN
    RAISE EXCEPTION 'Bu kayit bir uyelik baslangic bedeli tahakkuku degil'
      USING ERRCODE = 'P0001';
  END IF;

  -- Tahsilat bagi kontrolu — varsa engelle
  SELECT EXISTS (
    SELECT 1
      FROM public.cari_hareketler
     WHERE kaynak_tipi = 'baslangic_bedeli'
       AND kaynak_id   = p_id
  ) INTO v_has_tahsilat;

  IF v_has_tahsilat THEN
    RAISE EXCEPTION
      'Bu tahakkuka bagli tahsilatlar var. Once bagli tahsilatlari iptal edin.'
      USING ERRCODE = 'P0001';
  END IF;

  -- Update — tarih ve aciklama NULL gelirse mevcut deger korunur
  UPDATE public.cari_hareketler
     SET alacak   = p_tutar,
         tarih    = COALESCE(p_tarih, tarih),
         aciklama = COALESCE(p_aciklama, aciklama)
   WHERE id = p_id
  RETURNING * INTO v_updated;

  RETURN to_jsonb(v_updated);
END;
$$;

COMMENT ON FUNCTION public.fn_update_uyelik_baslangic_tahakkuk(UUID, NUMERIC, DATE, TEXT, UUID) IS
  'Uyelik baslangic bedeli tahakkukunu duzenle (tutar/tarih/aciklama). '
  'Tahsilat bagliysa P0001 ile engeller; audit_logs trigger ile otomatik kaydedilir.';

REVOKE ALL ON FUNCTION public.fn_update_uyelik_baslangic_tahakkuk(UUID, NUMERIC, DATE, TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_update_uyelik_baslangic_tahakkuk(UUID, NUMERIC, DATE, TEXT, UUID) TO authenticated;

-- ============================================================================
-- 2. fn_delete_uyelik_baslangic_tahakkuk
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_delete_uyelik_baslangic_tahakkuk(
  p_id       UUID,
  p_actor_id UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing RECORD;
  v_has_tahsilat BOOLEAN;
BEGIN
  -- Audit actor binding
  PERFORM set_config('app.actor_id', COALESCE(p_actor_id::TEXT, ''), true);

  -- Varlik + tip kontrolu
  SELECT id, islem_turu, alacak
    INTO v_existing
    FROM public.cari_hareketler
   WHERE id = p_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Baslangic bedeli tahakkuku bulunamadi'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_existing.islem_turu <> 'uyelik_baslangic' OR COALESCE(v_existing.alacak, 0) <= 0 THEN
    RAISE EXCEPTION 'Bu kayit bir uyelik baslangic bedeli tahakkuku degil'
      USING ERRCODE = 'P0001';
  END IF;

  -- Tahsilat bagi kontrolu
  SELECT EXISTS (
    SELECT 1
      FROM public.cari_hareketler
     WHERE kaynak_tipi = 'baslangic_bedeli'
       AND kaynak_id   = p_id
  ) INTO v_has_tahsilat;

  IF v_has_tahsilat THEN
    RAISE EXCEPTION
      'Bu tahakkuka bagli tahsilatlar var. Once bagli tahsilatlari iptal edin.'
      USING ERRCODE = 'P0001';
  END IF;

  DELETE FROM public.cari_hareketler
   WHERE id = p_id;
END;
$$;

COMMENT ON FUNCTION public.fn_delete_uyelik_baslangic_tahakkuk(UUID, UUID) IS
  'Uyelik baslangic bedeli tahakkukunu iptal et (cari_hareketler kaydini sil). '
  'Tahsilat bagliysa P0001; audit_logs trigger ile DELETE log otomatik.';

REVOKE ALL ON FUNCTION public.fn_delete_uyelik_baslangic_tahakkuk(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_delete_uyelik_baslangic_tahakkuk(UUID, UUID) TO authenticated;

COMMIT;
