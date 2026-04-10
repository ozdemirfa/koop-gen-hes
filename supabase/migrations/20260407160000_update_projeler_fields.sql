-- Projeler tablosuna eksik alanların eklenmesi
ALTER TABLE projeler 
ADD COLUMN durum is_kalemi_durumu DEFAULT 'planli',
ADD COLUMN blok_sayisi INTEGER DEFAULT 0,
ADD COLUMN daire_sayisi_per_blok INTEGER DEFAULT 0,
ADD COLUMN daire_kodlama_sistemi VARCHAR(50);
