-- Üye numarası için otomatik artan bir sequence (dizi) oluştur
CREATE SEQUENCE IF NOT EXISTS uyeler_uye_no_seq START 4;

-- Üyeler tablosunun uye_no sütununun varsayılan değerini sequence kullanarak otomatik formatla
ALTER TABLE uyeler ALTER COLUMN uye_no SET DEFAULT 'U' || LPAD(nextval('uyeler_uye_no_seq')::text, 3, '0');
