-- Migration: 20260531000003_fix_yonetim_payment_islem_tipi_cast.sql
-- Sprint: hotfix (2026-05-31)
-- Description: fn_create_yonetim_payment_atomic banka ödemesinde 42804
--   ("Veritabanı tip uyumsuzluğu") veriyordu. banka_hareketleri.islem_tipi bir
--   ENUM (public.islem_tipi: 'gelir'|'gider'). RPC `CASE WHEN ... THEN 'gider'
--   ELSE 'gelir' END` yazıyordu — CASE sonucu TEXT, enum kolona atanınca 42804
--   (literal coerce olur ama CASE sonucu text → explicit cast gerekir).
--   Düzeltme: CASE çıktısını ::public.islem_tipi'ye cast et. Fonksiyonun geri
--   kalanı 20260530000007 ile aynı.

CREATE OR REPLACE FUNCTION public.fn_create_yonetim_payment_atomic(
  p_payment_data JSONB
)
RETURNS JSONB AS $$
DECLARE
  v_proje_id       UUID;
  v_yonetim_id     UUID;
  v_islem_turu     TEXT;
  v_odeme_turu     TEXT;
  v_banka_hesap_id UUID;
  v_tutar          NUMERIC(14, 2);
  v_tarih          DATE;
  v_aciklama       TEXT;
  v_is_giden       BOOLEAN;
  v_ad_soyad       TEXT;
  v_kasa_bakiye    NUMERIC(14, 2);
  v_banka_bakiye   NUMERIC(14, 2);
  v_hareket_id     UUID;
  v_banka_hareket_id UUID;
  v_new_borc       NUMERIC(14, 2);
  v_new_alacak     NUMERIC(14, 2);
BEGIN
  v_proje_id       := (p_payment_data->>'proje_id')::UUID;
  v_yonetim_id     := (p_payment_data->>'yonetim_id')::UUID;
  v_islem_turu     := p_payment_data->>'islem_turu';
  v_odeme_turu     := p_payment_data->>'odeme_turu';
  v_banka_hesap_id := NULLIF(p_payment_data->>'banka_hesap_id', '')::UUID;
  v_tutar          := (p_payment_data->>'tutar')::NUMERIC(14, 2);
  v_tarih          := (p_payment_data->>'tarih')::DATE;
  v_aciklama       := p_payment_data->>'aciklama';

  -- Doğrulamalar
  IF v_proje_id IS NULL THEN
    RAISE EXCEPTION 'proje_id zorunlu' USING ERRCODE = '23502', COLUMN = 'proje_id';
  END IF;
  IF v_yonetim_id IS NULL THEN
    RAISE EXCEPTION 'yonetim_id zorunlu' USING ERRCODE = '23502', COLUMN = 'yonetim_id';
  END IF;
  IF v_islem_turu NOT IN ('gelen_odeme', 'giden_odeme') THEN
    RAISE EXCEPTION 'islem_turu yalnız gelen_odeme veya giden_odeme olabilir'
      USING ERRCODE = '22023', COLUMN = 'islem_turu';
  END IF;
  IF v_odeme_turu NOT IN ('nakit', 'banka') THEN
    RAISE EXCEPTION 'odeme_turu yalnız nakit veya banka olabilir'
      USING ERRCODE = '22023', COLUMN = 'odeme_turu';
  END IF;
  IF v_tutar IS NULL OR v_tutar <= 0 THEN
    RAISE EXCEPTION 'tutar pozitif olmalı' USING ERRCODE = '22023', COLUMN = 'tutar';
  END IF;
  IF v_tarih IS NULL THEN
    RAISE EXCEPTION 'tarih zorunlu' USING ERRCODE = '23502', COLUMN = 'tarih';
  END IF;

  -- Yönetim carisi bu projeye ait mi? (satır kilidi — eş zamanlı bakiye yarışını engelle)
  SELECT ad_soyad INTO v_ad_soyad
    FROM public.yonetim_ekibi
   WHERE id = v_yonetim_id AND proje_id = v_proje_id
   FOR UPDATE;
  IF v_ad_soyad IS NULL THEN
    RAISE EXCEPTION 'Yönetim carisi bulunamadı' USING ERRCODE = 'P0001';
  END IF;

  v_is_giden := (v_islem_turu = 'giden_odeme');

  -- Bakiye kontrolü yalnız para çıkışı (giden_odeme) için
  IF v_is_giden THEN
    IF v_odeme_turu = 'nakit' THEN
      PERFORM pg_advisory_xact_lock(hashtext('nakit_kasa:' || v_proje_id::text));
      SELECT COALESCE(SUM(borc) - SUM(alacak), 0) INTO v_kasa_bakiye
        FROM public.cari_hareketler
       WHERE proje_id = v_proje_id AND odeme_turu = 'nakit';
      IF v_kasa_bakiye < v_tutar THEN
        RAISE EXCEPTION 'Nakit kasa bakiyesi yetersiz (mevcut: % TL, talep: % TL)',
          v_kasa_bakiye, v_tutar USING ERRCODE = 'P0001';
      END IF;
    ELSE -- banka
      IF v_banka_hesap_id IS NULL THEN
        RAISE EXCEPTION 'Banka ödemesi için banka_hesap_id zorunlu'
          USING ERRCODE = '23502', COLUMN = 'banka_hesap_id';
      END IF;
      PERFORM 1 FROM public.banka_hesaplari WHERE id = v_banka_hesap_id FOR UPDATE;
      SELECT bakiye INTO v_banka_bakiye
        FROM public.fn_banka_hesaplari_with_bakiye(v_proje_id)
       WHERE id = v_banka_hesap_id;
      IF v_banka_bakiye IS NULL THEN
        RAISE EXCEPTION 'Banka hesabı bulunamadı' USING ERRCODE = 'P0001';
      END IF;
      IF v_banka_bakiye < v_tutar THEN
        RAISE EXCEPTION 'Banka bakiyesi yetersiz (mevcut: % TL, talep: % TL)',
          v_banka_bakiye, v_tutar USING ERRCODE = 'P0001';
      END IF;
    END IF;
  ELSE
    -- gelen_odeme banka için de hesap zorunlu
    IF v_odeme_turu = 'banka' AND v_banka_hesap_id IS NULL THEN
      RAISE EXCEPTION 'Banka ödemesi için banka_hesap_id zorunlu'
        USING ERRCODE = '23502', COLUMN = 'banka_hesap_id';
    END IF;
  END IF;

  -- 1. Yönetim carisinin alacak sütununu güncelle (her işlem alacak'a işlenir)
  UPDATE public.yonetim_ekibi
     SET alacak = alacak + CASE WHEN v_is_giden THEN v_tutar ELSE -v_tutar END,
         updated_at = now()
   WHERE id = v_yonetim_id
   RETURNING borc, alacak INTO v_new_borc, v_new_alacak;

  -- 2. Kasa/banka kaydı (gelir/gider'e yazılmaz)
  IF v_odeme_turu = 'nakit' THEN
    -- cari_hesap_id=NULL → kasa_nakit etkilenir, gelir/gider metrikleri dışlar
    INSERT INTO public.cari_hareketler (
      proje_id, cari_hesap_id, islem_turu, odeme_turu, odeme_yontemi,
      tarih, borc, alacak, aciklama, kaynak_tipi, kaynak_id
    ) VALUES (
      v_proje_id, NULL,
      CASE WHEN v_is_giden THEN 'yonetim_odeme_nakit_cikis' ELSE 'yonetim_odeme_nakit_giris' END,
      'nakit', 'nakit', v_tarih,
      CASE WHEN v_is_giden THEN 0 ELSE v_tutar END,   -- borc (kasaya giriş)
      CASE WHEN v_is_giden THEN v_tutar ELSE 0 END,   -- alacak (kasadan çıkış)
      COALESCE('Yönetim ödemesi (' || v_ad_soyad || '): ' || COALESCE(v_aciklama, ''),
               'Yönetim ödemesi (' || v_ad_soyad || ')'),
      'yonetim_odeme', v_yonetim_id
    )
    RETURNING id INTO v_hareket_id;
  ELSE -- banka
    INSERT INTO public.banka_hareketleri (
      proje_id, banka_hesap_id, tarih, tutar, islem_tipi, aciklama
    ) VALUES (
      v_proje_id, v_banka_hesap_id, v_tarih, v_tutar,
      -- 42804 fix: islem_tipi ENUM → CASE (text) çıktısı explicit cast edilmeli
      (CASE WHEN v_is_giden THEN 'gider' ELSE 'gelir' END)::public.islem_tipi,
      COALESCE('Yönetim ödemesi (' || v_ad_soyad || '): ' || COALESCE(v_aciklama, ''),
               'Yönetim ödemesi (' || v_ad_soyad || ')')
    )
    RETURNING id INTO v_banka_hareket_id;
  END IF;

  RETURN jsonb_build_object(
    'yonetim_id', v_yonetim_id,
    'borc', v_new_borc,
    'alacak', v_new_alacak,
    'bakiye', v_new_borc - v_new_alacak,
    'cari_hareket_id', v_hareket_id,
    'banka_hareket_id', v_banka_hareket_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.fn_create_yonetim_payment_atomic IS
  '20260531: 42804 fix — banka_hareketleri.islem_tipi (enum) CASE çıktısı ::public.islem_tipi cast edildi. Gerisi 20260530000007 ile aynı.';
