-- Migration: 20260512000001_member_atomic_cinsiyet.sql
-- Description: REV-MEM-01 — Üye düzenle ekranında cinsiyet alanı dolu gelmiyordu çünkü
-- fn_create_member_atomic INSERT listesinde ve fn_update_member_atomic UPDATE SET
-- listesinde `cinsiyet` kolonu hiç yazılmıyordu. Frontend form'dan cinsiyet gönderilse
-- bile DB'ye yazılmıyordu; sonraki get'te NULL döndüğü için Select boş gözüküyordu.
--
-- Fix: iki RPC'nin gövdesine `cinsiyet` kolonu eklenir. RPC imzaları (parametre listesi
-- ve dönüş tipi) korunur — sadece SET / VALUES içeriğine field eklenir, yine de
-- DROP + CREATE pattern kullanılır çünkü 20260511000001 ile uyumlu kalmak istiyoruz
-- (imza aynı, body değişiyor; aslında `CREATE OR REPLACE` yeterli ama DROP'lu pattern
-- audit migration ile birebir simetrik kalsın diye tercih edildi).
--
-- cinsiyet ENUM ('erkek','kadin') — 20260407130100_core_and_uyeler.sql:68 tanımlı.
-- Boş string ('') iletildiğinde NULL olarak yazılır (NULLIF), DB ENUM cast hatası önlenir.

BEGIN;

-- 1. fn_create_member_atomic — cinsiyet eklenir
DROP FUNCTION IF EXISTS public.fn_create_member_atomic(JSONB, UUID);
CREATE OR REPLACE FUNCTION public.fn_create_member_atomic(
  p_member_data JSONB,
  p_actor_id UUID DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_new_member RECORD;
BEGIN
  PERFORM set_config('app.actor_id', COALESCE(p_actor_id::TEXT, ''), true);

  INSERT INTO public.uyeler (
    proje_id, uye_no, ad, soyad, tc_kimlik, email, telefon,
    adres, uyelik_tarihi, durum, serefiye_id, notlar, cinsiyet
  )
  VALUES (
    (p_member_data->>'proje_id')::UUID,
    COALESCE(
      NULLIF(p_member_data->>'uye_no', ''),
      'U' || LPAD(nextval('public.uyeler_uye_no_seq')::text, 3, '0')
    ),
    p_member_data->>'ad',
    p_member_data->>'soyad',
    NULLIF(p_member_data->>'tc_kimlik', ''),
    NULLIF(p_member_data->>'email', ''),
    NULLIF(p_member_data->>'telefon', ''),
    NULLIF(p_member_data->>'adres', ''),
    COALESCE((p_member_data->>'uyelik_tarihi')::DATE, CURRENT_DATE),
    COALESCE(p_member_data->>'durum', 'aktif')::public.uyelik_durumu,
    NULLIF(p_member_data->>'serefiye_id', '')::UUID,
    NULLIF(p_member_data->>'notlar', ''),
    NULLIF(p_member_data->>'cinsiyet', '')::public.cinsiyet
  )
  RETURNING * INTO v_new_member;

  IF v_new_member.serefiye_id IS NOT NULL AND v_new_member.durum = 'aktif' THEN
    UPDATE public.serefiye_tablosu
    SET durum = 'dolu', uye_id = v_new_member.id
    WHERE id = v_new_member.serefiye_id;
  END IF;

  RETURN to_jsonb(v_new_member);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.fn_create_member_atomic IS
    'Yeni uye + (varsa) serefiye dolu isaretle atomik. p_actor_id verilirse'
    ' app.actor_id session var set edilir; audit trigger bu degeri okur.'
    ' v3: cinsiyet alani INSERT listesine eklendi (REV-MEM-01).';

-- 2. fn_update_member_atomic — cinsiyet eklenir
DROP FUNCTION IF EXISTS public.fn_update_member_atomic(UUID, JSONB, UUID);
CREATE OR REPLACE FUNCTION public.fn_update_member_atomic(
  p_member_id UUID,
  p_update_data JSONB,
  p_actor_id UUID DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_old_member RECORD;
  v_updated_member RECORD;
BEGIN
  PERFORM set_config('app.actor_id', COALESCE(p_actor_id::TEXT, ''), true);

  SELECT * INTO v_old_member FROM public.uyeler WHERE id = p_member_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  UPDATE public.uyeler
  SET
    ad = COALESCE(p_update_data->>'ad', ad),
    soyad = COALESCE(p_update_data->>'soyad', soyad),
    tc_kimlik = COALESCE(p_update_data->>'tc_kimlik', tc_kimlik),
    email = COALESCE(p_update_data->>'email', email),
    telefon = COALESCE(p_update_data->>'telefon', telefon),
    adres = COALESCE(p_update_data->>'adres', adres),
    uyelik_tarihi = COALESCE((p_update_data->>'uyelik_tarihi')::DATE, uyelik_tarihi),
    durum = COALESCE((p_update_data->>'durum')::public.uyelik_durumu, durum),
    serefiye_id = (CASE WHEN p_update_data ? 'serefiye_id' THEN (p_update_data->>'serefiye_id')::UUID ELSE serefiye_id END),
    notlar = COALESCE(p_update_data->>'notlar', notlar),
    -- REV-MEM-01: cinsiyet update destegi. Body'de 'cinsiyet' key'i varsa
    -- (bos string -> NULL, gecerli enum -> set), yoksa eski deger korunur.
    cinsiyet = (CASE WHEN p_update_data ? 'cinsiyet'
                     THEN NULLIF(p_update_data->>'cinsiyet', '')::public.cinsiyet
                     ELSE cinsiyet END),
    updated_at = NOW()
  WHERE id = p_member_id
  RETURNING * INTO v_updated_member;

  -- Serefiye durum senkronizasyonu
  IF v_old_member.serefiye_id IS DISTINCT FROM v_updated_member.serefiye_id THEN
    IF v_old_member.serefiye_id IS NOT NULL THEN
      UPDATE public.serefiye_tablosu SET durum = 'bos', uye_id = NULL WHERE id = v_old_member.serefiye_id;
    END IF;
    IF v_updated_member.serefiye_id IS NOT NULL AND v_updated_member.durum = 'aktif' THEN
      UPDATE public.serefiye_tablosu SET durum = 'dolu', uye_id = v_updated_member.id WHERE id = v_updated_member.serefiye_id;
    END IF;
  ELSIF v_updated_member.serefiye_id IS NOT NULL AND v_old_member.durum IS DISTINCT FROM v_updated_member.durum THEN
    IF v_updated_member.durum = 'aktif' THEN
      UPDATE public.serefiye_tablosu SET durum = 'dolu', uye_id = v_updated_member.id WHERE id = v_updated_member.serefiye_id;
    ELSE
      UPDATE public.serefiye_tablosu SET durum = 'bos', uye_id = NULL WHERE id = v_updated_member.serefiye_id;
    END IF;
  END IF;

  RETURN to_jsonb(v_updated_member);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.fn_update_member_atomic IS
    'Uye guncelleme + serefiye senkron atomik. p_actor_id verilirse'
    ' app.actor_id session var set edilir; audit trigger bu degeri okur.'
    ' v3: cinsiyet alani UPDATE SET listesine eklendi (REV-MEM-01).';

COMMIT;
