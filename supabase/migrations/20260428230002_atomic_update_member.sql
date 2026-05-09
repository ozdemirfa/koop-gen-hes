CREATE OR REPLACE FUNCTION  public.fn_update_member_atomic(
  p_member_id UUID,
  p_update_data JSONB
) RETURNS JSONB AS $$
DECLARE
  v_old_member RECORD;
  v_updated_member RECORD;
BEGIN
  -- Mevcut bilgileri al
  SELECT * INTO v_old_member FROM public.uyeler WHERE id = p_member_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Üyeyi Güncelle
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

  -- Şerefiye Durum Senkronizasyonu
  -- 1. Daire değiştiyse
  IF v_old_member.serefiye_id IS DISTINCT FROM v_updated_member.serefiye_id THEN
    -- Eski daireyi boşalt
    IF v_old_member.serefiye_id IS NOT NULL THEN
      UPDATE public.serefiye_tablosu SET durum = 'bos', uye_id = NULL WHERE id = v_old_member.serefiye_id;
    END IF;
    -- Yeni daireyi doldur
    IF v_updated_member.serefiye_id IS NOT NULL AND v_updated_member.durum = 'aktif' THEN
      UPDATE public.serefiye_tablosu SET durum = 'dolu', uye_id = v_updated_member.id WHERE id = v_updated_member.serefiye_id;
    END IF;
  -- 2. Daire aynı ama durum değiştiyse
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

-- Atomic Ödeme Kaydı
