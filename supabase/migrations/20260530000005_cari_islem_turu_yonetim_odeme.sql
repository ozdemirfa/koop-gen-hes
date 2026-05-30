-- Migration: 20260530000005_cari_islem_turu_yonetim_odeme.sql
-- Sprint: yonetim-ekibi (2026-05-30) — M3
-- Description: cari_hareketler.islem_turu CHECK constraint'e yönetim ödemesi
--   nakit hareket tiplerini ekler (virman deseniyle aynı — cari_hesap_id=NULL):
--   - 'yonetim_odeme_nakit_cikis' : yönetim carisine giden_odeme (nakit) — kasa azalır
--   - 'yonetim_odeme_nakit_giris' : yönetim carisinden gelen_odeme (nakit) — kasa artar
--   Bu satırlar cari_hesap_id=NULL ile yazılır; fn_dashboard_ozet kasa_nakit LEFT JOIN
--   ile yakalar (kasa etkilenir) AMA gelir/gider/tahsilat/odeme metrikleri
--   cari_turu IN ('uye','firma') filtresiyle bunları dışlar (gelir/gider'e yazılmaz).
-- Desen: 20260524000001_cari_islem_turu_virman.sql (mevcut tüm değerler korunur).

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
  'yonetim_odeme_nakit_giris', 'yonetim_odeme_nakit_cikis'
));

COMMENT ON CONSTRAINT cari_hareketler_islem_turu_check ON public.cari_hareketler IS
  'Cari hareket tipleri: aidat_kayit, hakedis, gelen_odeme, giden_odeme, gecikme_faizi, '
  'fatura, iade_odeme, uyelik_baslangic, virman_nakit_giris/cikis, '
  'yonetim_odeme_nakit_giris (yönetim carisinden tahsilat → kasa artar), '
  'yonetim_odeme_nakit_cikis (yönetim carisine ödeme → kasa azalır). '
  'Yönetim satırları cari_hesap_id=NULL; kasa''yı etkiler, gelir/gider''e yazılmaz.';
