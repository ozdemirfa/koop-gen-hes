-- Migration: 20260524000004_payment_rpc_balance_check.sql
-- Description: fn_create_payment_atomic'e bakiye kontrolü ekle (kullanıcı kuralı #4).
--   - Çıkış işlemleri: islem_turu IN ('giden_odeme', 'iade_odeme')
--   - Kontrol edilen modlar: odeme_turu IN ('nakit', 'banka')
--   - Bakiye yetersizse RAISE EXCEPTION (P0001) → errorHandler.ts user-facing 400.
--
-- LOCK STRATEJİSİ:
--   - banka modu → kaynak banka satırını FOR UPDATE ile kilitle (race-safe).
--   - nakit modu → pg_advisory_xact_lock(proje_id) ile seri-leştir (kasa aggregate).
--   Aynı kilit anahtarları virman RPC (20260524000003) ile birebir uyumlu — paralel
--   virman+ödeme aynı kaynak üzerinde toplam bakiyeyi aşamaz.
--
-- ETKİLENMEYEN AKIŞLAR:
--   - gelen_odeme (tahsilat) → kontrol yok (para giriyor, bakiye azalmıyor)
--   - uyelik_baslangic → kontrol yok (tahakkuk veya tahsilat — para girişi)
--   - cek/kredi_karti/cari modları → kontrol yok (gerçek bakiye etkilenmiyor)
--
-- BAĞIMLILIKLAR: 20260512000003 (önceki payment RPC).

BEGIN;

DROP FUNCTION IF EXISTS public.fn_create_payment_atomic(JSONB, UUID);

CREATE OR REPLACE FUNCTION public.fn_create_payment_atomic(
  p_payment_data JSONB,
  p_actor_id UUID DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_hareket_id UUID;
  v_banka_hareket_id UUID;
  v_borc NUMERIC := 0;
  v_alacak NUMERIC := 0;
  v_islem_turu TEXT := p_payment_data->>'islem_turu';
  v_odeme_turu TEXT := p_payment_data->>'odeme_turu';
  v_tutar NUMERIC := (p_payment_data->>'tutar')::NUMERIC;
  v_proje_id UUID := (p_payment_data->>'proje_id')::UUID;
  v_banka_hesap_id UUID := NULLIF(p_payment_data->>'banka_hesap_id', '')::UUID;
  v_bakiye NUMERIC;
  v_result RECORD;
BEGIN
  PERFORM set_config('app.actor_id', COALESCE(p_actor_id::TEXT, ''), true);

  -- ============================================================
  -- 0. BAKİYE KONTROLÜ (kullanıcı kuralı #4)
  -- Sadece çıkış işlemleri ve nakit/banka modlarında.
  -- ============================================================
  IF v_islem_turu IN ('giden_odeme', 'iade_odeme')
     AND v_odeme_turu IN ('nakit', 'banka') THEN
    IF v_odeme_turu = 'banka' THEN
      IF v_banka_hesap_id IS NULL THEN
        RAISE EXCEPTION 'banka_hesap_id zorunlu (banka modunda)'
          USING ERRCODE = '23502', COLUMN = 'banka_hesap_id';
      END IF;
      -- Kaynak banka satırını kilitle (eş zamanlı virman/ödeme ile race-safe).
      PERFORM 1 FROM public.banka_hesaplari WHERE id = v_banka_hesap_id FOR UPDATE;
      SELECT bakiye INTO v_bakiye
        FROM public.fn_banka_hesaplari_with_bakiye(v_proje_id)
        WHERE id = v_banka_hesap_id;
      IF v_bakiye IS NULL THEN
        RAISE EXCEPTION 'Banka hesabı bulunamadı'
          USING ERRCODE = 'P0001';
      END IF;
      IF v_bakiye < v_tutar THEN
        RAISE EXCEPTION 'Banka bakiyesi yetersiz (mevcut: % TL, talep: % TL)',
          v_bakiye, v_tutar
          USING ERRCODE = 'P0001';
      END IF;
    ELSE
      -- nakit modu: advisory lock + aggregate
      PERFORM pg_advisory_xact_lock(hashtext('nakit_kasa:' || v_proje_id::text));
      SELECT COALESCE(SUM(borc) - SUM(alacak), 0) INTO v_bakiye
        FROM public.cari_hareketler
        WHERE proje_id = v_proje_id AND odeme_turu = 'nakit';
      IF v_bakiye < v_tutar THEN
        RAISE EXCEPTION 'Nakit kasa bakiyesi yetersiz (mevcut: % TL, talep: % TL)',
          v_bakiye, v_tutar
          USING ERRCODE = 'P0001';
      END IF;
    END IF;
  END IF;

  -- ============================================================
  -- 1. Borç/Alacak ayrımı (REV-PAY-02, 20260512000003)
  -- ============================================================
  IF v_islem_turu = 'gelen_odeme' THEN
    v_borc := v_tutar;
  ELSIF v_islem_turu = 'uyelik_baslangic' AND v_odeme_turu = 'cari' THEN
    v_alacak := v_tutar;
  ELSIF v_islem_turu = 'uyelik_baslangic' THEN
    v_borc := v_tutar;
  ELSE
    v_alacak := v_tutar;
  END IF;

  INSERT INTO public.cari_hareketler (
    proje_id, cari_hesap_id, islem_turu, odeme_turu, odeme_yontemi,
    tarih, borc, alacak, aciklama, belge_no, kaynak_tipi, kaynak_id
  )
  VALUES (
    v_proje_id,
    (p_payment_data->>'cari_hesap_id')::UUID,
    v_islem_turu,
    v_odeme_turu,
    v_odeme_turu::public.odeme_yontemi,
    (p_payment_data->>'tarih')::DATE,
    v_borc,
    v_alacak,
    p_payment_data->>'aciklama',
    p_payment_data->>'belge_no',
    p_payment_data->>'kaynak_tipi',
    NULLIF(p_payment_data->>'kaynak_id', '')::UUID
  )
  RETURNING id INTO v_hareket_id;

  -- Banka hareketi yalnizca gercek banka odemesi icin (cari/nakit/cek/kredi_karti DEGIL).
  IF v_odeme_turu = 'banka' AND v_banka_hesap_id IS NOT NULL THEN
    INSERT INTO public.banka_hareketleri (
      banka_hesap_id, proje_id, tarih, tutar, islem_tipi,
      aciklama, eslesen_cari_hareket_id, eslesti
    )
    VALUES (
      v_banka_hesap_id,
      v_proje_id,
      (p_payment_data->>'tarih')::DATE,
      v_tutar,
      (CASE
        WHEN v_islem_turu = 'gelen_odeme' THEN 'gelir'
        WHEN v_islem_turu = 'uyelik_baslangic' AND v_odeme_turu <> 'cari' THEN 'gelir'
        ELSE 'gider'
      END)::public.islem_tipi,
      p_payment_data->>'aciklama',
      v_hareket_id,
      TRUE
    )
    RETURNING id INTO v_banka_hareket_id;

    UPDATE public.cari_hareketler SET banka_hareket_id = v_banka_hareket_id WHERE id = v_hareket_id;
  END IF;

  SELECT * INTO v_result FROM public.cari_hareketler WHERE id = v_hareket_id;
  RETURN to_jsonb(v_result);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.fn_create_payment_atomic IS
    'Odeme/Tahakkuk kaydi + (banka ise) banka hareketi atomik.'
    ' v4 (20260524000004): Çıkış işlemleri (giden_odeme/iade_odeme) + nakit/banka modlarında'
    ' bakiye kontrolü (FOR UPDATE / advisory lock ile race-safe). Yetersiz bakiyede P0001.';

COMMIT;
