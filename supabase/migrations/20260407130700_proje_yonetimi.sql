CREATE TABLE projeler (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proje_adi VARCHAR(255) NOT NULL,
  aciklama TEXT,
  baslangic_tarihi DATE,
  bitis_tarihi DATE,
  toplam_butce NUMERIC(14,2) DEFAULT 0,
  aktif BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE proje_is_kalemleri (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proje_id UUID NOT NULL REFERENCES projeler(id) ON DELETE CASCADE,
  ust_kalem_id UUID REFERENCES proje_is_kalemleri(id),
  sira_no INTEGER DEFAULT 0,
  kalem_kodu VARCHAR(30),
  tanim TEXT NOT NULL,
  birim VARCHAR(30),
  miktar NUMERIC(14,3),
  birim_fiyat NUMERIC(14,2),
  butce_tutari NUMERIC(14,2) DEFAULT 0,
  durum is_kalemi_durumu DEFAULT 'planli',
  notlar TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE yillik_harcama_planlari (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proje_id UUID NOT NULL REFERENCES projeler(id),
  yil INTEGER NOT NULL,
  toplam_butce NUMERIC(14,2) DEFAULT 0,
  aciklama TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(proje_id, yil)
);

CREATE TABLE yillik_plan_kalemleri (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES yillik_harcama_planlari(id) ON DELETE CASCADE,
  proje_is_kalemi_id UUID NOT NULL REFERENCES proje_is_kalemleri(id),
  ay INTEGER NOT NULL CHECK (ay BETWEEN 1 AND 12),
  planlanan_tutar NUMERIC(14,2) DEFAULT 0,
  gerceklesen_tutar NUMERIC(14,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(plan_id, proje_is_kalemi_id, ay)
);
