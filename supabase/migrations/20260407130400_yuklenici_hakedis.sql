CREATE TABLE firmalar (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firma_tipi firma_tipi NOT NULL,
  unvan VARCHAR(255) NOT NULL,
  vergi_no VARCHAR(11),
  vergi_dairesi VARCHAR(100),
  telefon VARCHAR(20),
  email VARCHAR(255),
  adres TEXT,
  iban VARCHAR(34),
  yetkili_kisi VARCHAR(100),
  notlar TEXT,
  aktif BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE sozlesmeler (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firma_id UUID NOT NULL REFERENCES firmalar(id),
  sozlesme_no VARCHAR(50) UNIQUE,
  konu TEXT NOT NULL,
  toplam_tutar NUMERIC(14,2) NOT NULL,
  baslangic_tarihi DATE,
  bitis_tarihi DATE,
  teminat_orani NUMERIC(5,2) DEFAULT 0,
  stopaj_orani NUMERIC(5,2) DEFAULT 0,
  notlar TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE sozlesme_is_kalemleri (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sozlesme_id UUID NOT NULL REFERENCES sozlesmeler(id) ON DELETE CASCADE,
  poz_no VARCHAR(30),
  tanim TEXT NOT NULL,
  birim VARCHAR(30) NOT NULL,
  miktar NUMERIC(14,3) NOT NULL,
  birim_fiyat NUMERIC(14,2) NOT NULL,
  toplam_tutar NUMERIC(14,2) GENERATED ALWAYS AS (miktar * birim_fiyat) STORED,
  sira_no INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE hakedisler (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sozlesme_id UUID NOT NULL REFERENCES sozlesmeler(id),
  hakedis_no INTEGER NOT NULL,
  donem_baslangic DATE,
  donem_bitis DATE,
  toplam_tutar NUMERIC(14,2) DEFAULT 0,
  teminat_kesintisi NUMERIC(14,2) DEFAULT 0,
  stopaj_kesintisi NUMERIC(14,2) DEFAULT 0,
  diger_kesintiler NUMERIC(14,2) DEFAULT 0,
  net_tutar NUMERIC(14,2) DEFAULT 0,
  durum hakedis_durumu DEFAULT 'taslak',
  onay_tarihi DATE,
  aciklama TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(sozlesme_id, hakedis_no)
);

CREATE TABLE hakedis_kalemleri (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hakedis_id UUID NOT NULL REFERENCES hakedisler(id) ON DELETE CASCADE,
  is_kalemi_id UUID NOT NULL REFERENCES sozlesme_is_kalemleri(id),
  onceki_miktar NUMERIC(14,3) DEFAULT 0,
  bu_ay_miktar NUMERIC(14,3) NOT NULL DEFAULT 0,
  toplam_miktar NUMERIC(14,3) GENERATED ALWAYS AS (onceki_miktar + bu_ay_miktar) STORED,
  birim_fiyat NUMERIC(14,2) NOT NULL,
  bu_ay_tutar NUMERIC(14,2) GENERATED ALWAYS AS (bu_ay_miktar * birim_fiyat) STORED,
  toplam_tutar NUMERIC(14,2) GENERATED ALWAYS AS ((onceki_miktar + bu_ay_miktar) * birim_fiyat) STORED,
  created_at TIMESTAMPTZ DEFAULT now()
);
