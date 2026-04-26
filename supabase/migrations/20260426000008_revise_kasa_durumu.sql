-- Migration: 20260426000006_revise_kasa_durumu.sql
-- Description: Kasa durumunu cari_hareketler tablosundan nakit ödemelere göre revize et.

DROP VIEW IF EXISTS public.kasa_durumu;

CREATE OR REPLACE VIEW public.kasa_durumu AS
SELECT
  COALESCE(SUM(borc), 0) AS borc,
  COALESCE(SUM(alacak), 0) AS alacak
FROM public.cari_hareketler
WHERE odeme_turu = 'nakit';
