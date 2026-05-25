-- Audit (read-only): uyelik_baslangic cari_hareketleri ve dogru uye eslesmesi
-- Sprint revizyon-bugfix-paketi B4 (2026-05-25, madde 6)
--
-- Kullanim:
--   A) Supabase Studio > SQL Editor: tum dosyayi yapistir + Run.
--      Cikti panelinde 5 ayri "Results" tab'i acilir; sira asagidaki
--      basliklarla eslesir.
--   B) psql CLI (DATABASE_URL ile): bu dosya saf SQL (\echo meta-komutu
--      kullanmaz); psql'de de tek seferde calisir.
--
-- Kullanici sikayeti: "Para Hareketleri'nde tum baslangic bedelleri ilk uyede
-- gorunuyor; halbuki uye detaylarinda dogru uyede gorunuyor." Bu sorgu:
--   1. Her uyelik_baslangic cari_hareketinin bagli oldugu cari_hesap_id'yi listeler
--   2. cari_hesap_id -> uye_id mapping'inin dogru olup olmadigini gosterir
--   3. NULL cari_hesap_id veya tekrar eden cari_hesap_id paterni tespit eder
--   4. cari_hesaplar.uye_id NULL olan orphan kayitlari bulur
--   5. Bir uyeye bagli birden fazla cari_hesap (duplicate) varsa raporlar
--
-- Eger Para Hareketleri sayfasinda gercekten tum baslangic bedelleri ayni
-- cari_adi'nda gorunuyorsa, sorgu #2'de bunun veri tabaninda gercek mi
-- yoksa sadece UI rendering bug mi oldugu netlesir.


-- =========================================================================
-- #1. uyelik_baslangic cari hareketleri (son 50)
-- =========================================================================
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


-- =========================================================================
-- #2. uyelik_baslangic per cari_hesap_id (kac farkli hesap kullanildi?)
--     Eger tek satir donerse: tum baslangic kayitlari ayni hesaba yazilmis (bug).
--     Birden cok satir donerse: dagilim normal, sorun UI tarafinda.
-- =========================================================================
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


-- =========================================================================
-- #3. NULL cari_hesap_id sahip uyelik_baslangic kayitlari (bug indikatoru)
--     Bos satir donerse: tum kayitlar bir cari_hesap'a baglanmis (iyi).
--     Satir donerse: orphan tahakkuklar var, veri onarimi gerek.
-- =========================================================================
SELECT
    ch.id,
    ch.tarih,
    ch.alacak,
    ch.aciklama,
    ch.kaynak_id
FROM public.cari_hareketler ch
WHERE ch.islem_turu = 'uyelik_baslangic'
  AND ch.cari_hesap_id IS NULL;


-- =========================================================================
-- #4. cari_hesaplar.uye_id NULL olan uye carileri (orphan)
--     cari_turu='uye' olmasina ragmen uye_id eksikse: data corruption.
-- =========================================================================
SELECT
    c.id AS cari_hesap_id,
    c.cari_adi,
    c.cari_turu,
    c.uye_id,
    c.firma_id,
    c.proje_id
FROM public.cari_hesaplar c
WHERE c.cari_turu = 'uye' AND c.uye_id IS NULL;


-- =========================================================================
-- #5. Bir uyenin birden fazla cari_hesap_id varsa (duplicate, beklenmedik)
--     COUNT>1 satirlari: muhtemelen FIFO/birlesik kapama yanlis cari'ye gitmis.
-- =========================================================================
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
