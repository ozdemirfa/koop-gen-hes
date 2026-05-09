-- Migration: 20260427000010_fix_cari_hareketler_fatura_constraint.sql
-- Description: cari_hareketler tablosundaki islem_turu kısıtlamasına eksik olan 'fatura' tipini geri ekle.

BEGIN;

-- 1. islem_turu kısıtlamasını güncelle (fatura eksikti, eklendi)
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cari_hareketler_islem_turu_check') THEN
        ALTER TABLE public.cari_hareketler DROP CONSTRAINT cari_hareketler_islem_turu_check;
    END IF;
END $$;

ALTER TABLE public.cari_hareketler ADD CONSTRAINT cari_hareketler_islem_turu_check 
CHECK (islem_turu IN ('aidat_kayit', 'hakedis', 'gelen_odeme', 'giden_odeme', 'gecikme_faizi', 'fatura'));

COMMIT;
