-- Migration: 20260512000004_odeme_turu_check_cari.sql
-- Description: REV-PAY-11 — cari_hareketler.odeme_turu CHECK constraint listesine
-- 'cari' değeri eklendi. Önceki migration (20260512000002) `odeme_yontemi` ENUM'a
-- 'cari' eklemişti ama bu metin (VARCHAR) kolon ayrı CHECK kuralına bağlıydı; o
-- liste 'cari' içermediği için POST /api/cari-hareketler/payment INSERT'i 23514
-- (CHECK constraint violation) ile reddediyordu.
--
-- Repro:
--   INSERT INTO public.cari_hareketler (..., odeme_turu, ...) VALUES (..., 'cari', ...);
--   ERROR: 23514: new row for relation "cari_hareketler" violates check constraint
--          "cari_hareketler_odeme_turu_check"
--
-- Fix: DROP + ADD CONSTRAINT — yeni liste 'nakit','banka','kredi_karti','cek','cari'.
-- NULL hâlâ kabul (eski davranış korunur, geri uyumlu).

BEGIN;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cari_hareketler_odeme_turu_check') THEN
        ALTER TABLE public.cari_hareketler DROP CONSTRAINT cari_hareketler_odeme_turu_check;
    END IF;
END $$;

ALTER TABLE public.cari_hareketler
ADD CONSTRAINT cari_hareketler_odeme_turu_check
CHECK (odeme_turu IS NULL OR odeme_turu IN ('nakit', 'banka', 'kredi_karti', 'cek', 'cari'));

COMMIT;
