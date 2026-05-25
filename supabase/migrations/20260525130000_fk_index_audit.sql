-- Sprint qa-review-bugfix-faz3 (2026-05-25, Batch 4 — Perf)
-- ============================================================================
-- FK index audit
-- ----------------------------------------------------------------------------
-- Mevcut sequential scan riski olan FK kolonları icin index ekleme.
-- Buyuk tablo birlestirme + filtre sorgularinda WHERE/JOIN col'larinda
-- index olmadiginda Postgres seqscan'e duser; B-tree index ile O(log n).
-- Tum index'ler IF NOT EXISTS — idempotent; CONCURRENTLY kullanilmadi
-- cunku Supabase migration runner tek transaction'da calistirir (CONCURRENTLY
-- transaction icinde yasak). Tablolar kucuk-orta scale; lock kabul edilebilir.
--
-- Doc: docs/performance.md "FK index discovery" bolumu.
-- ============================================================================

-- cari_hareketler.banka_hareket_id — banka eslesme silme sorgusu sik
CREATE INDEX IF NOT EXISTS idx_cari_hareketler_banka_hareket_id
  ON public.cari_hareketler(banka_hareket_id)
  WHERE banka_hareket_id IS NOT NULL;

-- hakedisler.sozlesme_id — sozlesme detay sayfasinda hakedis listesi
CREATE INDEX IF NOT EXISTS idx_hakedisler_sozlesme_id
  ON public.hakedisler(sozlesme_id);

-- hakedisler.proje_id — proje-bazli liste + RLS
CREATE INDEX IF NOT EXISTS idx_hakedisler_proje_id
  ON public.hakedisler(proje_id);

-- hakedis_kalemleri.hakedis_id — detay select join, FK lookup
CREATE INDEX IF NOT EXISTS idx_hakedis_kalemleri_hakedis_id
  ON public.hakedis_kalemleri(hakedis_id);

-- irsaliyeler.hakedis_id — hakedis detay + filter
CREATE INDEX IF NOT EXISTS idx_irsaliyeler_hakedis_id
  ON public.irsaliyeler(hakedis_id)
  WHERE hakedis_id IS NOT NULL;

-- irsaliyeler.proje_id — proje-bazli liste
CREATE INDEX IF NOT EXISTS idx_irsaliyeler_proje_id
  ON public.irsaliyeler(proje_id);

-- irsaliye_kalemleri.irsaliye_id — irsaliye detay join
CREATE INDEX IF NOT EXISTS idx_irsaliye_kalemleri_irsaliye_id
  ON public.irsaliye_kalemleri(irsaliye_id);

-- aidatlar.proje_id — proje-bazli aidat sorgusu
CREATE INDEX IF NOT EXISTS idx_aidatlar_proje_id
  ON public.aidatlar(proje_id);

-- aidat_odemeleri.aidat_id — odeme listesi + FIFO match
-- 2026-05-25 hotfix: aidat_odemeleri tablosu production'da mevcut olmayabilir
-- (FIFO match patterni cari_hareketler.kaynak_id ile birlestirilmis olabilir).
-- DO block ile tablo var ise index ekle, yoksa atla.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'aidat_odemeleri'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_aidat_odemeleri_aidat_id
      ON public.aidat_odemeleri(aidat_id);
  END IF;
END$$;

-- proje_uyelikleri.user_id — requireProjectAccess middleware'in icindeki sorgu
CREATE INDEX IF NOT EXISTS idx_proje_uyelikleri_user_id
  ON public.proje_uyelikleri(user_id);

-- fatura_kalemleri.fatura_id — fatura detay join
CREATE INDEX IF NOT EXISTS idx_fatura_kalemleri_fatura_id
  ON public.fatura_kalemleri(fatura_id);

-- faturalar.proje_id — proje-bazli liste
CREATE INDEX IF NOT EXISTS idx_faturalar_proje_id
  ON public.faturalar(proje_id);

-- cekler.firma_id — firma cek listesi
CREATE INDEX IF NOT EXISTS idx_cekler_firma_id
  ON public.cekler(firma_id)
  WHERE firma_id IS NOT NULL;

-- cekler.proje_id — proje-bazli cek listesi
CREATE INDEX IF NOT EXISTS idx_cekler_proje_id
  ON public.cekler(proje_id)
  WHERE proje_id IS NOT NULL;

-- sozlesmeler.firma_id — firma sozlesme listesi
CREATE INDEX IF NOT EXISTS idx_sozlesmeler_firma_id
  ON public.sozlesmeler(firma_id);

-- sozlesmeler.proje_id — proje-bazli sozlesme listesi
CREATE INDEX IF NOT EXISTS idx_sozlesmeler_proje_id
  ON public.sozlesmeler(proje_id);

-- uyeler.proje_id — proje-bazli uye listesi
CREATE INDEX IF NOT EXISTS idx_uyeler_proje_id
  ON public.uyeler(proje_id);

-- uyeler.serefiye_id — daire-uye bagi
CREATE INDEX IF NOT EXISTS idx_uyeler_serefiye_id
  ON public.uyeler(serefiye_id)
  WHERE serefiye_id IS NOT NULL;

-- birikmis_teminatlar (firma_id, proje_id) — bakiye RPC sorgu paterni
CREATE INDEX IF NOT EXISTS idx_birikmis_teminatlar_firma_proje
  ON public.birikmis_teminatlar(firma_id, proje_id);

COMMENT ON INDEX idx_cari_hareketler_banka_hareket_id IS
  'Sprint qa-review-bugfix-faz3 — banka eslesme silme sorgusunda kullanilir';
COMMENT ON INDEX idx_proje_uyelikleri_user_id IS
  'Sprint qa-review-bugfix-faz3 — requireProjectAccess middleware sorgusu';
