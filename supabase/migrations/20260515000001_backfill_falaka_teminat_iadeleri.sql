-- Migration: 20260515000001_backfill_falaka_teminat_iadeleri.sql
-- Description:
-- Falaka Tic. Ltd. Şti firmasına ait, kullanıcının "Teminat İadesi" checkbox'ı
-- işaretleyerek girdiği fakat client→server payload aktarımında kaynak_tipi alanı
-- Zod schema strip'i nedeniyle DB'ye NULL olarak yazılan 5 cari_hareketler kaydını
-- targeted UPDATE ile kaynak_tipi='teminat' olarak işaretle.
--
-- Bu UPDATE, 20260514000003 ile kurulu trg_cari_hareket_teminat_iade trigger'ını
-- her satır için ateşler; birikmis_teminatlar tablosundaki Falaka satırı net
-- değere ulaşır.
--
-- Beklenen sonuç:
--   ÖNCE:  birikmis_teminat = 46.426,00 (sadece hakediş kesintileri toplamı)
--   SONRA: birikmis_teminat = 46.426 - 160.000 = -113.574,00 (kullanıcının iade ettiği
--          toplam teminat hakediş kesintilerinden 113.574 TL fazla → fazladan iade
--          edilmiş anomali raporu olarak görünür)
--
-- Targeted backfill: ID'ler diagnostic-pg scriptinden çıkarıldı. Bu beş kayıt
-- kullanıcı tarafından açık şekilde "Teminat İadesi" sinyali ile gönderildi
-- (issue raporu, 2026-05-14/15). Başka NULL kaynak_tipi'li giden_odeme'ler bu
-- UPDATE'in etki alanı dışındadır — hiçbir genel-amaçlı sweep yapılmaz.
--
-- Önkoşul: cariPaymentSchema'da is_teminat whitelist'i ve service mapping'i
-- production'a deploy edilmiş olmalı (aksi takdirde yeni girilen iadelerde
-- bug devam eder; bu migration sadece geçmişi temizler).
--
-- Geri alma (rollback) gerekirse: UPDATE cari_hareketler SET kaynak_tipi = NULL
-- WHERE id IN (...) ve manuel olarak birikmis_teminatlar'ı backfill (trigger
-- otomatik geri çevirir, çift düşüm olmaz).

BEGIN;

-- Falaka'nın 5 teminat iadesi kaydı (kullanıcı raporu, 2026-05-14/15)
UPDATE public.cari_hareketler
SET kaynak_tipi = 'teminat'
WHERE id IN (
    '12943031-43e4-437e-aa88-8655d9c53ad8'::uuid,  -- 2026-05-11, 100.000 TL
    '81a3e9eb-0665-490d-a67c-fa07c4a74632'::uuid,  --   2026-05-14, 10.000 TL
    '64145653-db65-4a3a-95c0-66fb88f60f3a'::uuid,  --   2026-05-14, 10.000 TL
    '0dca1aba-45f0-4e2c-809c-26bd33ab7b49'::uuid,  --   2026-05-14, 20.000 TL
    '3fcfb5ac-cf8c-4c47-a2d1-766b62921ed5'::uuid   --   2026-05-15, 20.000 TL ("teminat ödeme")
  )
  AND islem_turu IN ('giden_odeme','odeme')
  AND kaynak_tipi IS NULL;  -- idempotency: zaten 'teminat' ise UPDATE'i atla (trigger çift düşürür)

-- NOT: UPDATE her satır için trg_cari_hareket_teminat_iade'yi ateşler;
-- birikmis_teminatlar.birikmis_teminat NEW.alacak − OLD.alacak (0) = NEW.alacak kadar düşer.
-- 5 satır için toplam: 100k + 10k + 10k + 20k + 20k = 160.000 düşüm.

COMMIT;
