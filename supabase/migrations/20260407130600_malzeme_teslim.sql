CREATE TABLE malzeme_teslimleri (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firma_id UUID REFERENCES firmalar(id),
  sozlesme_id UUID REFERENCES sozlesmeler(id),
  teslim_tarihi DATE NOT NULL DEFAULT CURRENT_DATE,
  malzeme_adi VARCHAR(255) NOT NULL,
  malzeme_tipi VARCHAR(100),
  birim VARCHAR(30) NOT NULL,
  miktar NUMERIC(14,3) NOT NULL,
  birim_fiyat NUMERIC(14,2) NOT NULL,
  toplam_tutar NUMERIC(14,2) GENERATED ALWAYS AS (miktar * birim_fiyat) STORED,
  teslim_alan VARCHAR(100),
  irsaliye_no VARCHAR(50),
  notlar TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
