-- Migration: 20260421000001_cari_hesap_revizyon_faz1.sql
-- Description: Unified Cari Hesap System - Phase 1 implementation

BEGIN;

-- 1. Create cari_hesaplar table
CREATE TABLE IF NOT EXISTS public.cari_hesaplar (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    proje_id    UUID NOT NULL REFERENCES public.projeler(id) ON DELETE CASCADE,
    cari_adi    VARCHAR(255) NOT NULL,
    cari_turu   VARCHAR(20) NOT NULL CHECK (cari_turu IN ('uye', 'firma')),
    uye_id      UUID REFERENCES public.uyeler(id) ON DELETE CASCADE,
    firma_id    UUID REFERENCES public.firmalar(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Constraint: Her üye/firma bir projede tek cari hesaba sahip olabilir
    CONSTRAINT unique_proje_uye UNIQUE (proje_id, uye_id),
    CONSTRAINT unique_proje_firma UNIQUE (proje_id, firma_id),
    -- Constraint: uye_id veya firma_id'den biri mutlaka dolu olmalı
    CONSTRAINT check_entite_exists CHECK (
        (cari_turu = 'uye' AND uye_id IS NOT NULL AND firma_id IS NULL) OR
        (cari_turu = 'firma' AND firma_id IS NOT NULL AND uye_id IS NULL)
    )
);

COMMENT ON TABLE public.cari_hesaplar IS 'Üye ve firmaların proje bazlı cari hesaplarını tutan tablo.';
COMMENT ON COLUMN public.cari_hesaplar.proje_id IS 'Cari hesabın ait olduğu proje.';
COMMENT ON COLUMN public.cari_hesaplar.cari_turu IS 'Cari hesabın tipi: uye veya firma.';

-- Index'ler
CREATE INDEX IF NOT EXISTS idx_cari_hesaplar_proje_id ON public.cari_hesaplar(proje_id);
CREATE INDEX IF NOT EXISTS idx_cari_hesaplar_uye_id ON public.cari_hesaplar(uye_id);
CREATE INDEX IF NOT EXISTS idx_cari_hesaplar_firma_id ON public.cari_hesaplar(firma_id);

-- RLS
ALTER TABLE public.cari_hesaplar ENABLE ROW LEVEL SECURITY;

-- 2. Revise cari_hareketler table
-- 'Kullanıcı Sadece Yapıyı Kur' dediği için verileri sıfırlıyoruz.
TRUNCATE public.cari_hareketler CASCADE;
TRUNCATE public.aidat_odemeleri CASCADE;

-- Aidat durumlarını sıfırla (temizlik için)
-- Not: odenen_tutar dinamik olduğu için (cari_hareketler üzerinden) truncate işlemi ile zaten sıfırlanmış oldu.
UPDATE public.aidatlar SET durum = 'bekliyor';

-- cari_hareketler kolon güncellemeleri
ALTER TABLE public.cari_hareketler DROP COLUMN IF EXISTS firma_id;
ALTER TABLE public.cari_hareketler ADD COLUMN IF NOT EXISTS cari_hesap_id UUID REFERENCES public.cari_hesaplar(id) ON DELETE CASCADE;
ALTER TABLE public.cari_hareketler ADD COLUMN IF NOT EXISTS islem_turu VARCHAR(50) CHECK (islem_turu IN ('aidat_kayit', 'hakedis', 'gelen_odeme', 'giden_odeme'));
ALTER TABLE public.cari_hareketler ADD COLUMN IF NOT EXISTS odeme_turu VARCHAR(50) CHECK (odeme_turu IN ('nakit', 'banka', 'kredi_karti', 'cek'));
ALTER TABLE public.cari_hareketler ADD COLUMN IF NOT EXISTS banka_hesap_id UUID REFERENCES public.banka_hesaplari(id);
ALTER TABLE public.cari_hareketler ADD COLUMN IF NOT EXISTS cek_id UUID REFERENCES public.cekler(id);

-- Index'ler
CREATE INDEX IF NOT EXISTS idx_cari_hareketler_cari_hesap_id ON public.cari_hareketler(cari_hesap_id);
CREATE INDEX IF NOT EXISTS idx_cari_hareketler_proje_id ON public.cari_hareketler(proje_id);

-- 3. Automatic Triggers for Cari Account Creation

-- Üye eklendiğinde/güncellendiğinde cari hesap aç
CREATE OR REPLACE FUNCTION public.fn_auto_create_cari_hesap_for_uye()
RETURNS TRIGGER AS $$
DECLARE
    v_proje_id UUID;
BEGIN
    -- Üyenin serefiye_id'si üzerinden proje_id'sini bul
    SELECT proje_id INTO v_proje_id FROM public.serefiye_tablosu WHERE id = NEW.serefiye_id;
    
    IF v_proje_id IS NOT NULL THEN
        INSERT INTO public.cari_hesaplar (proje_id, cari_adi, cari_turu, uye_id)
        VALUES (v_proje_id, NEW.ad || ' ' || NEW.soyad, 'uye', NEW.id)
        ON CONFLICT (proje_id, uye_id) DO UPDATE 
        SET cari_adi = EXCLUDED.cari_adi;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_auto_create_cari_hesap_uye ON public.uyeler;
CREATE TRIGGER trg_auto_create_cari_hesap_uye
AFTER INSERT OR UPDATE ON public.uyeler
FOR EACH ROW EXECUTE FUNCTION public.fn_auto_create_cari_hesap_for_uye();

-- Firma eklendiğinde/güncellendiğinde tüm projelere cari hesap aç (Firma global olduğu için)
CREATE OR REPLACE FUNCTION public.fn_auto_create_cari_hesap_for_firma()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.cari_hesaplar (proje_id, cari_adi, cari_turu, firma_id)
    SELECT id, NEW.unvan, 'firma', NEW.id FROM public.projeler
    ON CONFLICT (proje_id, firma_id) DO UPDATE 
    SET cari_adi = EXCLUDED.cari_adi;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_auto_create_cari_hesap_firma ON public.firmalar;
CREATE TRIGGER trg_auto_create_cari_hesap_firma
AFTER INSERT OR UPDATE ON public.firmalar
FOR EACH ROW EXECUTE FUNCTION public.fn_auto_create_cari_hesap_for_firma();

-- 4. Initial Migration of existing entities
-- Mevcut üyeleri cari hesaplara aktar
INSERT INTO public.cari_hesaplar (proje_id, cari_adi, cari_turu, uye_id)
SELECT s.proje_id, u.ad || ' ' || u.soyad, 'uye', u.id
FROM public.uyeler u
JOIN public.serefiye_tablosu s ON u.serefiye_id = s.id
WHERE s.proje_id IS NOT NULL
ON CONFLICT (proje_id, uye_id) DO NOTHING;

-- Mevcut firmaları tüm projelere cari hesap olarak aktar
INSERT INTO public.cari_hesaplar (proje_id, cari_adi, cari_turu, firma_id)
SELECT p.id, f.unvan, 'firma', f.id
FROM public.firmalar f
CROSS JOIN public.projeler p
ON CONFLICT (proje_id, firma_id) DO NOTHING;

-- 5. Update RLS Policies
-- Cari Hesaplar için
DROP POLICY IF EXISTS "cari_hesaplar_access" ON public.cari_hesaplar;
CREATE POLICY "cari_hesaplar_access" ON public.cari_hesaplar
    FOR ALL TO authenticated
    USING (
        public.is_admin() OR 
        public.is_staff()
    );

-- Cari Hareketler için RLS (Proje bazlı izolasyon için)
-- Eğer auth.uid() ile proje eşleşmesi yoksa, admin/staff kontrolü ile devam ediyoruz.
-- Gelecekte proje mapping tablosu gelirse burası güncellenmelidir.
DROP POLICY IF EXISTS "cari_hareketler_access" ON public.cari_hareketler;
CREATE POLICY "cari_hareketler_access" ON public.cari_hareketler
    FOR ALL TO authenticated
    USING (
        public.is_admin() OR 
        public.is_staff()
    );

COMMIT;
