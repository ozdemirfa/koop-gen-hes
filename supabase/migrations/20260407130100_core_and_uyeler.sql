-- Mevcut eski yapıları temizle (Çakışmayı önlemek için)
DROP VIEW IF EXISTS public.kasa_durumu CASCADE;

DROP TABLE IF EXISTS public.yillik_plan_kalemleri CASCADE;
DROP TABLE IF EXISTS public.yillik_harcama_planlari CASCADE;
DROP TABLE IF EXISTS public.proje_is_kalemleri CASCADE;
DROP TABLE IF EXISTS public.projeler CASCADE;
DROP TABLE IF EXISTS public.malzeme_teslimleri CASCADE;
DROP TABLE IF EXISTS public.banka_hareketleri CASCADE;
DROP TABLE IF EXISTS public.banka_hesaplari CASCADE;
DROP TABLE IF EXISTS public.cari_hareketler CASCADE;
DROP TABLE IF EXISTS public.odeme_planlari CASCADE;
DROP TABLE IF EXISTS public.faturalar CASCADE;
DROP TABLE IF EXISTS public.hakedis_kalemleri CASCADE;
DROP TABLE IF EXISTS public.hakedisler CASCADE;
DROP TABLE IF EXISTS public.sozlesme_is_kalemleri CASCADE;
DROP TABLE IF EXISTS public.sozlesmeler CASCADE;
DROP TABLE IF EXISTS public.firmalar CASCADE;
DROP TABLE IF EXISTS public.gelir_giderler CASCADE;
DROP TABLE IF EXISTS public.gelir_gider_kategorileri CASCADE;
DROP TABLE IF EXISTS public.aidat_odemeleri CASCADE;
DROP TABLE IF EXISTS public.aidatlar CASCADE;
DROP TABLE IF EXISTS public.aidat_tanimlari CASCADE;
DROP TABLE IF EXISTS public.uyeler CASCADE;
DROP TABLE IF EXISTS public.bloklar CASCADE;
DROP TABLE IF EXISTS public.giderler CASCADE;

DROP TYPE IF EXISTS uyelik_durumu CASCADE;
DROP TYPE IF EXISTS cinsiyet CASCADE;
DROP TYPE IF EXISTS aidat_durumu CASCADE;
DROP TYPE IF EXISTS odeme_yontemi CASCADE;
DROP TYPE IF EXISTS islem_tipi CASCADE;
DROP TYPE IF EXISTS firma_tipi CASCADE;
DROP TYPE IF EXISTS hakedis_durumu CASCADE;
DROP TYPE IF EXISTS fatura_tipi CASCADE;
DROP TYPE IF EXISTS fatura_durumu CASCADE;
DROP TYPE IF EXISTS cari_hareket_tipi CASCADE;
DROP TYPE IF EXISTS is_kalemi_durumu CASCADE;
DROP TYPE IF EXISTS is_kalemi_durumu CASCADE;

CREATE TYPE uyelik_durumu AS ENUM ('aktif', 'pasif', 'ihrac', 'istifa');
CREATE TYPE cinsiyet AS ENUM ('erkek', 'kadin');
CREATE TYPE aidat_durumu AS ENUM ('bekliyor', 'odendi', 'gecikti', 'iptal');
CREATE TYPE odeme_yontemi AS ENUM ('nakit', 'havale', 'eft', 'kredi_karti', 'diger');
CREATE TYPE islem_tipi AS ENUM ('gelir', 'gider');
CREATE TYPE firma_tipi AS ENUM ('yuklenici', 'tedarikci');
CREATE TYPE hakedis_durumu AS ENUM ('taslak', 'onaylandi', 'odendi', 'iptal');
CREATE TYPE fatura_tipi AS ENUM ('gelen', 'giden');
CREATE TYPE fatura_durumu AS ENUM ('bekliyor', 'odendi', 'kismi_odendi', 'iptal');
CREATE TYPE cari_hareket_tipi AS ENUM ('borc', 'alacak');
CREATE TYPE is_kalemi_durumu AS ENUM ('planli', 'devam_ediyor', 'tamamlandi', 'iptal');

CREATE TABLE bloklar (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blok_adi VARCHAR(50) NOT NULL,
  toplam_daire INTEGER NOT NULL,
  aciklama TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE uyeler (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  uye_no VARCHAR(20) UNIQUE NOT NULL,
  tc_kimlik VARCHAR(11) UNIQUE,
  ad VARCHAR(100) NOT NULL,
  soyad VARCHAR(100) NOT NULL,
  cinsiyet cinsiyet,
  telefon VARCHAR(20),
  email VARCHAR(255),
  adres TEXT,
  blok_id UUID REFERENCES bloklar(id),
  daire_no VARCHAR(10),
  hisse_orani NUMERIC(5,2) DEFAULT 1.00,
  uyelik_tarihi DATE NOT NULL DEFAULT CURRENT_DATE,
  durum uyelik_durumu DEFAULT 'aktif',
  notlar TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX idx_uyeler_blok_daire ON uyeler(blok_id, daire_no) WHERE durum = 'aktif';
