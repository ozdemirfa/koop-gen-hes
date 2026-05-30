-- Migration: 20260531140001_fn_yonetim_payment_unified.sql
-- Sprint: para-hareketleri-yonetim (2026-05-31)
-- Description: fn_create_yonetim_payment_atomic — BANKA ödemesi artık cari_hareketler'e
--   de bir "görünürlük satırı" yazar (cari_hesap_id=NULL, odeme_turu='banka',
--   islem_turu='yonetim_odeme_banka_*') ve banka_hareketleri'ne banka_hareket_id +
--   eslesen_cari_hareket_id/eslesti=TRUE ile BAĞLANIR. Böylece:
--     * para hareketleri (cari_hareketler) yönetim banka ödemelerini de gösterir,
--     * banka hareketlerinde "Eşleşti" olur, İlgili Cari "Yönetim" gösterilir.
--   odeme_turu='banka' olduğundan kasa_nakit etkilenmez; banka bakiyesi yalnız
--   banka_hareketleri'nden gelir (çift sayım yok). Nakit yolu 20260531130000 ile aynı.
-- Bağımlılık: 20260531140000 (islem_turu CHECK banka tipleri).

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
    IF v_odeme_turu = 'banka' AND v_banka_hesap_id IS NULL THEN
      RAISE EXCEPTION 'Banka ödemesi için banka_hesap_id zorunlu'
        USING ERRCODE = '23502', COLUMN = 'banka_hesap_id';
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.fn_create_yonetim_payment_atomic IS
  '20260531140001: birleşik — nakit+banka her durumda cari_hareketler''e görünürlük satırı '
  '(cari_hesap_id=NULL). Banka: odeme_turu=banka + banka_hareketleri''ne banka_hareket_id/eslesti=TRUE '
  'ile bağlanır → para hareketlerinde görünür + bankada Eşleşti. Kasa_nakit yalnız nakit satırları sayar.';
