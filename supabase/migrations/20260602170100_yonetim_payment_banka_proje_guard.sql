-- Migration: 20260602170100_yonetim_payment_banka_proje_guard.sql
-- Sprint: kalite-guvenlik-2026-06 (SEC-3)
-- Description: fn_create_yonetim_payment_atomic banka ödemesinde banka_hesap'ın
--   projeye ait olduğunu garanti etmiyordu. GİDEN ödemede dolaylı koruma vardı
--   (bakiye fn_banka_hesaplari_with_bakiye(v_proje_id) ile proje-kapsamlı → yabancı
--   hesap NULL bakiye → hata), ama GELEN (giden olmayan) banka ödemesinde hiçbir
--   proje doğrulaması yoktu: banka_hareketleri'ne yabancı projenin banka_hesap_id'si
--   ile satır yazılabiliyordu (cross-project isolation ihlali).
--
-- Fix: odeme_turu='banka' olan her durumda, branch'lerden ÖNCE tek noktada
--   banka_hesap'ın proje_id'si işlemin projesiyle eşleşmeli; aksi halde hata.
--   İmza değişmez (JSONB) → CREATE OR REPLACE. search_path açıkça pinlenir.

CREATE OR REPLACE FUNCTION public.fn_create_yonetim_payment_atomic(
  p_payment_data JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
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
  v_aciklama_full  TEXT;
BEGIN
  v_proje_id       := (p_payment_data->>'proje_id')::UUID;
  v_yonetim_id     := (p_payment_data->>'yonetim_id')::UUID;
  v_islem_turu     := p_payment_data->>'islem_turu';
  v_odeme_turu     := p_payment_data->>'odeme_turu';
  v_banka_hesap_id := NULLIF(p_payment_data->>'banka_hesap_id', '')::UUID;
  v_tutar          := (p_payment_data->>'tutar')::NUMERIC(14, 2);
  v_tarih          := (p_payment_data->>'tarih')::DATE;
  v_aciklama       := p_payment_data->>'aciklama';

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

  -- SEC-3: banka ödemesinde proje izolasyonu (gelen+giden ortak guard).
  -- banka_hesap_id zorunlu + bu hesap işlemin projesine ait olmalı.
  IF v_odeme_turu = 'banka' THEN
    IF v_banka_hesap_id IS NULL THEN
      RAISE EXCEPTION 'Banka ödemesi için banka_hesap_id zorunlu'
        USING ERRCODE = '23502', COLUMN = 'banka_hesap_id';
    END IF;
    PERFORM 1 FROM public.banka_hesaplari
      WHERE id = v_banka_hesap_id AND proje_id = v_proje_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Banka hesabı bu projeye ait değil veya bulunamadı'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  SELECT ad_soyad INTO v_ad_soyad
    FROM public.yonetim_ekibi
   WHERE id = v_yonetim_id AND proje_id = v_proje_id
   FOR UPDATE;
  IF v_ad_soyad IS NULL THEN
    RAISE EXCEPTION 'Yönetim carisi bulunamadı' USING ERRCODE = 'P0001';
  END IF;

  v_is_giden := (v_islem_turu = 'giden_odeme');
  v_aciklama_full := COALESCE('Yönetim ödemesi (' || v_ad_soyad || '): ' || COALESCE(v_aciklama, ''),
                              'Yönetim ödemesi (' || v_ad_soyad || ')');

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
    ELSE -- banka (proje izolasyonu yukarıda doğrulandı)
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
  END IF;

  -- 1. Yönetim carisinin alacak sütununu güncelle
  UPDATE public.yonetim_ekibi
     SET alacak = alacak + CASE WHEN v_is_giden THEN v_tutar ELSE -v_tutar END,
         updated_at = now()
   WHERE id = v_yonetim_id
   RETURNING borc, alacak INTO v_new_borc, v_new_alacak;

  -- 2. Kasa/banka kaydı (gelir/gider muhasebesine yazılmaz — cari_hesap_id=NULL)
  IF v_odeme_turu = 'nakit' THEN
    INSERT INTO public.cari_hareketler (
      proje_id, cari_hesap_id, islem_turu, odeme_turu, odeme_yontemi,
      tarih, borc, alacak, aciklama, kaynak_tipi, kaynak_id
    ) VALUES (
      v_proje_id, NULL,
      CASE WHEN v_is_giden THEN 'yonetim_odeme_nakit_cikis' ELSE 'yonetim_odeme_nakit_giris' END,
      'nakit', 'nakit', v_tarih,
      CASE WHEN v_is_giden THEN 0 ELSE v_tutar END,
      CASE WHEN v_is_giden THEN v_tutar ELSE 0 END,
      v_aciklama_full, 'yonetim_odeme', v_yonetim_id
    )
    RETURNING id INTO v_hareket_id;
  ELSE -- banka: cari görünürlük satırı (odeme_turu='banka' → kasa_nakit etkilenmez) + banka hareketi (bağlı)
    INSERT INTO public.cari_hareketler (
      proje_id, cari_hesap_id, islem_turu, odeme_turu, odeme_yontemi,
      tarih, borc, alacak, aciklama, kaynak_tipi, kaynak_id
    ) VALUES (
      v_proje_id, NULL,
      CASE WHEN v_is_giden THEN 'yonetim_odeme_banka_cikis' ELSE 'yonetim_odeme_banka_giris' END,
      'banka', 'banka', v_tarih,
      CASE WHEN v_is_giden THEN 0 ELSE v_tutar END,
      CASE WHEN v_is_giden THEN v_tutar ELSE 0 END,
      v_aciklama_full, 'yonetim_odeme', v_yonetim_id
    )
    RETURNING id INTO v_hareket_id;

    INSERT INTO public.banka_hareketleri (
      proje_id, banka_hesap_id, tarih, tutar, islem_tipi, aciklama,
      eslesen_cari_hareket_id, eslesti
    ) VALUES (
      v_proje_id, v_banka_hesap_id, v_tarih, v_tutar,
      (CASE WHEN v_is_giden THEN 'gider' ELSE 'gelir' END)::public.islem_tipi,
      v_aciklama_full, v_hareket_id, TRUE
    )
    RETURNING id INTO v_banka_hareket_id;

    -- cari ↔ banka çift yönlü bağ (banka listesi cari_hareketler!banka_hareket_id ile join eder)
    UPDATE public.cari_hareketler SET banka_hareket_id = v_banka_hareket_id WHERE id = v_hareket_id;
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
$$;

COMMENT ON FUNCTION public.fn_create_yonetim_payment_atomic(JSONB) IS
  '20260602170100 (SEC-3): banka ödemesinde banka_hesap proje izolasyonu guard''ı '
  'eklendi (gelen+giden ortak). Aksi halde 20260531140001 ile aynı: nakit+banka '
  'cari görünürlük satırı, banka_hareketleri bağı, kasa_nakit yalnız nakit.';
