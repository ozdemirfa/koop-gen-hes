-- Migration: 20260512000006_fix_kaynak_unique_scope.sql
-- Description: REV-FIFO-01 — Hesap Kapatma (FIFO) butonu 409 "Bu kayıt zaten mevcut"
-- hatası veriyordu. Kök neden: 20260510000003 ile eklenen
-- `uq_cari_hareketler_kaynak (kaynak_tipi, kaynak_id)` partial unique index TÜM
-- kaynak_tipi değerlerini kapsıyordu. Ancak:
--
--   - `kaynak_tipi='aidat_kayit'` / `'gecikme_faizi'` / `'fatura'`  → TAHAKKUK kaydı
--     (aidat/faiz/fatura başına tek satır — unique olmalı)
--   - `kaynak_tipi='aidat'`                                          → MATCHED PAYMENT
--     (bir aidat parçalı tahsilatlarla kapanabilir — N adet satır mümkün)
--
-- fn_match_member_payments_fifo bir aidata ikinci parça ödemeyi bağlamaya çalışınca
-- (UPDATE cari_hareketler SET kaynak_tipi='aidat', kaynak_id=aidat-1) unique
-- ihlali fırlatıyordu. Idempotency garantisi tahakkuk türleri için zaten yeterli;
-- ödeme eşleştirmeleri için unique anlamsız.
--
-- Fix: eski index DROP edilir, yeni partial unique sadece tahakkuk türlerini kapsar.

BEGIN;

DROP INDEX IF EXISTS public.uq_cari_hareketler_kaynak;

CREATE UNIQUE INDEX IF NOT EXISTS uq_cari_hareketler_kaynak_tahakkuk
    ON public.cari_hareketler (kaynak_tipi, kaynak_id)
    WHERE kaynak_id IS NOT NULL
      AND kaynak_tipi IN ('aidat_kayit', 'gecikme_faizi', 'fatura');

COMMENT ON INDEX public.uq_cari_hareketler_kaynak_tahakkuk IS
    'Tahakkuk türü cari hareketlerin idempotency garantisi: aidat_kayit / gecikme_faizi'
    ' / fatura kaynak_tipleri için (kaynak_tipi, kaynak_id) çifti unique. Matched payment'
    ' kayıtları (kaynak_tipi=aidat) bu unique kapsamında DEĞİLDİR — parçalı tahsilat'
    ' senaryosunda bir aidat birden çok satıra eşleşebilir.';

COMMIT;
