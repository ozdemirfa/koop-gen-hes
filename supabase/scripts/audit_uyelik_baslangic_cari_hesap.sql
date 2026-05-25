-- Audit (read-only): uyelik_baslangic cari_hareketleri ve dogru uye eslesmesi
-- Sprint revizyon-bugfix-paketi B4 (2026-05-25, madde 6)
--
-- Kullanim:
--   psql $DATABASE_URL -f supabase/scripts/audit_uyelik_baslangic_cari_hesap.sql
--
-- Kullanici sikayeti: "Para Hareketleri'nde tum baslangic bedelleri ilk uyede
-- gorunuyor; halbuki uye detaylarinda dogru uyede gorunuyor." Bu sorgu:
--   1. Her uyelik_baslangic cari_hareketinin bagli oldugu cari_hesap_id'yi listeler
--   2. cari_hesap_id->uye_id mapping'inin doğru olup olmadığını gosterir
--   3. NULL cari_hesap_id veya tekrar eden cari_hesap_id paterni tespit eder
--
-- Eger Para Hareketleri sayfasinda gercekten tum baslangic bedelleri ayni
-- cari_adi'nda gorunuyorsa, bu sorgu kac ayri cari_hesap_id oldugunu doğrular.

\echo '=== uyelik_baslangic cari hareketleri (son 50) ==='
SELECT
    ch.id AS hareket_id,
    ch.tarih,
    ch.alacak,
    ch.borc,
    ch.cari_hesap_id,
    ch.proje_id,
    ch.kaynak_tipi,
    ch.kaynak_id,
    c.cari_adi,
    c.uye_id,
    u.uye_no,
    u.ad || ' ' || u.soyad AS uye_adi
FROM public.cari_hareketler ch
LEFT JOIN public.cari_hesaplar c ON ch.cari_hesap_id = c.id
LEFT JOIN public.uyeler u ON c.uye_id = u.id
WHERE ch.islem_turu = 'uyelik_baslangic'
ORDER BY ch.tarih DESC, ch.id DESC
LIMIT 50;

\echo ''
\echo '=== uyelik_baslangic per cari_hesap_id (kac farkli hesap?) ==='
SELECT
    ch.cari_hesap_id,
    c.cari_adi,
    u.uye_no,
    u.ad || ' ' || u.soyad AS uye_adi,
    COUNT(*) AS kayit_sayisi,
    SUM(ch.alacak) AS toplam_alacak_tahakkuk,
    SUM(ch.borc) AS toplam_borc_tahsilat
FROM public.cari_hareketler ch
LEFT JOIN public.cari_hesaplar c ON ch.cari_hesap_id = c.id
LEFT JOIN public.uyeler u ON c.uye_id = u.id
WHERE ch.islem_turu = 'uyelik_baslangic'
GROUP BY ch.cari_hesap_id, c.cari_adi, u.uye_no, u.ad, u.soyad
ORDER BY u.uye_no NULLS LAST;

\echo ''
\echo '=== NULL cari_hesap_id sahip uyelik_baslangic kayitlari (bug indikatoru) ==='
SELECT
    ch.id,
    ch.tarih,
    ch.alacak,
    ch.aciklama,
    ch.kaynak_id
FROM public.cari_hareketler ch
WHERE ch.islem_turu = 'uyelik_baslangic'
  AND ch.cari_hesap_id IS NULL;

\echo ''
\echo '=== cari_hesaplar.uye_id NULL olan uye carileri (orphan) ==='
SELECT
    c.id AS cari_hesap_id,
    c.cari_adi,
    c.cari_turu,
    c.uye_id,
    c.firma_id,
    c.proje_id
FROM public.cari_hesaplar c
WHERE c.cari_turu = 'uye' AND c.uye_id IS NULL;

\echo ''
\echo '=== Bir uyenin birden fazla cari_hesap_id varsa (duplicate, beklenmedik) ==='
SELECT
    c.uye_id,
    u.uye_no,
    u.ad || ' ' || u.soyad AS uye_adi,
    COUNT(*) AS cari_hesap_sayisi,
    array_agg(c.id) AS cari_hesap_idleri
FROM public.cari_hesaplar c
LEFT JOIN public.uyeler u ON c.uye_id = u.id
WHERE c.cari_turu = 'uye'
GROUP BY c.uye_id, u.uye_no, u.ad, u.soyad
HAVING COUNT(*) > 1;
