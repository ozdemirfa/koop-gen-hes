-- Migration: 20260418000002_banka_cari_entegrasyonu.sql
-- Step 2: Use new enum values in table definitions

-- 2. banka_hareketleri tablosuna firma_id ve odeme_yontemi ekle
ALTER TABLE banka_hareketleri ADD COLUMN IF NOT EXISTS firma_id UUID REFERENCES firmalar(id);
ALTER TABLE banka_hareketleri ADD COLUMN IF NOT EXISTS odeme_yontemi odeme_yontemi DEFAULT 'banka';

-- 3. cari_hareketler tablosuna odeme_yontemi ve banka_hareket_id ekle
ALTER TABLE cari_hareketler ADD COLUMN IF NOT EXISTS odeme_yontemi odeme_yontemi DEFAULT 'banka';
ALTER TABLE cari_hareketler ADD COLUMN IF NOT EXISTS banka_hareket_id UUID REFERENCES banka_hareketleri(id) ON DELETE CASCADE;
