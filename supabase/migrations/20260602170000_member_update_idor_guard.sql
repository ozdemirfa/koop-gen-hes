-- Migration: 20260602170000_member_update_idor_guard.sql
-- Sprint: kalite-guvenlik-2026-06 (SEC-2)
-- Description: Üye güncelleme IDOR'u. fn_update_member_atomic üyeyi yalnız
--   `WHERE id = p_member_id` ile buluyordu; proje sahiplik kontrolü yoktu.
--   service-role RLS'i bypass ettiğinden, bir projede manager olan kullanıcı
--   başka projenin üye id'sini tahmin ederek o üyeyi güncelleyebiliyordu (IDOR).
--
-- Fix: RPC'ye zorunlu `p_proje_id` parametresi eklenir; lookup ve UPDATE
--   `AND proje_id = p_proje_id` ile guard'lanır. Yabancı proje (veya yanlış
--   proje) → FOUND değil → NULL döner → service 404 fırlatır.
--   İmza değiştiği için DROP + CREATE. Yeni imza:
--     fn_update_member_atomic(p_member_id, p_proje_id, p_update_data, p_actor_id)
--
-- Not: SECURITY DEFINER fonksiyon yeniden oluşturulduğundan `search_path`
--   açıkça pinlenir (20260602170200 sweep'i de yakalar ama defense-in-depth).

BEGIN;

DROP FUNCTION IF EXISTS public.fn_update_member_atomic(UUID, JSONB, UUID);

CREATE OR REPLACE FUNCTION public.fn_update_member_atomic(
  p_member_id   UUID,
  p_proje_id    UUID,
  p_update_data JSONB,
  p_actor_id    UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_old_member RECORD;
  v_updated_member RECORD;
BEGIN
  IF p_proje_id IS NULL THEN
    RAISE EXCEPTION 'proje_id zorunlu' USING ERRCODE = '23502', COLUMN = 'proje_id';
  END IF;

  PERFORM set_config('app.actor_id', COALESCE(p_actor_id::TEXT, ''), true);

  -- IDOR guard: üye yalnız kendi projesinde bulunur.
  SELECT * INTO v_old_member
    FROM public.uyeler
   WHERE id = p_member_id AND proje_id = p_proje_id;
  IF NOT FOUND THEN
    RETURN NULL;  -- service NULL'ı 404'e çevirir
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
  WHERE id = p_member_id AND proje_id = p_proje_id
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
$$;

COMMENT ON FUNCTION public.fn_update_member_atomic(UUID, UUID, JSONB, UUID) IS
    'Uye guncelleme + serefiye senkron atomik. v4 (SEC-2): zorunlu p_proje_id +'
    ' WHERE proje_id guard (IDOR fix). p_actor_id app.actor_id session var set eder.';

COMMIT;
