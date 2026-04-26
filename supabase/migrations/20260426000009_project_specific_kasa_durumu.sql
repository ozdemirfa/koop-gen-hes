-- Migration: 20260426000009_project_specific_kasa_durumu.sql
-- Description: Kasa durumunu proje bazlı hale getir ve borc-alacak sütunlarını ekle.

DROP VIEW IF EXISTS public.kasa_durumu;

CREATE OR REPLACE VIEW public.kasa_durumu AS
SELECT
  proje_id,
  COALESCE(SUM(borc), 0) AS toplam_borc,
  COALESCE(SUM(alacak), 0) AS toplam_alacak,
  (COALESCE(SUM(borc), 0) - COALESCE(SUM(alacak), 0)) AS net_bakiye
FROM public.cari_hareketler
WHERE odeme_turu = 'nakit'
GROUP BY proje_id;
