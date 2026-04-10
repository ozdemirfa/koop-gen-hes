INSERT INTO gelir_gider_kategorileri (ad, tip) VALUES
  ('Aidat Gelirleri', 'gelir'),
  ('Kira Gelirleri', 'gelir'),
  ('Faiz Gelirleri', 'gelir'),
  ('Diğer Gelirler', 'gelir'),
  ('Bakım/Onarım', 'gider'),
  ('Elektrik', 'gider'),
  ('Su', 'gider'),
  ('Doğalgaz', 'gider'),
  ('Temizlik', 'gider'),
  ('Personel', 'gider'),
  ('Güvenlik', 'gider'),
  ('Sigorta', 'gider'),
  ('Vergi/Harç', 'gider'),
  ('Demirbaş', 'gider'),
  ('İnşaat Malzemesi', 'gider'),
  ('İşçilik', 'gider'),
  ('Hukuk/Müşavirlik', 'gider'),
  ('Diğer Giderler', 'gider');

-- Örnek Bloklar ve Üyeler
DO $$
DECLARE
  blok1 UUID;
  blok2 UUID;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM bloklar) THEN
    INSERT INTO bloklar (blok_adi, toplam_daire) VALUES ('A Blok', 20) RETURNING id INTO blok1;
    INSERT INTO bloklar (blok_adi, toplam_daire) VALUES ('B Blok', 20) RETURNING id INTO blok2;

    INSERT INTO uyeler (uye_no, tc_kimlik, ad, soyad, blok_id, daire_no, durum)
    VALUES 
    ('U001', '11111111111', 'Ahmet', 'Yılmaz', blok1, '1', 'aktif'),
    ('U002', '22222222222', 'Ayşe', 'Kaya', blok1, '2', 'aktif'),
    ('U003', '33333333333', 'Mehmet', 'Demir', blok2, '1', 'aktif');
  END IF;
END $$;
