-- Migration: 20260531140000_cari_islem_turu_yonetim_banka.sql
-- Sprint: para-hareketleri-yonetim (2026-05-31)
-- Description: Yönetim BANKA ödemelerini de cari_hareketler'e (bağlı satır) yazıp
--   "para hareketleri"nde göstermek ve bankada "Eşleşti" yapmak için iki yeni
--   islem_turu: 'yonetim_odeme_banka_giris' / 'yonetim_odeme_banka_cikis'.
--   (Nakit yönetim tipleri 20260530000005 ile zaten eklendi.)
-- Desen: 20260530000005 (DROP + ADD, mevcut tüm değerler korunur).

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cari_hareketler_islem_turu_check') THEN
    ALTER TABLE public.cari_hareketler DROP CONSTRAINT cari_hareketler_islem_turu_check;
  END IF;
END $$;

ALTER TABLE public.cari_hareketler ADD CONSTRAINT cari_hareketler_islem_turu_check
CHECK (islem_turu IN (
  'aidat_kayit', 'hakedis', 'gelen_odeme', 'giden_odeme',
  'gecikme_faizi', 'fatura', 'iade_odeme', 'uyelik_baslangic',
  'virman_nakit_giris', 'virman_nakit_cikis',
  'yonetim_odeme_nakit_giris', 'yonetim_odeme_nakit_cikis',
  'yonetim_odeme_banka_giris', 'yonetim_odeme_banka_cikis'
));

COMMENT ON CONSTRAINT cari_hareketler_islem_turu_check ON public.cari_hareketler IS
  'Cari hareket tipleri + yonetim_odeme_banka_giris/cikis (yönetim banka ödemesinin '
  'cari_hesap_id=NULL görünürlük satırı; banka_hareketleri''ne banka_hareket_id ile bağlanır, '
  'odeme_turu=banka olduğundan kasa_nakit''i etkilemez).';
