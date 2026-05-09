CREATE OR REPLACE FUNCTION  public.fn_create_irsaliye_atomic(
  p_master_data JSONB,
  p_kalemler JSONB
) RETURNS JSONB AS $$
DECLARE
  v_irsaliye_id UUID;
  v_kalem JSONB;
  v_result RECORD;
BEGIN
  -- 1. İrsaliye Ekle
  INSERT INTO public.irsaliyeler (
    proje_id, firma_id, sozlesme_id, hakedis_id,
    teslim_tarihi, belge_no, aciklama, durum
  )
  VALUES (
    (p_master_data->>'proje_id')::UUID,
    (p_master_data->>'firma_id')::UUID,
    (p_master_data->>'sozlesme_id')::UUID,
    (p_master_data->>'hakedis_id')::UUID,
    (p_master_data->>'teslim_tarihi')::DATE,
    p_master_data->>'belge_no',
    p_master_data->>'aciklama',
    COALESCE(p_master_data->>'durum', 'beklemede')
  )
  RETURNING id INTO v_irsaliye_id;

  -- 2. Kalemleri Ekle
  FOR v_kalem IN SELECT * FROM jsonb_array_elements(p_kalemler)
  LOOP
    INSERT INTO public.irsaliye_kalemleri (
      irsaliye_id, malzeme_adi, miktar, birim, aciklama
    )
    VALUES (
      v_irsaliye_id,
      v_kalem->>'malzeme_adi',
      (v_kalem->>'miktar')::NUMERIC,
      v_kalem->>'birim',
      v_kalem->>'aciklama'
    );
  END LOOP;

  SELECT * INTO v_result FROM public.irsaliyeler WHERE id = v_irsaliye_id;
  RETURN to_jsonb(v_result);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
