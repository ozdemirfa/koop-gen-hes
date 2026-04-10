CREATE TABLE aidat_tanimlari (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  yil INTEGER NOT NULL,
  ay INTEGER NOT NULL CHECK (ay BETWEEN 1 AND 12),
  tutar NUMERIC(12,2) NOT NULL,
  son_odeme_gunu INTEGER DEFAULT 15,
  gecikme_faiz_orani NUMERIC(5,2) DEFAULT 0,
  aciklama TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(yil, ay)
);

CREATE TABLE aidatlar (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  uye_id UUID NOT NULL REFERENCES uyeler(id) ON DELETE CASCADE,
  aidat_tanimi_id UUID NOT NULL REFERENCES aidat_tanimlari(id) ON DELETE CASCADE,
  tutar NUMERIC(12,2) NOT NULL,
  gecikme_faizi NUMERIC(12,2) DEFAULT 0,
  toplam_tutar NUMERIC(12,2) GENERATED ALWAYS AS (tutar + gecikme_faizi) STORED,
  odenen_tutar NUMERIC(12,2) DEFAULT 0,
  durum aidat_durumu DEFAULT 'bekliyor',
  son_odeme_tarihi DATE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(uye_id, aidat_tanimi_id)
);

CREATE TABLE aidat_odemeleri (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aidat_id UUID NOT NULL REFERENCES aidatlar(id) ON DELETE CASCADE,
  tutar NUMERIC(12,2) NOT NULL,
  odeme_tarihi DATE NOT NULL DEFAULT CURRENT_DATE,
  odeme_yontemi odeme_yontemi NOT NULL,
  makbuz_no VARCHAR(50),
  aciklama TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
