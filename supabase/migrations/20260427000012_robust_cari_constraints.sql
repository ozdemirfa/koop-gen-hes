-- Migration: 20260427000011_robust_cari_constraints.sql
-- Description: cari_hareketler tablosundaki islem_turu kısıtlamasını tüm olası tiplerle güncelle.

BEGIN;

-- 1. Eski kısıtlamayı kaldır
ALTER TABLE public.cari_hareketler DROP CONSTRAINT IF EXISTS cari_hareketler_islem_turu_check;

-- 2. Tüm sistemi kapsayan geniş kısıtlamayı ekle
ALTER TABLE public.cari_hareketler ADD CONSTRAINT cari_hareketler_islem_turu_check 
CHECK (islem_turu IN (
    'aidat_kayit', 
    'hakedis', 
    'gelen_odeme', 
    'giden_odeme', 
    'gecikme_faizi', 
    'fatura',
    'cek_odeme',
    'banka_transfer'
));

COMMIT;
