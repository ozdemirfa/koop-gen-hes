-- Migration: 20260424000010_backfill_aidat_cari_movements.sql
-- Description: Create missing cari_hareketler records for existing aidat charges.

BEGIN;

-- 1. Insert missing aidat accrual movements
INSERT INTO public.cari_hareketler (
    proje_id, 
    cari_hesap_id, 
    islem_turu, 
    tarih, 
    alacak, 
    borc, 
    kaynak_tipi, 
    kaynak_id, 
    aciklama
)
SELECT 
    a.proje_id,
    c.id,
    'aidat_kayit',
    COALESCE(a.created_at::DATE, CURRENT_DATE),
    (at.katsayi_tutari * COALESCE(s.serefiye_orani, 1.00)),
    0,
    'aidat',
    a.id,
    at.ay || '/' || at.yil || ' Aidat Tahakkuku'
FROM public.aidatlar a
JOIN public.aidat_tanimlari at ON a.aidat_tanimi_id = at.id
JOIN public.serefiye_tablosu s ON a.serefiye_id = s.id
JOIN public.cari_hesaplar c ON a.proje_id = c.proje_id AND a.uye_id = c.uye_id
WHERE a.uye_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.cari_hareketler ch 
    WHERE ch.kaynak_tipi = 'aidat' AND ch.kaynak_id = a.id
);

-- 2. Insert missing interest accrual movements (for ones already marked as yansitildi)
INSERT INTO public.cari_hareketler (
    proje_id, 
    cari_hesap_id, 
    islem_turu, 
    tarih, 
    alacak, 
    borc, 
    kaynak_tipi, 
    kaynak_id, 
    aciklama
)
SELECT 
    a.proje_id,
    c.id,
    'aidat_kayit',
    CURRENT_DATE,
    COALESCE(a.gecikme_faizi, 0),
    0,
    'gecikme_faizi',
    a.id,
    'Gecikme Faizi'
FROM public.aidatlar a
JOIN public.cari_hesaplar c ON a.proje_id = c.proje_id AND a.uye_id = c.uye_id
WHERE a.faiz_yansitildi = TRUE
  AND a.gecikme_faizi > 0
  AND NOT EXISTS (
    SELECT 1 FROM public.cari_hareketler ch 
    WHERE ch.kaynak_tipi = 'gecikme_faizi' AND ch.kaynak_id = a.id
);

COMMIT;
