-- Gelir/Gider tablosunu genişlet
ALTER TABLE gelir_giderler ADD COLUMN uye_id UUID REFERENCES uyeler(id);
ALTER TABLE gelir_giderler ADD COLUMN firma_id UUID REFERENCES firmalar(id);
ALTER TABLE gelir_giderler ADD COLUMN kaynak_tipi VARCHAR(50); -- 'aidat', 'fatura', 'manuel'
ALTER TABLE gelir_giderler ADD COLUMN kaynak_id UUID; -- İlgili aidat_odeme_id veya fatura_id
