-- Örnek Firma Ekle (Eğer yoksa)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM firmalar) THEN
    INSERT INTO firmalar (firma_tipi, unvan, vergi_no, vergi_dairesi, yetkili_kisi, telefon, email, aktif)
    VALUES ('yuklenici', 'Örnek E2E Firması', '1234567890', 'Test VD', 'Yetkili', '05554443322', 'firma@test.com', true);
  END IF;
END $$;
