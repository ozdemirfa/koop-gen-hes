-- Migration: 20260510000001_fn_list_unmatched_cari.sql
-- Description: cari_hareketler içinde banka_hareketleri ile eşleşmemiş kayıtları
-- anti-join ile tek RPC üzerinden dönen güvenli filtre fonksiyonu.
-- Önceki çözüm UUID listesini PostgREST URL'sine query parametresi olarak gömüyordu;
-- hem güvenlik hem de URL uzunluk limiti açısından sakıncalıydı.

CREATE OR REPLACE FUNCTION public.fn_list_unmatched_cari_hareketler(
  p_filters JSONB
) RETURNS JSONB AS $$
DECLARE
  v_result JSONB;
BEGIN
  IF p_filters->>'proje_id' IS NULL THEN
    RAISE EXCEPTION 'proje_id zorunludur';
  END IF;

  SELECT COALESCE(jsonb_agg(row_data ORDER BY (row_data->>'tarih')::DATE ASC), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT to_jsonb(ch.*) || jsonb_build_object(
      'cari_hesaplar', jsonb_build_object(
        'cari_adi', c.cari_adi,
        'cari_turu', c.cari_turu,
        'uye_id', c.uye_id,
        'firma_id', c.firma_id,
        'proje_id', c.proje_id
      )
    ) AS row_data
    FROM public.cari_hareketler ch
    JOIN public.cari_hesaplar c ON ch.cari_hesap_id = c.id
    WHERE ch.proje_id = (p_filters->>'proje_id')::UUID
      AND NOT EXISTS (
        SELECT 1 FROM public.banka_hareketleri bh
        WHERE bh.eslesen_cari_hareket_id = ch.id
      )
      AND (p_filters->>'uye_id' IS NULL OR c.uye_id = (p_filters->>'uye_id')::UUID)
      AND (p_filters->>'firma_id' IS NULL OR c.firma_id = (p_filters->>'firma_id')::UUID)
      AND (p_filters->>'cari_turu' IS NULL OR c.cari_turu::TEXT = p_filters->>'cari_turu')
      AND (p_filters->>'islem_turu' IS NULL OR ch.islem_turu::TEXT = p_filters->>'islem_turu')
      AND (p_filters->>'baslangic_tarihi' IS NULL OR ch.tarih >= (p_filters->>'baslangic_tarihi')::DATE)
      AND (p_filters->>'bitis_tarihi' IS NULL OR ch.tarih <= (p_filters->>'bitis_tarihi')::DATE)
  ) sub;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
