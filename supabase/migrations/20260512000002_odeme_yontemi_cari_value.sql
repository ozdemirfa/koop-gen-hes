-- Migration: 20260512000002_odeme_yontemi_cari_value.sql
-- Description: REV-PAY-01 — Üyelik başlangıç bedeli tahakkuk akışında frontend
-- `odeme_turu='cari'` gönderiyor; backend RPC fn_create_payment_atomic bu değeri
-- cari_hareketler.odeme_yontemi enum kolonuna cast etmeye çalışıyor. Ancak
-- odeme_yontemi ENUM tanımında 'cari' yok (mevcut değerler: nakit, havale, eft,
-- kredi_karti, diger, banka, kasa, cek). Cast hatası 42804/22P02 fırlatıyor.
--
-- Fix: ENUM'a 'cari' değeri eklenir + sync trigger fn_sync_cari_odeme_fields()
-- 'cari' branch'iyle güncellenir.
--
-- NOT: ALTER TYPE ... ADD VALUE PG 12+ ile tx içinde çalışır AMA aynı tx'te
-- yeni değer referans edilemez. Bu migration sadece enum ekler + trigger günceller;
-- RPC revize bir SONRAKİ migration'da (20260512000003) yapılır.

BEGIN;

ALTER TYPE public.odeme_yontemi ADD VALUE IF NOT EXISTS 'cari';

COMMIT;

-- 'cari' enum değeri sync trigger'a tanıtılır. trigger fn_sync_cari_odeme_fields
-- şu an sadece nakit/banka/cek/kredi_karti tanıyor; 'cari' için else branch'i
-- yoktu → trigger 'cari' durumda odeme_yontemi'ni override etmiyor (RPC'den ne
-- gelirse o kalıyordu). Yeni semantik: odeme_turu='cari' ise odeme_yontemi='cari'.

BEGIN;

CREATE OR REPLACE FUNCTION public.fn_sync_cari_odeme_fields()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.odeme_turu = 'nakit' THEN
        NEW.odeme_yontemi := 'nakit'::public.odeme_yontemi;
    ELSIF NEW.odeme_turu = 'banka' THEN
        NEW.odeme_yontemi := 'banka'::public.odeme_yontemi;
    ELSIF NEW.odeme_turu = 'cek' THEN
        NEW.odeme_yontemi := 'cek'::public.odeme_yontemi;
    ELSIF NEW.odeme_turu = 'kredi_karti' THEN
        NEW.odeme_yontemi := 'kredi_karti'::public.odeme_yontemi;
    ELSIF NEW.odeme_turu = 'cari' THEN
        -- REV-PAY-01: cari = tahakkuk; banka hareketi yoktur. odeme_yontemi='cari'.
        NEW.odeme_yontemi := 'cari'::public.odeme_yontemi;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMIT;
