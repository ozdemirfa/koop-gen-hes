-- Migration: 20260531160000_transfer_daire_dues_on_reassignment.sql
-- Description: Daire bir üyeye atandığında, dairenin ÖDENMEMİŞ aidat borçları
--   (ve bunların cari tahakkuk hareketleri) yeni üyeye taşınır. Önceden trigger
--   yalnızca `uye_id IS NULL` aidatları backfill ediyordu; daire eski bir üyeden
--   (artık pasif) yeni üyeye devredildiğinde borçlar eski üyede kalıyor, yeni
--   üyenin detay sayfasında görünmüyordu (aidat_detaylari.uye_id =
--   COALESCE(a.uye_id, s.uye_id) eski üyeyi önceliyordu).
--
-- Karar (2026-05-31): "Yeni üyeye taşınsın" — daire atanınca dairenin ÖDENMEMİŞ
--   aidatları + cari tahakkukları yeni üyenin hesabına geçer; ÖDENMİŞ (tahsilatı
--   olan) aidatlar geçmiş kaydı olarak eski üyede kalır.
--
-- İçerik:
--   1) fn_transfer_daire_dues(p_serefiye_id, p_new_uye_id, p_actor_id) — yeniden
--      kullanılabilir devir fonksiyonu (trigger + tek seferlik data-fix ortak).
--   2) fn_sync_aidatlar_on_unit_assignment trigger fonksiyonu yeni mantığa geçer.
--   3) Tek seferlik data-fix: mevcut yanlış-atfedilmiş ödenmemiş aidatları güncel
--      daire sahibine taşır.

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- 1. Devir fonksiyonu
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_transfer_daire_dues(
  p_serefiye_id UUID,
  p_new_uye_id  UUID,
  p_actor_id    UUID DEFAULT NULL
) RETURNS INTEGER AS $$
DECLARE
  v_proje_id UUID;
  v_new_cari UUID;
  v_aidat    RECORD;
  v_count    INTEGER := 0;
  v_tutar    NUMERIC(12,2);
BEGIN
  IF p_new_uye_id IS NULL THEN
    RETURN 0;
  END IF;

  IF p_actor_id IS NOT NULL THEN
    PERFORM set_config('app.actor_id', p_actor_id::TEXT, true);
  END IF;

  SELECT proje_id INTO v_proje_id FROM public.serefiye_tablosu WHERE id = p_serefiye_id;
  IF v_proje_id IS NULL THEN
    RETURN 0;
  END IF;

  -- Yeni üyenin cari hesabı (tahakkuk taşınacak hedef). Yoksa yalnız uye_id set
  -- edilir, cari taşıma atlanır (veri tutarsızlığı yerine eksik-cari tercih edilir).
  SELECT id INTO v_new_cari FROM public.cari_hesaplar
   WHERE proje_id = v_proje_id AND uye_id = p_new_uye_id;

  FOR v_aidat IN
    SELECT a.id, a.uye_id, at.yil, at.ay, at.katsayi_tutari, s.serefiye_orani
    FROM public.aidatlar a
    JOIN public.aidat_tanimlari at ON a.aidat_tanimi_id = at.id
    JOIN public.serefiye_tablosu s ON a.serefiye_id = s.id
    WHERE a.serefiye_id = p_serefiye_id
      -- zaten yeni üyede olanları atla
      AND a.uye_id IS DISTINCT FROM p_new_uye_id
      -- yalnızca ÖDENMEMİŞ aidatlar: bu aidata bağlı tahsilat (borc) hareketi yok
      AND NOT EXISTS (
        SELECT 1 FROM public.cari_hareketler ch
        WHERE ch.kaynak_tipi = 'aidat'
          AND ch.kaynak_id = a.id
          AND ch.borc > 0
      )
  LOOP
    IF v_new_cari IS NOT NULL THEN
      -- Mevcut tahakkuk + faiz tahakkuk hareketlerini yeni üyenin cari hesabına taşı.
      UPDATE public.cari_hareketler
        SET cari_hesap_id = v_new_cari, proje_id = v_proje_id
        WHERE kaynak_id = v_aidat.id
          AND kaynak_tipi IN ('aidat', 'gecikme_faizi');

      -- Aidat tahakkuku hiç yoksa (daire boşken borçlandırılmış) yeni üyeye oluştur.
      IF NOT EXISTS (
        SELECT 1 FROM public.cari_hareketler
        WHERE kaynak_tipi = 'aidat' AND kaynak_id = v_aidat.id
      ) THEN
        v_tutar := public.fn_aidat_yuvarla(
          v_aidat.katsayi_tutari * COALESCE(v_aidat.serefiye_orani, 1.00)
        );
        INSERT INTO public.cari_hareketler (
          proje_id, cari_hesap_id, islem_turu, tarih, alacak, borc, kaynak_tipi, kaynak_id, aciklama
        ) VALUES (
          v_proje_id, v_new_cari, 'aidat_kayit', CURRENT_DATE, v_tutar, 0, 'aidat', v_aidat.id,
          v_aidat.ay || '/' || v_aidat.yil || ' Aidat Tahakkuku'
        );
      END IF;
    END IF;

    UPDATE public.aidatlar
      SET uye_id = p_new_uye_id, updated_at = NOW()
      WHERE id = v_aidat.id;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.fn_transfer_daire_dues(UUID, UUID, UUID) IS
  'Daire yeni üyeye atandığında ödenmemiş aidatları + cari tahakkukları yeni '
  'üyeye taşır. Ödenmiş aidatlar eski üyede kalır. Taşınan aidat sayısını döner.';

-- ────────────────────────────────────────────────────────────────────────────
-- 2. Trigger fonksiyonu — yeni devir mantığı
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_sync_aidatlar_on_unit_assignment()
RETURNS TRIGGER AS $$
BEGIN
  -- Daireye yeni bir üye atandıysa (NULL→üye veya üye değişimi): dairenin
  -- ödenmemiş aidat borçlarını + cari tahakkuklarını yeni üyeye taşı.
  IF (NEW.uye_id IS NOT NULL AND (OLD.uye_id IS NULL OR OLD.uye_id <> NEW.uye_id)) THEN
    PERFORM public.fn_transfer_daire_dues(
      NEW.id,
      NEW.uye_id,
      NULLIF(current_setting('app.actor_id', true), '')::UUID
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION public.fn_sync_aidatlar_on_unit_assignment() IS
  'Daireye üye atandığında dairenin ödenmemiş aidatlarını (ve cari tahakkukları) '
  'yeni üyeye taşır (fn_transfer_daire_dues). Trigger serefiye_tablosu.uye_id UPDATE.';

-- Trigger zaten 20260423000001 ile kurulu; fonksiyon CREATE OR REPLACE ile güncellendi.

-- ────────────────────────────────────────────────────────────────────────────
-- 3. Tek seferlik data-fix: mevcut yanlış-atfedilmiş ödenmemiş aidatları taşı
-- ────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  r RECORD;
  v_total INTEGER := 0;
  v_moved INTEGER;
BEGIN
  FOR r IN
    SELECT id, uye_id FROM public.serefiye_tablosu WHERE uye_id IS NOT NULL
  LOOP
    v_moved := public.fn_transfer_daire_dues(r.id, r.uye_id, NULL);
    v_total := v_total + v_moved;
  END LOOP;
  RAISE NOTICE 'Daire devri data-fix: % aidat güncel sahibine taşındı.', v_total;
END $$;

COMMIT;
