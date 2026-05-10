-- Migration: 20260510000013_devir_islem_turleri.sql
-- Description: Add 'iade_odeme' and 'uyelik_baslangic' to cari_hareketler.islem_turu CHECK constraint.
-- See spec: docs/superpowers/specs/2026-05-10-uyelik-devir-iade-baslangic-design.md

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cari_hareketler_islem_turu_check') THEN
        ALTER TABLE public.cari_hareketler DROP CONSTRAINT cari_hareketler_islem_turu_check;
    END IF;
END $$;

ALTER TABLE public.cari_hareketler ADD CONSTRAINT cari_hareketler_islem_turu_check
CHECK (islem_turu IN (
    'aidat_kayit', 'hakedis', 'gelen_odeme', 'giden_odeme',
    'gecikme_faizi', 'fatura', 'iade_odeme', 'uyelik_baslangic'
));

COMMENT ON CONSTRAINT cari_hareketler_islem_turu_check ON public.cari_hareketler IS
  'Cari hareket tipleri: aidat_kayit (aidat tahakkuk), hakedis, gelen_odeme (tahsilat), giden_odeme (genel ödeme), gecikme_faizi, fatura, iade_odeme (üye lehine üyelik bedeli iadesi), uyelik_baslangic (üyeye yazılan başlangıç bedeli alacağı — ilk kayıt veya daire devri).';
