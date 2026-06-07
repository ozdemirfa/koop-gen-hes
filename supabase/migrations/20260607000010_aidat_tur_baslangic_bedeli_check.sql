-- Migration: 20260607000010_aidat_tur_baslangic_bedeli_check.sql
-- Sprint: kurumsal-cari-bugfix (2026-06-07)
-- Description: BUG FIX — aidat_tanimlari.tur CHECK constraint'i 'baslangic_bedeli' kabul etmiyor.
--
--   20260607000007 (Rev A) başlangıç bedeli toplu tahakkuk özelliğini ekledi: Zod schema
--   ve frontend tur enum'una 'baslangic_bedeli' eklendi; fn_charge_baslangic_tanimi yazıldı.
--   ANCAK aidat_tanimlari'nda mevcut `aidat_tanimlari_tur_check`
--   (CHECK tur IN ('normal','ara_odeme')) güncellenmemişti → Tür='Başlangıç Bedeli' ile
--   tanım kaydetmek 23514 (check_violation) → 500 veriyordu.
--
--   Canlı doğrulama (Supabase MCP, 2026-06-07) bu hatayı yakaladı.
--
-- Fix: CHECK'i 'baslangic_bedeli' içerecek şekilde yeniden oluştur (DROP + ADD).

BEGIN;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'aidat_tanimlari_tur_check') THEN
    ALTER TABLE public.aidat_tanimlari DROP CONSTRAINT aidat_tanimlari_tur_check;
  END IF;
END $$;

ALTER TABLE public.aidat_tanimlari
  ADD CONSTRAINT aidat_tanimlari_tur_check
  CHECK (tur IN ('normal', 'ara_odeme', 'baslangic_bedeli'));

COMMIT;
