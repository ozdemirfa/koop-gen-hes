-- Migration: 20260524000001_cari_islem_turu_virman.sql
-- Description: cari_hareketler.islem_turu CHECK constraint'e virman nakit hareketleri ekle.
--   - 'virman_nakit_giris' : banka_nakit virmanın nakit tarafı (borç, kasaya giriş)
--   - 'virman_nakit_cikis' : nakit_banka virmanın nakit tarafı (alacak, kasadan çıkış)
-- Bu satırlar cari_hesap_id=NULL ile yazılır (virmanın bir cari hesabı yoktur);
-- fn_dashboard_ozet kasa hesabı LEFT JOIN ile bu satırları yakalayacak (20260524000002).
-- Bkz: docs/spec — virman + ödeme bakiye kontrolü tasarımı.

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cari_hareketler_islem_turu_check') THEN
    ALTER TABLE public.cari_hareketler DROP CONSTRAINT cari_hareketler_islem_turu_check;
  END IF;
END $$;

ALTER TABLE public.cari_hareketler ADD CONSTRAINT cari_hareketler_islem_turu_check
CHECK (islem_turu IN (
  'aidat_kayit', 'hakedis', 'gelen_odeme', 'giden_odeme',
  'gecikme_faizi', 'fatura', 'iade_odeme', 'uyelik_baslangic',
  'virman_nakit_giris', 'virman_nakit_cikis'
));

COMMENT ON CONSTRAINT cari_hareketler_islem_turu_check ON public.cari_hareketler IS
  'Cari hareket tipleri: aidat_kayit, hakedis, gelen_odeme (tahsilat), giden_odeme, gecikme_faizi, fatura, iade_odeme, uyelik_baslangic, virman_nakit_giris (banka→nakit virman), virman_nakit_cikis (nakit→banka virman).';
