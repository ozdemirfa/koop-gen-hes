-- =============================================================================
-- FİRMALAR TABLOSU + BAĞIMLI VERİ SİLME SCRIPT'İ
-- =============================================================================
-- ⚠️  UYARI: Bu script firmalara ait TÜM finansal veriyi siler.
--    Geri alınamaz. Production'da kullanmadan önce Supabase Dashboard'dan
--    backup al (Project Settings > Database > Backups > Manual backup).
--
-- KAPSAM:
--   - firmalar (ana tablo)
--   - cari_hesaplar (firma_id FK CASCADE)
--   - birikmis_teminatlar (firma_id FK CASCADE)
--   - sozlesmeler, sozlesme_is_kalemleri (RESTRICT — manuel sıra)
--   - hakedisler, hakedis_kalemleri (RESTRICT — manuel sıra)
--   - faturalar, fatura_kalemleri (RESTRICT — manuel sıra)
--   - irsaliyeler, irsaliye_kalemleri (RESTRICT — manuel sıra)
--   - cekler (firma_id NULLable RESTRICT — manuel sıra)
--   - cari_hareketler (cari_hesap_id CASCADE üzerinden, ama belge_no/banka
--     hareketleri için manuel temizlik)
--   - banka_hareketleri.firma_id (NULLable RESTRICT — null'a set edilir)
--
-- KULLANIM:
--   A) Supabase Studio > SQL Editor: bu dosyayı yapıştır + Run (tek seferde)
--   B) psql CLI: \i supabase/scripts/delete_firmalar_all.sql
--
-- TRANSACTION: Tüm silme tek BEGIN/COMMIT içinde — herhangi bir adım fail
-- olursa hepsi rollback. Güvenli geri dönüş garantili.
-- =============================================================================


-- ===========================================================================
-- ADIM 0 — AUDIT: Mevcut firma sayısı + bağımlı kayıt sayıları
-- (Önce sadece bu bloğu çalıştır, ne silineceğini gör)
-- ===========================================================================
SELECT 'firmalar' AS tablo, COUNT(*) AS kayit_sayisi FROM public.firmalar
UNION ALL SELECT 'cari_hesaplar (firma)', COUNT(*) FROM public.cari_hesaplar WHERE firma_id IS NOT NULL
UNION ALL SELECT 'cari_hareketler (firma cari üzerinden)', COUNT(*) FROM public.cari_hareketler ch
  WHERE EXISTS (SELECT 1 FROM public.cari_hesaplar c WHERE c.id = ch.cari_hesap_id AND c.firma_id IS NOT NULL)
UNION ALL SELECT 'sozlesmeler', COUNT(*) FROM public.sozlesmeler
UNION ALL SELECT 'sozlesme_is_kalemleri', COUNT(*) FROM public.sozlesme_is_kalemleri
UNION ALL SELECT 'hakedisler', COUNT(*) FROM public.hakedisler
UNION ALL SELECT 'hakedis_kalemleri', COUNT(*) FROM public.hakedis_kalemleri
UNION ALL SELECT 'faturalar', COUNT(*) FROM public.faturalar
UNION ALL SELECT 'fatura_kalemleri', COUNT(*) FROM public.fatura_kalemleri
UNION ALL SELECT 'irsaliyeler', COUNT(*) FROM public.irsaliyeler
UNION ALL SELECT 'irsaliye_kalemleri', COUNT(*) FROM public.irsaliye_kalemleri
UNION ALL SELECT 'cekler', COUNT(*) FROM public.cekler
UNION ALL SELECT 'birikmis_teminatlar', COUNT(*) FROM public.birikmis_teminatlar
UNION ALL SELECT 'banka_hareketleri (firma_id NOT NULL)', COUNT(*) FROM public.banka_hareketleri WHERE firma_id IS NOT NULL
ORDER BY tablo;


-- ===========================================================================
-- ADIM 1 — TRANSACTION İÇİNDE SİLME
-- AUDIT sonucu kabul edilirse aşağıdaki BEGIN...COMMIT bloğunu çalıştır.
-- ===========================================================================

BEGIN;

-- 1.1: banka_hareketleri.firma_id null'a set et (RESTRICT FK koruması)
--      Banka hareketinin kendisi proje/kasa kaydı; firma bağı kaldırılır.
UPDATE public.banka_hareketleri
SET firma_id = NULL
WHERE firma_id IS NOT NULL;

-- 1.2: çekler — firma_id nullable, ama içerik firmalara bağlı. Hepsini sil.
DELETE FROM public.cekler WHERE firma_id IS NOT NULL;

-- 1.3: irsaliye_kalemleri (irsaliyelerin child'ı, CASCADE değilse manuel sil)
DELETE FROM public.irsaliye_kalemleri
WHERE irsaliye_id IN (SELECT id FROM public.irsaliyeler WHERE firma_id IS NOT NULL);

-- 1.4: irsaliyeler
DELETE FROM public.irsaliyeler WHERE firma_id IS NOT NULL;

-- 1.5: fatura_kalemleri
DELETE FROM public.fatura_kalemleri
WHERE fatura_id IN (SELECT id FROM public.faturalar);

-- 1.6: faturalar (proje_id ile bağlı olabilir ama firma_id NOT NULL ise full delete)
DELETE FROM public.faturalar;

-- 1.7: hakedis_kalemleri
DELETE FROM public.hakedis_kalemleri
WHERE hakedis_id IN (SELECT id FROM public.hakedisler);

-- 1.8: hakedisler
DELETE FROM public.hakedisler;

-- 1.9: sozlesme_is_kalemleri
DELETE FROM public.sozlesme_is_kalemleri
WHERE sozlesme_id IN (SELECT id FROM public.sozlesmeler);

-- 1.10: sozlesmeler
DELETE FROM public.sozlesmeler;

-- 1.11: cari_hareketler — firma cari'ye bağlı olanlar (banka_hareket_id artık null)
DELETE FROM public.cari_hareketler ch
WHERE EXISTS (
  SELECT 1 FROM public.cari_hesaplar c
  WHERE c.id = ch.cari_hesap_id AND c.firma_id IS NOT NULL
);

-- 1.12: cari_hesaplar (firma cari'leri) — CASCADE ile birlikte zaten silinir
--       firmalar DELETE'inde, ama açık silmek log için iyi.
DELETE FROM public.cari_hesaplar WHERE firma_id IS NOT NULL;

-- 1.13: birikmis_teminatlar — firmalar CASCADE ile otomatik silinir, ama açık.
DELETE FROM public.birikmis_teminatlar;

-- 1.14: firmalar (ana tablo)
DELETE FROM public.firmalar;


-- ===========================================================================
-- ADIM 2 — DOĞRULAMA: Tüm tablolar boş mu?
-- COMMIT'ten önce kontrol; istemediğin sonuç gelirse ROLLBACK.
-- ===========================================================================
SELECT 'firmalar' AS tablo, COUNT(*) AS kalan FROM public.firmalar
UNION ALL SELECT 'cari_hesaplar (firma)', COUNT(*) FROM public.cari_hesaplar WHERE firma_id IS NOT NULL
UNION ALL SELECT 'sozlesmeler', COUNT(*) FROM public.sozlesmeler
UNION ALL SELECT 'hakedisler', COUNT(*) FROM public.hakedisler
UNION ALL SELECT 'faturalar', COUNT(*) FROM public.faturalar
UNION ALL SELECT 'irsaliyeler', COUNT(*) FROM public.irsaliyeler
UNION ALL SELECT 'cekler (firma)', COUNT(*) FROM public.cekler WHERE firma_id IS NOT NULL
UNION ALL SELECT 'birikmis_teminatlar', COUNT(*) FROM public.birikmis_teminatlar
UNION ALL SELECT 'banka_hareketleri (firma_id NOT NULL)', COUNT(*) FROM public.banka_hareketleri WHERE firma_id IS NOT NULL
ORDER BY tablo;


-- ===========================================================================
-- ADIM 3 — COMMIT veya ROLLBACK
-- ===========================================================================
-- Sonuç tamam ise:
COMMIT;

-- İstemediğin durumda transaction'ı geri al (yukarıdaki COMMIT yerine):
-- ROLLBACK;
