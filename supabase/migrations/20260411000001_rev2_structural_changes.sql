-- Revizyon 2 Yapısal Değişiklikler

-- 1. Şerefiye Tablosu
CREATE TABLE serefiye_tablosu (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proje_id UUID NOT NULL REFERENCES projeler(id) ON DELETE CASCADE,
  blok_id UUID NOT NULL REFERENCES bloklar(id) ON DELETE CASCADE,
  daire_no VARCHAR(20) NOT NULL, -- Blok & "." & Daire No formatında (Frontend'de oluşturulacak)
  daire_sira_no INTEGER NOT NULL,
  kat INTEGER,
  yon VARCHAR(50),
  serefiye_orani NUMERIC(6,3) DEFAULT 0, -- 3 ondalık basamaklı
  durum VARCHAR(20) DEFAULT 'bos', -- 'bos', 'dolu', 'rezerv'
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(blok_id, daire_sira_no)
);

-- 2. Üyeler Tablosu Güncelleme
ALTER TABLE uyeler RENAME COLUMN hisse_orani TO serefiye_orani;
ALTER TABLE uyeler ADD COLUMN serefiye_id UUID REFERENCES serefiye_tablosu(id);

-- 3. Çek Takibi Tablosu
CREATE TABLE cekler (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firma_id UUID NOT NULL REFERENCES firmalar(id),
  proje_id UUID REFERENCES projeler(id), -- Çek hangi proje kapsamında verildi
  cek_no VARCHAR(50) NOT NULL,
  banka VARCHAR(100) NOT NULL,
  sube VARCHAR(100),
  tutar NUMERIC(14,2) NOT NULL,
  vade_tarihi DATE NOT NULL,
  keside_tarihi DATE DEFAULT CURRENT_DATE,
  durum VARCHAR(20) DEFAULT 'beklemede', -- 'beklemede', 'odendi', 'iade', 'iptal'
  aciklama TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Hakedişler No Sequence ve Kolon İsimlendirme
ALTER TABLE hakedisler RENAME COLUMN toplam_tutar TO brut_tutar;
CREATE SEQUENCE hakedis_no_seq;
ALTER TABLE hakedisler ALTER COLUMN hakedis_no SET DEFAULT nextval('hakedis_no_seq');

-- 5. İrsaliye ve Fatura Master-Detail Yapısı
-- Mevcut malzeme_teslimleri tablosunu master-detail'e dönüştüreceğiz.
-- Yeni tablolar: irsaliyeler, irsaliye_kalemleri

CREATE TABLE irsaliyeler (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firma_id UUID NOT NULL REFERENCES firmalar(id),
  sozlesme_id UUID REFERENCES sozlesmeler(id),
  proje_id UUID REFERENCES projeler(id),
  irsaliye_no VARCHAR(50),
  teslim_tarihi DATE NOT NULL DEFAULT CURRENT_DATE,
  teslim_alan VARCHAR(100),
  notlar TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE irsaliye_kalemleri (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  irsaliye_id UUID NOT NULL REFERENCES irsaliyeler(id) ON DELETE CASCADE,
  malzeme_adi VARCHAR(255) NOT NULL,
  birim VARCHAR(30) NOT NULL,
  miktar NUMERIC(14,3) NOT NULL,
  birim_fiyat NUMERIC(14,2) DEFAULT 0,
  toplam_tutar NUMERIC(14,2) GENERATED ALWAYS AS (miktar * birim_fiyat) STORED,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Fatura kalemleri (Faturalar tablosu zaten var, kalemlerini ekleyelim)
CREATE TABLE fatura_kalemleri (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fatura_id UUID NOT NULL REFERENCES faturalar(id) ON DELETE CASCADE,
  kalem_adi VARCHAR(255) NOT NULL,
  birim VARCHAR(30) NOT NULL,
  miktar NUMERIC(14,3) NOT NULL,
  birim_fiyat NUMERIC(14,2) NOT NULL,
  kdv_orani NUMERIC(5,2) DEFAULT 20,
  ara_toplam NUMERIC(14,2) GENERATED ALWAYS AS (miktar * birim_fiyat) STORED,
  kdv_tutar NUMERIC(14,2) GENERATED ALWAYS AS (miktar * birim_fiyat * kdv_orani / 100) STORED,
  toplam_tutar NUMERIC(14,2) GENERATED ALWAYS AS (miktar * birim_fiyat * (1 + kdv_orani / 100)) STORED,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Mevcut verileri taşıma (Opsiyonel ama iyi olur)
INSERT INTO irsaliyeler (id, firma_id, sozlesme_id, irsaliye_no, teslim_tarihi, teslim_alan, notlar, created_at)
SELECT id, firma_id, sozlesme_id, irsaliye_no, teslim_tarihi, teslim_alan, notlar, created_at
FROM malzeme_teslimleri;

INSERT INTO irsaliye_kalemleri (irsaliye_id, malzeme_adi, birim, miktar, birim_fiyat, created_at)
SELECT id, malzeme_adi, birim, miktar, birim_fiyat, created_at
FROM malzeme_teslimleri;

-- 6. Cari Hareketler için Çek Entegrasyonu
ALTER TABLE cari_hareketler ADD COLUMN cek_id UUID REFERENCES cekler(id);

-- 7. Proje Bazlı Workspace Mantığı için Eklemeler
-- Birçok tabloya proje_id eklenmiş olmalı. Eksikleri tamamlayalım.
ALTER TABLE faturalar ADD COLUMN proje_id UUID REFERENCES projeler(id);
ALTER TABLE cari_hareketler ADD COLUMN proje_id UUID REFERENCES projeler(id);
ALTER TABLE banka_hesaplari ADD COLUMN proje_id UUID REFERENCES projeler(id);
ALTER TABLE banka_hareketleri ADD COLUMN proje_id UUID REFERENCES projeler(id);
ALTER TABLE gelir_giderler ADD COLUMN proje_id UUID REFERENCES projeler(id);

-- 8. Üye Durumu Değiştiğinde Daireyi Boşaltma Trigger'ı
CREATE OR REPLACE FUNCTION func_uye_durum_degisti_daire_bosalt()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.durum != 'aktif' AND OLD.durum = 'aktif' THEN
    UPDATE serefiye_tablosu SET durum = 'bos' WHERE id = OLD.serefiye_id;
    NEW.serefiye_id := NULL;
    NEW.daire_no := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_uye_durum_degisti_daire_bosalt
BEFORE UPDATE ON uyeler
FOR EACH ROW
WHEN (NEW.durum IS DISTINCT FROM OLD.durum)
EXECUTE FUNCTION func_uye_durum_degisti_daire_bosalt();
