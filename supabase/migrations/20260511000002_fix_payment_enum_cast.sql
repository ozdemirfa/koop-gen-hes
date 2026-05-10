-- Migration: 20260511000002_fix_payment_enum_cast.sql
-- Description: Fix 500 hatası — fn_create_payment_atomic INSERT içinde
-- p_payment_data->>'odeme_turu' (text) ifadesi cari_hareketler.odeme_yontemi
-- kolonuna (enum public.odeme_yontemi) cast olmadan atanıyor;
-- PG14+/15 plpgsql cached plan validate edildiğinde 42804 hatası fırlatıyor.
--
-- Repro (önce):
--   SELECT public.fn_create_payment_atomic(
--     '{"proje_id":"...","cari_hesap_id":"...","islem_turu":"giden_odeme",
--       "odeme_turu":"nakit","tutar":1,"tarih":"2026-05-11"}'::jsonb, NULL);
--   ERROR: 42804: column "odeme_yontemi" is of type odeme_yontemi but expression is of type text
--
-- Fix: odeme_yontemi VALUES listesine ::public.odeme_yontemi cast eklendi.
-- Bonus: banka_hareketleri.islem_tipi (enum) için CASE çıktısına ::public.islem_tipi
-- eklendi (literal string PG'de unknown→enum coerce edilebildiği için şu an çalışıyor
-- ama explicit daha sağlam).
--
-- İmza ve davranış aynı kaldı — sadece tip cast'leri eklendi.

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
  v_result RECORD;
BEGIN
  -- Actor session var (audit trigger için)
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
    -- FIX: text → enum explicit cast (42804 fix)
    (p_payment_data->>'odeme_turu')::public.odeme_yontemi,
    (p_payment_data->>'tarih')::DATE,
    v_borc,
    v_alacak,
    p_payment_data->>'aciklama',
    p_payment_data->>'belge_no',
    p_payment_data->>'kaynak_tipi',
    NULLIF(p_payment_data->>'kaynak_id', '')::UUID
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
      -- BONUS: literal şu an çalışıyor ama explicit cast daha sağlam
      (CASE WHEN p_payment_data->>'islem_turu' = 'gelen_odeme' THEN 'gelir' ELSE 'gider' END)::public.islem_tipi,
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
    'Odeme kaydi + (banka ise) banka hareketi atomik. p_actor_id verilirse'
    ' app.actor_id session var set edilir; audit trigger bu degeri okur.'
    ' v2: odeme_yontemi enum cast fix (42804). kaynak_id NULLIF eklendi.';

COMMIT;
