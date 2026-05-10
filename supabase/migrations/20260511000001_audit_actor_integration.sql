-- Migration: 20260511000001_audit_actor_integration.sql
-- Description: TASK-DB-03 tamamlama. Audit trigger'ı fn_get_session_actor() kullanacak şekilde
-- güncelle + atomic mutate RPC'lerine p_actor_id parametresi + set_config çağrısı ekle.
--
-- Pattern: Backend her atomic RPC çağrısında p_actor_id geçer. RPC başında
-- set_config('app.actor_id', p_actor_id::text, true) çalışır. Trigger fn_get_session_actor()
-- ile bu session var'ı okur. Geriye uyumluluk: p_actor_id DEFAULT NULL — eski çağrılar bozulmaz.

BEGIN;

-- 1. Audit trigger fonksiyonunu güncelle (auth.uid() → fn_get_session_actor)
CREATE OR REPLACE FUNCTION public.fn_audit_log()
RETURNS TRIGGER AS $$
DECLARE
    v_record_id UUID;
    v_proje_id UUID;
    v_before JSONB;
    v_after JSONB;
    v_actor_id UUID;
    v_actor_email TEXT;
BEGIN
    IF TG_OP = 'INSERT' THEN
        v_after := to_jsonb(NEW);
    ELSIF TG_OP = 'UPDATE' THEN
        v_before := to_jsonb(OLD);
        v_after := to_jsonb(NEW);
        IF v_before = v_after THEN
            RETURN NEW;
        END IF;
    ELSIF TG_OP = 'DELETE' THEN
        v_before := to_jsonb(OLD);
    END IF;

    v_record_id := COALESCE((v_after ->> 'id')::UUID, (v_before ->> 'id')::UUID);
    v_proje_id := COALESCE((v_after ->> 'proje_id')::UUID, (v_before ->> 'proje_id')::UUID);

    -- DEGISIKLIK: auth.uid() yerine fn_get_session_actor() cagrisi.
    -- Bu helper hem auth.uid() (RLS context) hem app.actor_id (service-role) destekler.
    v_actor_id := public.fn_get_session_actor();
    IF v_actor_id IS NOT NULL THEN
        SELECT email INTO v_actor_email FROM auth.users WHERE id = v_actor_id;
    END IF;

    INSERT INTO public.audit_logs (
        actor_id, actor_email, table_name, operation,
        record_id, before_data, after_data, proje_id
    ) VALUES (
        v_actor_id, v_actor_email, TG_TABLE_NAME, TG_OP,
        v_record_id, v_before, v_after, v_proje_id
    );

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.fn_audit_log IS
    'Generic audit trigger. actor_id icin fn_get_session_actor() cagirir:'
    ' once auth.uid() (RLS context), sonra app.actor_id session var (service-role).';

-- 2. Atomic mutate RPC'lerine p_actor_id parametresi ekle.
-- Her RPC'nin basinda set_config cagrisi, sonrasinda mevcut mantik.
-- PostgreSQL'de CREATE OR REPLACE parametre listesini degistiremez -> DROP + CREATE pattern.

-- 2a. fn_create_member_atomic
-- Onceki imza: fn_create_member_atomic(JSONB) — 20260510000012_fix_uye_no_autogen.sql
DROP FUNCTION IF EXISTS public.fn_create_member_atomic(JSONB);
CREATE OR REPLACE FUNCTION public.fn_create_member_atomic(
  p_member_data JSONB,
  p_actor_id UUID DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_new_member RECORD;
BEGIN
  -- Actor session var (audit trigger icin)
  PERFORM set_config('app.actor_id', COALESCE(p_actor_id::TEXT, ''), true);

  INSERT INTO public.uyeler (
    proje_id, uye_no, ad, soyad, tc_kimlik, email, telefon,
    adres, uyelik_tarihi, durum, serefiye_id, notlar
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
    NULLIF(p_member_data->>'notlar', '')
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
    ' app.actor_id session var set edilir; audit trigger bu degeri okur.';

-- 2b. fn_update_member_atomic
-- Onceki imza: fn_update_member_atomic(UUID, JSONB) — 20260428230002_atomic_update_member.sql
DROP FUNCTION IF EXISTS public.fn_update_member_atomic(UUID, JSONB);
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
    ' app.actor_id session var set edilir; audit trigger bu degeri okur.';

-- 2c. fn_create_payment_atomic
-- Onceki imza: fn_create_payment_atomic(JSONB) — 20260428230003_atomic_create_payment.sql
DROP FUNCTION IF EXISTS public.fn_create_payment_atomic(JSONB);
CREATE OR REPLACE FUNCTION public.fn_create_payment_atomic(
  p_payment_data JSONB,
  p_actor_id UUID DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_hareket_id UUID;
  v_banka_hareket_id UUID;
  v_borc NUMERIC := 0;
  v_alacak NUMERIC := 0;
  v_result RECORD;
BEGIN
  PERFORM set_config('app.actor_id', COALESCE(p_actor_id::TEXT, ''), true);

  IF p_payment_data->>'islem_turu' = 'gelen_odeme' THEN
    v_borc := (p_payment_data->>'tutar')::NUMERIC;
  ELSE
    v_alacak := (p_payment_data->>'tutar')::NUMERIC;
  END IF;

  INSERT INTO public.cari_hareketler (
    proje_id, cari_hesap_id, islem_turu, odeme_turu, odeme_yontemi,
    tarih, borc, alacak, aciklama, belge_no, kaynak_tipi, kaynak_id
  )
  VALUES (
    (p_payment_data->>'proje_id')::UUID,
    (p_payment_data->>'cari_hesap_id')::UUID,
    p_payment_data->>'islem_turu',
    p_payment_data->>'odeme_turu',
    p_payment_data->>'odeme_turu',
    (p_payment_data->>'tarih')::DATE,
    v_borc,
    v_alacak,
    p_payment_data->>'aciklama',
    p_payment_data->>'belge_no',
    p_payment_data->>'kaynak_tipi',
    (p_payment_data->>'kaynak_id')::UUID
  )
  RETURNING id INTO v_hareket_id;

  IF p_payment_data->>'odeme_turu' = 'banka' AND p_payment_data->>'banka_hesap_id' IS NOT NULL THEN
    INSERT INTO public.banka_hareketleri (
      banka_hesap_id, proje_id, tarih, tutar, islem_tipi,
      aciklama, eslesen_cari_hareket_id, eslesti
    )
    VALUES (
      (p_payment_data->>'banka_hesap_id')::UUID,
      (p_payment_data->>'proje_id')::UUID,
      (p_payment_data->>'tarih')::DATE,
      (p_payment_data->>'tutar')::NUMERIC,
      CASE WHEN p_payment_data->>'islem_turu' = 'gelen_odeme' THEN 'gelir' ELSE 'gider' END,
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
    'Odeme kayd + (banka ise) banka hareketi atomik. p_actor_id verilirse'
    ' app.actor_id session var set edilir; audit trigger bu degeri okur.';

COMMIT;
