-- Migration: 20260510000012_fix_uye_no_autogen.sql
-- Description: Fix `fn_create_member_atomic` so it auto-generates `uye_no`
-- when the request body does not provide one.
--
-- Root cause: the previous RPC (20260428230001) included `uye_no` in the
-- INSERT column list and passed `p_member_data->>'uye_no'` directly. When
-- the form omits uye_no, that expression evaluates to NULL, which OVERRIDES
-- the column DEFAULT (the `uyeler_uye_no_seq` sequence). PostgreSQL only
-- applies a column DEFAULT when the column is OMITTED from the INSERT, not
-- when NULL is passed explicitly. Result: 23502 NOT NULL violation.
--
-- Fix: COALESCE the body value with an inline call to the same expression
-- used by the column DEFAULT (`'U' || LPAD(nextval(...)::text, 3, '0')`).
-- This preserves the ability to pass an explicit uye_no (e.g. for imports)
-- while restoring auto-generation when none is provided.

CREATE OR REPLACE FUNCTION public.fn_create_member_atomic(
  p_member_data JSONB
) RETURNS JSONB AS $$
DECLARE
  v_new_member RECORD;
BEGIN
  -- 1. Üyeyi Ekle
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

  -- 2. Şerefiye Durumunu Güncelle
  IF v_new_member.serefiye_id IS NOT NULL AND v_new_member.durum = 'aktif' THEN
    UPDATE public.serefiye_tablosu
    SET durum = 'dolu', uye_id = v_new_member.id
    WHERE id = v_new_member.serefiye_id;
  END IF;

  RETURN to_jsonb(v_new_member);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.fn_create_member_atomic IS
  'Yeni üye + (varsa) şerefiye dolu işaretleme atomik. uye_no body''de yoksa veya boşsa uyeler_uye_no_seq''dan otomatik üretilir; explicit verilirse override edilebilir.';
