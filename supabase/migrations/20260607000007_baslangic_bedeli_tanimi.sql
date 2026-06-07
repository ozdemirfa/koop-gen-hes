-- Migration: 20260607000007_baslangic_bedeli_tanimi.sql
-- Sprint: kurumsal-cari-revizyonlar 2. tur (2026-06-07) — Rev A
-- Description: Başlangıç bedeli TOPLU tahakkuk (aidat tanımı tur='baslangic_bedeli').
--   Aidat Tanımları "Yeni Tanım Ekle" modalında Tür='Başlangıç bedeli' seçilip
--   katsayı tutarı girilince, borçlandırınca tüm dairelere (aktif üyesi olanlara)
--   şerefiye oranında başlangıç bedeli tahakkuku oluşur (aidat tahakkuk gibi).
--   Sonra üye sayfasından tek tek revize edilebilir.
--
--   Tahakkuk satırı: cari_hareketler islem_turu='uyelik_baslangic', alacak=tutar,
--     kaynak_tipi=NULL (FIFO hedefi olabilsin — Hesap Kapatma başlangıç bedelini de
--     kapatır), belge_no='BB-TANIM:<tanim_id>' (toplu kaynak işareti; uncharge + manuel
--     tahakkukten ayırt etmek için). Tutar fn_aidat_yuvarla ile 100'e yukarı yuvarlı.
--
-- Servis (aidat.service) chargeTanim/unchargeTanim tur'e göre dispatch eder.

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- 1. Toplu başlangıç bedeli tahakkuku
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_charge_baslangic_tanimi(
  p_tanim_id UUID,
  p_actor_id UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_record  RECORD;
  v_daire   RECORD;
  v_uye_id  UUID;
  v_cari_id UUID;
  v_tutar   NUMERIC(12,2);
  v_tarih   DATE;
  v_marker  TEXT;
  v_count   INTEGER := 0;
BEGIN
  PERFORM set_config('app.actor_id', COALESCE(p_actor_id::TEXT, ''), true);

  SELECT * INTO v_record FROM public.aidat_tanimlari WHERE id = p_tanim_id;
  IF v_record IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Aidat tanımı bulunamadı.');
  END IF;
  IF v_record.durum = 'borclandi' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Bu tanım zaten borçlandırılmış.');
  END IF;

  v_tarih  := make_date(v_record.yil, v_record.ay, COALESCE(v_record.son_odeme_gunu, 15));
  v_marker := 'BB-TANIM:' || p_tanim_id::text;

  FOR v_daire IN
    SELECT id, serefiye_orani, proje_id FROM public.serefiye_tablosu
    WHERE proje_id = v_record.proje_id
  LOOP
    SELECT id INTO v_uye_id FROM public.uyeler
    WHERE serefiye_id = v_daire.id AND durum = 'aktif' LIMIT 1;

    IF v_uye_id IS NOT NULL THEN
      v_tutar := public.fn_aidat_yuvarla(v_record.katsayi_tutari * COALESCE(v_daire.serefiye_orani, 1.00));

      SELECT id INTO v_cari_id FROM public.cari_hesaplar
      WHERE proje_id = v_record.proje_id AND uye_id = v_uye_id;

      IF v_cari_id IS NOT NULL AND v_tutar > 0 THEN
        INSERT INTO public.cari_hareketler (
          proje_id, cari_hesap_id, islem_turu, tarih, alacak, borc, kaynak_tipi, belge_no, aciklama
        ) VALUES (
          v_record.proje_id, v_cari_id, 'uyelik_baslangic', v_tarih, v_tutar, 0, NULL, v_marker,
          'Başlangıç Bedeli Tahakkuku'
        );
        v_count := v_count + 1;
      END IF;
    END IF;
  END LOOP;

  UPDATE public.aidat_tanimlari SET durum = 'borclandi', updated_at = now() WHERE id = p_tanim_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Başlangıç bedeli tahakkuku tamamlandı',
    'total_created', v_count
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

COMMENT ON FUNCTION public.fn_charge_baslangic_tanimi(UUID, UUID) IS
  'Toplu başlangıç bedeli tahakkuku: her aktif daire için katsayı×şerefiye (100''e yuvarlı) '
  'uyelik_baslangic alacak satırı (belge_no=BB-TANIM:<id>, kaynak_tipi NULL → FIFO hedefi).';

-- ────────────────────────────────────────────────────────────────────────────
-- 2. Toplu başlangıç bedeli borçlandırma geri al
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_uncharge_baslangic_tanimi(
  p_tanim_id UUID,
  p_actor_id UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_record  RECORD;
  v_marker  TEXT;
  v_paid    INTEGER;
  v_deleted INTEGER;
BEGIN
  PERFORM set_config('app.actor_id', COALESCE(p_actor_id::TEXT, ''), true);

  SELECT * INTO v_record FROM public.aidat_tanimlari WHERE id = p_tanim_id;
  IF v_record IS NULL THEN
    RAISE EXCEPTION 'Aidat tanımı bulunamadı' USING ERRCODE = 'P0002';
  END IF;

  v_marker := 'BB-TANIM:' || p_tanim_id::text;

  -- FIFO ile tahsilatı eşleşmiş başlangıç tahakkuku varsa geri alma reddedilir.
  SELECT COUNT(*) INTO v_paid
  FROM public.cari_hareketler t
  WHERE t.belge_no = v_marker
    AND t.islem_turu = 'uyelik_baslangic'
    AND t.alacak > 0
    AND EXISTS (
      SELECT 1 FROM public.cari_hareketler p
      WHERE p.kaynak_tipi = 'baslangic_bedeli' AND p.kaynak_id = t.id
    );

  IF v_paid > 0 THEN
    RAISE EXCEPTION 'Tahsilatı yapılmış başlangıç bedeli mevcut; önce ödeme eşleşmelerini geri alın'
      USING ERRCODE = 'P0001';
  END IF;

  DELETE FROM public.cari_hareketler
  WHERE belge_no = v_marker AND islem_turu = 'uyelik_baslangic' AND alacak > 0;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  UPDATE public.aidat_tanimlari SET durum = 'plan', updated_at = now() WHERE id = p_tanim_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Başlangıç bedeli borçlandırması geri alındı',
    'deleted', v_deleted
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

COMMENT ON FUNCTION public.fn_uncharge_baslangic_tanimi(UUID, UUID) IS
  'Toplu başlangıç bedeli borçlandırmasını geri alır (belge_no=BB-TANIM:<id> satırları). '
  'Tahsilatı yapılmış (FIFO eşleşmiş) tahakkuk varsa P0001 ile reddeder.';

COMMIT;
