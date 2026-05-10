-- Migration: 20260510000014_yillik_plan_adet_birim_fiyat.sql
-- Description: yillik_plan_kalemleri tablosuna planlanan_adet ve planlanan_birim_fiyat
-- kolonlarını ekle. Yıllık plan UI'ında bütçe iki yöntemle girilebilecek:
--   1. Direkt TL girişi (mevcut planlanan_tutar)
--   2. Adet × birim fiyat girişi → server-side hesaplanıp planlanan_tutar'a yazılır
-- NULL allowed; mevcut satırlarda etki yok, backfill gerekmez.

ALTER TABLE public.yillik_plan_kalemleri
  ADD COLUMN IF NOT EXISTS planlanan_adet NUMERIC(14,3),
  ADD COLUMN IF NOT EXISTS planlanan_birim_fiyat NUMERIC(14,2);
