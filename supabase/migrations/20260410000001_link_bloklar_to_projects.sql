-- Bloklar tablosunu projelere bağla ve genişlet
ALTER TABLE bloklar ADD COLUMN proje_id UUID REFERENCES projeler(id);
ALTER TABLE bloklar ADD COLUMN daire_baslangic_no INTEGER DEFAULT 1;

-- Projeler tablosundaki eski blok alanlarını temizle (opsiyonel ama düzen için iyi)
-- ALTER TABLE projeler DROP COLUMN blok_sayisi;
-- ALTER TABLE projeler DROP COLUMN daire_sayisi_per_blok;
-- ALTER TABLE projeler DROP COLUMN daire_kodlama_sistemi;
