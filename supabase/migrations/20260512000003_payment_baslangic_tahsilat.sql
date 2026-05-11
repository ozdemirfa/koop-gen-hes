-- Migration: 20260512000003_payment_baslangic_tahsilat.sql
-- Description: REV-PAY-02 — Üyelik başlangıç bedeli (uyelik_baslangic) artık hibrit
-- işlem türü. Frontend kullanıcı `odeme_turu`'yu seçer:
--   * odeme_turu='cari'                       → TAHAKKUK (cari'de v_alacak, banka hareketi yok)
--   * odeme_turu IN ('banka','nakit','kredi_karti')  → TAHSİLAT (cari'de v_borc, banka hareketi varsa)
--   * odeme_turu='cek'                        → frontend ayrı path (cek tablosuna kayıt)
--
-- Önceki RPC (20260511000002) tüm `gelen_odeme` dışı işlemler için v_alacak yazıyordu;
-- uyelik_baslangic+banka kombinasyonu bu yüzden YANLIŞ yön kaydediyordu (üyenin alacağı
-- artıyordu, oysa tahsilat üyenin borcunu kapatır = v_borc).
--
-- Aynı yanlış kompozisyon banka_hareketleri.islem_tipi hesabında da var: 'gelen_odeme'
-- dışı her şey 'gider' yazıyor. uyelik_baslangic+banka aslında 'gelir' (üye bize ödedi).
--
-- Bu migration: borc/alacak ayrımını ve islem_tipi hesabını semantik-doğru hale getirir.
-- İmza ve davranış (banka_hareketi koşulu, enum cast) korunur.

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
  v_result RECORD;
BEGIN
  PERFORM set_config('app.actor_id', COALESCE(p_actor_id::TEXT, ''), true);

  -- REV-PAY-02: borc/alacak ayrımı islem_turu × odeme_turu kombinasyonuna duyarlı.
  IF v_islem_turu = 'gelen_odeme' THEN
    v_borc := v_tutar;                                            -- üyeden tahsilat → uye carisi borc'lanir
  ELSIF v_islem_turu = 'uyelik_baslangic' AND v_odeme_turu = 'cari' THEN
    v_alacak := v_tutar;                                          -- tahakkuk → uyenin alacagi artar (uye bize borc'lanir)
  ELSIF v_islem_turu = 'uyelik_baslangic' THEN
    v_borc := v_tutar;                                            -- tahsilat (banka/nakit/...) → uye borc'unu kapatir
  ELSE
    v_alacak := v_tutar;                                          -- giden_odeme, iade_odeme: uye alacagi/odeme cikisi
  END IF;

  INSERT INTO public.cari_hareketler (
    proje_id, cari_hesap_id, islem_turu, odeme_turu, odeme_yontemi,
    tarih, borc, alacak, aciklama, belge_no, kaynak_tipi, kaynak_id
  )
  VALUES (
    (p_payment_data->>'proje_id')::UUID,
    (p_payment_data->>'cari_hesap_id')::UUID,
    v_islem_turu,
    v_odeme_turu,
    v_odeme_turu::public.odeme_yontemi,                            -- enum cast (cari dahil; 20260512000002 ile enum'a eklendi)
    (p_payment_data->>'tarih')::DATE,
    v_borc,
    v_alacak,
    p_payment_data->>'aciklama',
    p_payment_data->>'belge_no',
    p_payment_data->>'kaynak_tipi',
    NULLIF(p_payment_data->>'kaynak_id', '')::UUID
  )
  RETURNING id INTO v_hareket_id;

  -- Banka hareketi yalnizca gercek banka odemesi icin atilir (cari/nakit/cek/kredi_karti DEGIL).
  IF v_odeme_turu = 'banka' AND p_payment_data->>'banka_hesap_id' IS NOT NULL THEN
    INSERT INTO public.banka_hareketleri (
      banka_hesap_id, proje_id, tarih, tutar, islem_tipi,
      aciklama, eslesen_cari_hareket_id, eslesti
    )
    VALUES (
      (p_payment_data->>'banka_hesap_id')::UUID,
      (p_payment_data->>'proje_id')::UUID,
      (p_payment_data->>'tarih')::DATE,
      v_tutar,
      -- REV-PAY-02: islem_tipi 'gelir/gider' ayrimi yon semantigine duyarli hale getirildi.
      -- gelen_odeme + uyelik_baslangic_tahsilat → gelir (kasaya para girdi).
      -- giden_odeme + iade_odeme → gider (kasadan para cikti).
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
    'Odeme/Tahakkuk kaydi + (banka ise) banka hareketi atomik. p_actor_id verilirse'
    ' app.actor_id session var set edilir; audit trigger bu degeri okur.'
    ' v3 (REV-PAY-02): uyelik_baslangic hibrit (cari=tahakkuk, banka/nakit=tahsilat)'
    ' borc/alacak ayrimi ve islem_tipi (gelir/gider) hesabi semantik-dogru.';

COMMIT;
