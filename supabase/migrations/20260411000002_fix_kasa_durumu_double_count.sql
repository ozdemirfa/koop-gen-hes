-- Fix: kasa_durumu view aidat gelirlerini çift sayıyordu.
-- aidat.service.ts createGelirKaydi her ödemede gelir_giderler'e zaten satır ekliyor,
-- bu yüzden aidatlar.odenen_tutar'ı ayrıca toplamak gelir rakamını iki katına çıkarıyordu.
CREATE OR REPLACE VIEW public.kasa_durumu AS
SELECT
  (SELECT COALESCE(SUM(tutar), 0) FROM gelir_giderler WHERE tip = 'gelir') AS toplam_gelir,
  (SELECT COALESCE(SUM(tutar), 0) FROM gelir_giderler WHERE tip = 'gider') AS toplam_gider,
  (SELECT COALESCE(SUM(tutar), 0) FROM gelir_giderler WHERE tip = 'gelir') -
  (SELECT COALESCE(SUM(tutar), 0) FROM gelir_giderler WHERE tip = 'gider') AS net_bakiye;
