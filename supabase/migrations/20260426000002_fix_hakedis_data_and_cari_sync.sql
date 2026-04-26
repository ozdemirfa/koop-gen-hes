-- Migration: 20260426000002_fix_hakedis_data_and_cari_sync.sql
-- Description: Backfill hakedis totals and synchronize cari_hareketler.

BEGIN;

-- 1. Recalculate and update hakedisler table
-- We calculate ara_toplam and kdv_tutar from hakedis_kalemleri
-- Then we calculate hakedis_toplam, teminat_kesintisi, stopaj_kesintisi, and net_tutar
-- Based on the contract's rates.

WITH hakedis_totals AS (
  SELECT 
    h.id,
    COALESCE(SUM(hk.bu_ay_miktar * hk.birim_fiyat), 0) as calc_ara_toplam,
    COALESCE(SUM(hk.bu_ay_miktar * hk.birim_fiyat * (COALESCE(hk.kdv_orani, 20) / 100.0)), 0) as calc_kdv_tutar,
    s.teminat_orani,
    s.stopaj_orani,
    h.diger_kesintiler
  FROM public.hakedisler h
  JOIN public.sozlesmeler s ON h.sozlesme_id = s.id
  LEFT JOIN public.hakedis_kalemleri hk ON h.id = hk.hakedis_id
  GROUP BY h.id, s.teminat_orani, s.stopaj_orani, h.diger_kesintiler
)
UPDATE public.hakedisler h
SET 
  ara_toplam = t.calc_ara_toplam,
  kdv_tutar = t.calc_kdv_tutar,
  hakedis_toplam = t.calc_ara_toplam + t.calc_kdv_tutar,
  teminat_kesintisi = t.calc_ara_toplam * (COALESCE(t.teminat_orani, 0) / 100.0),
  stopaj_kesintisi = t.calc_ara_toplam * (COALESCE(t.stopaj_orani, 0) / 100.0),
  net_tutar = (t.calc_ara_toplam + t.calc_kdv_tutar) - (t.calc_ara_toplam * (COALESCE(t.teminat_orani, 0) / 100.0)) - (t.calc_ara_toplam * (COALESCE(t.stopaj_orani, 0) / 100.0)) - COALESCE(h.diger_kesintiler, 0)
FROM hakedis_totals t
WHERE h.id = t.id;

-- 2. Synchronize cari_hareketler for hakedis transactions
-- Only for 'onaylandi' or 'odendi' hakedisler as per standard logic
UPDATE public.cari_hareketler ch
SET borc = h.hakedis_toplam, alacak = 0
FROM public.hakedisler h
WHERE ch.kaynak_tipi = 'hakedis' 
  AND ch.kaynak_id = h.id 
  AND h.durum IN ('onaylandi', 'odendi');

-- 3. Ensure all giden_odeme/odeme follow Project Perspective (ALACAK = tutar, BORC = 0)
UPDATE public.cari_hareketler
SET alacak = alacak + borc, borc = 0
WHERE islem_turu IN ('giden_odeme', 'odeme') AND borc > 0;

-- 4. Ensure all fatura follow Project Perspective (BORC = tutar, ALACAK = 0)
UPDATE public.cari_hareketler
SET borc = borc + alacak, alacak = 0
WHERE islem_turu = 'fatura' AND alacak > 0;

COMMIT;
