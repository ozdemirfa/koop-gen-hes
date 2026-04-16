-- 20260416000001_project_workspace_and_contract_fixes.sql

-- 1. Workspace (Proje) bazlı izolasyon için eksik proje_id kolonlarını ekle
DO $$
BEGIN
    -- bloklar
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bloklar' AND column_name = 'proje_id') THEN
        ALTER TABLE bloklar ADD COLUMN proje_id UUID REFERENCES projeler(id) ON DELETE CASCADE;
    END IF;

    -- uyeler
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'uyeler' AND column_name = 'proje_id') THEN
        ALTER TABLE uyeler ADD COLUMN proje_id UUID REFERENCES projeler(id) ON DELETE CASCADE;
    END IF;

    -- firmalar
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'firmalar' AND column_name = 'proje_id') THEN
        ALTER TABLE firmalar ADD COLUMN proje_id UUID REFERENCES projeler(id) ON DELETE CASCADE;
    END IF;

    -- sozlesmeler
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sozlesmeler' AND column_name = 'proje_id') THEN
        ALTER TABLE sozlesmeler ADD COLUMN proje_id UUID REFERENCES projeler(id) ON DELETE CASCADE;
    END IF;

    -- hakedisler
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'hakedisler' AND column_name = 'proje_id') THEN
        ALTER TABLE hakedisler ADD COLUMN proje_id UUID REFERENCES projeler(id) ON DELETE CASCADE;
    END IF;

    -- aidat_tanimlari
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'aidat_tanimlari' AND column_name = 'proje_id') THEN
        ALTER TABLE aidat_tanimlari ADD COLUMN proje_id UUID REFERENCES projeler(id) ON DELETE CASCADE;
    END IF;

    -- aidatlar
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'aidatlar' AND column_name = 'proje_id') THEN
        ALTER TABLE aidatlar ADD COLUMN proje_id UUID REFERENCES projeler(id) ON DELETE CASCADE;
    END IF;

    -- gelir_gider_kategorileri
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'gelir_gider_kategorileri' AND column_name = 'proje_id') THEN
        ALTER TABLE gelir_gider_kategorileri ADD COLUMN proje_id UUID REFERENCES projeler(id) ON DELETE CASCADE;
    END IF;

    -- banka_hesaplari
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'banka_hesaplari' AND column_name = 'proje_id') THEN
        ALTER TABLE banka_hesaplari ADD COLUMN proje_id UUID REFERENCES projeler(id) ON DELETE CASCADE;
    END IF;

    -- banka_hareketleri
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'banka_hareketleri' AND column_name = 'proje_id') THEN
        ALTER TABLE banka_hareketleri ADD COLUMN proje_id UUID REFERENCES projeler(id) ON DELETE CASCADE;
    END IF;
END $$;

-- 2. Mevcut verileri ilk projeye bağla (Eğer proje varsa)
DO $$
DECLARE
    first_project_id UUID;
BEGIN
    SELECT id INTO first_project_id FROM projeler ORDER BY created_at LIMIT 1;
    
    IF first_project_id IS NOT NULL THEN
        UPDATE bloklar SET proje_id = first_project_id WHERE proje_id IS NULL;
        UPDATE uyeler SET proje_id = first_project_id WHERE proje_id IS NULL;
        UPDATE firmalar SET proje_id = first_project_id WHERE proje_id IS NULL;
        UPDATE sozlesmeler SET proje_id = first_project_id WHERE proje_id IS NULL;
        UPDATE hakedisler SET proje_id = first_project_id WHERE proje_id IS NULL;
        UPDATE aidat_tanimlari SET proje_id = first_project_id WHERE proje_id IS NULL;
        UPDATE aidatlar SET proje_id = first_project_id WHERE proje_id IS NULL;
        UPDATE gelir_gider_kategorileri SET proje_id = first_project_id WHERE proje_id IS NULL;
        UPDATE banka_hesaplari SET proje_id = first_project_id WHERE proje_id IS NULL;
        UPDATE banka_hareketleri SET proje_id = first_project_id WHERE proje_id IS NULL;
    END IF;
END $$;

-- 3. Sözleşme İş Kalemleri için Gider Kategori desteği
ALTER TABLE sozlesme_is_kalemleri ADD COLUMN IF NOT EXISTS kategori_id UUID REFERENCES gelir_gider_kategorileri(id);

-- 4. Şerefiye Tablosu Revizyonu
-- DaireKod kolonu ekle
ALTER TABLE serefiye_tablosu ADD COLUMN IF NOT EXISTS daire_kod VARCHAR(50);

-- Daire kodunu otomatik üret (Blok + Daire No)
CREATE OR REPLACE FUNCTION generate_daire_kod()
RETURNS TRIGGER AS $$
BEGIN
  -- bloklar tablosundan blok_adi'nı al
  SELECT blok_adi INTO NEW.daire_kod 
  FROM bloklar WHERE id = NEW.blok_id;
  
  NEW.daire_kod := NEW.daire_kod || '-' || NEW.daire_no;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_generate_daire_kod ON serefiye_tablosu;
CREATE TRIGGER trg_generate_daire_kod
BEFORE INSERT OR UPDATE OF blok_id, daire_no ON serefiye_tablosu
FOR EACH ROW
EXECUTE FUNCTION generate_daire_kod();

-- 5. Banka Hesabı Aktif/Pasif
ALTER TABLE banka_hesaplari ADD COLUMN IF NOT EXISTS aktif BOOLEAN DEFAULT true;

-- 6. Sözleşme Silme Kısıtlaması (Trigger ile)
CREATE OR REPLACE FUNCTION check_sozlesme_deletion()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM hakedisler WHERE sozlesme_id = OLD.id) THEN
    RAISE EXCEPTION 'Bu sözleşmeye ait hakediş kayıtları bulunduğu için silinemez.';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_check_sozlesme_deletion ON sozlesmeler;
CREATE TRIGGER trg_check_sozlesme_deletion
BEFORE DELETE ON sozlesmeler
FOR EACH ROW
EXECUTE FUNCTION check_sozlesme_deletion();
