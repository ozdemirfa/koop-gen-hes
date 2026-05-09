CREATE OR REPLACE FUNCTION  public.fn_create_payment_atomic(
  p_payment_data JSONB
) RETURNS JSONB AS $$
DECLARE
  v_hareket_id UUID;
  v_banka_hareket_id UUID;
  v_borc NUMERIC := 0;
  v_alacak NUMERIC := 0;
  v_result RECORD;
BEGIN
  -- Borç/Alacak Belirle
  IF p_payment_data->>'islem_turu' = 'gelen_odeme' THEN
    v_borc := (p_payment_data->>'tutar')::NUMERIC;
  ELSE
    v_alacak := (p_payment_data->>'tutar')::NUMERIC;
  END IF;

  -- 1. Cari Hareket Ekle
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

  -- 2. Banka Hareketi (Eğer banka ise)
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

    -- Cari hareketi banka hareketiyle bağla
    UPDATE public.cari_hareketler SET banka_hareket_id = v_banka_hareket_id WHERE id = v_hareket_id;
  END IF;

  SELECT * INTO v_result FROM public.cari_hareketler WHERE id = v_hareket_id;
  RETURN to_jsonb(v_result);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Atomic İrsaliye ve Kalemleri
