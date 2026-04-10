CREATE TABLE gelir_gider_kategorileri (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ad VARCHAR(100) NOT NULL,
  tip islem_tipi NOT NULL,
  ust_kategori_id UUID REFERENCES gelir_gider_kategorileri(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE gelir_giderler (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tip islem_tipi NOT NULL,
  kategori_id UUID NOT NULL REFERENCES gelir_gider_kategorileri(id),
  tutar NUMERIC(12,2) NOT NULL,
  tarih DATE NOT NULL DEFAULT CURRENT_DATE,
  aciklama TEXT,
  belge_no VARCHAR(50),
  ilgili_firma VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
