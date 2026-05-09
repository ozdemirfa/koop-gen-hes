CREATE OR REPLACE FUNCTION  public.fn_create_member_atomic(
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
    p_member_data->>'uye_no',
    p_member_data->>'ad',
    p_member_data->>'soyad',
    p_member_data->>'tc_kimlik',
    p_member_data->>'email',
    p_member_data->>'telefon',
    p_member_data->>'adres',
    COALESCE((p_member_data->>'uyelik_tarihi')::DATE, CURRENT_DATE),
    COALESCE(p_member_data->>'durum', 'aktif')::public.uyelik_durumu,
    (p_member_data->>'serefiye_id')::UUID,
    p_member_data->>'notlar'
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

-- Atomic Üye Güncelleme
