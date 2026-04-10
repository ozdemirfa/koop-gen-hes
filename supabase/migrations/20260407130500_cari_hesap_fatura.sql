CREATE TABLE faturalar (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firma_id UUID NOT NULL REFERENCES firmalar(id),
  fatura_tipi fatura_tipi NOT NULL,
  fatura_no VARCHAR(50) NOT NULL,
  fatura_tarihi DATE NOT NULL,
  vade_tarihi DATE,
  ara_toplam NUMERIC(14,2) NOT NULL,
  kdv_orani NUMERIC(5,2) DEFAULT 20,
  kdv_tutar NUMERIC(14,2) DEFAULT 0,
  toplam_tutar NUMERIC(14,2) NOT NULL,
  durum fatura_durumu DEFAULT 'bekliyor',
  aciklama TEXT,
  hakedis_id UUID REFERENCES hakedisler(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE odeme_planlari (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fatura_id UUID NOT NULL REFERENCES faturalar(id) ON DELETE CASCADE,
  taksit_no INTEGER NOT NULL,
  tutar NUMERIC(14,2) NOT NULL,
  vade_tarihi DATE NOT NULL,
  odendi BOOLEAN DEFAULT false,
  odeme_tarihi DATE,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE cari_hareketler (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firma_id UUID NOT NULL REFERENCES firmalar(id),
  hareket_tipi cari_hareket_tipi NOT NULL,
  tutar NUMERIC(14,2) NOT NULL,
  tarih DATE NOT NULL DEFAULT CURRENT_DATE,
  aciklama TEXT,
  fatura_id UUID REFERENCES faturalar(id),
  hakedis_id UUID REFERENCES hakedisler(id),
  belge_no VARCHAR(50),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE banka_hesaplari (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  banka_adi VARCHAR(100) NOT NULL,
  sube VARCHAR(100),
  hesap_no VARCHAR(50),
  iban VARCHAR(34),
  aktif BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE banka_hareketleri (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  banka_hesap_id UUID NOT NULL REFERENCES banka_hesaplari(id),
  tarih DATE NOT NULL,
  tutar NUMERIC(14,2) NOT NULL,
  islem_tipi islem_tipi NOT NULL,
  aciklama TEXT,
  eslesen_cari_hareket_id UUID REFERENCES cari_hareketler(id),
  eslesti BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);
