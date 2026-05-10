-- Migration: 20260510000013_fix_irsaliye_atomic_columns.sql
-- Description: `fn_create_irsaliye_atomic` RPC'si tabloda olmayan kolonlara INSERT
-- yapmaya çalışıyordu (`belge_no`, `aciklama`, `durum`); irsaliye_kalemleri'nde de
-- olmayan `aciklama` kolonuna yazıyordu. Sonuç: POST /api/malzeme-teslimleri 500.
--
-- Fix: RPC'yi gerçek tablo şemasına ve frontend Zod schema'sına hizala:
--   irsaliyeler:        irsaliye_no, teslim_alan, notlar (mevcut kolonlar)
--   irsaliye_kalemleri: malzeme_adi, birim, miktar (kalem aciklama yok)

CREATE OR REPLACE FUNCTION public.fn_create_irsaliye_atomic(
  p_master_data JSONB,
  p_kalemler JSONB
) RETURNS JSONB AS $$
DECLARE
  v_irsaliye_id UUID;
  v_kalem JSONB;
  v_result RECORD;
BEGIN
  INSERT INTO public.irsaliyeler (
    proje_id, firma_id, sozlesme_id, hakedis_id,
    teslim_tarihi, irsaliye_no, teslim_alan, notlar
  )
  VALUES (
    NULLIF(p_master_data->>'proje_id', '')::UUID,
    NULLIF(p_master_data->>'firma_id', '')::UUID,
    NULLIF(p_master_data->>'sozlesme_id', '')::UUID,
    NULLIF(p_master_data->>'hakedis_id', '')::UUID,
    COALESCE((p_master_data->>'teslim_tarihi')::DATE, CURRENT_DATE),
    NULLIF(p_master_data->>'irsaliye_no', ''),
    NULLIF(p_master_data->>'teslim_alan', ''),
    NULLIF(p_master_data->>'notlar', '')
  )
  RETURNING id INTO v_irsaliye_id;

  FOR v_kalem IN SELECT * FROM jsonb_array_elements(p_kalemler)
  LOOP
    INSERT INTO public.irsaliye_kalemleri (
      irsaliye_id, malzeme_adi, miktar, birim
    )
    VALUES (
      v_irsaliye_id,
      v_kalem->>'malzeme_adi',
      (v_kalem->>'miktar')::NUMERIC,
      v_kalem->>'birim'
    );
  END LOOP;

  SELECT * INTO v_result FROM public.irsaliyeler WHERE id = v_irsaliye_id;
  RETURN to_jsonb(v_result);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
