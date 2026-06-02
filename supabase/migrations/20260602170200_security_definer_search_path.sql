-- Migration: 20260602170200_security_definer_search_path.sql
-- Sprint: kalite-guvenlik-2026-06 (SEC-1)  🔴 KRİTİK
-- Description: SECURITY DEFINER fonksiyonların büyük çoğunluğunda `search_path`
--   pinlenmemişti → sistemik RLS bypass / privilege escalation vektörü. Saldırgan
--   oturum `search_path`'ini manipüle ederek fonksiyonun beklediği nesneleri
--   (tablo/fonksiyon) gölgeleyebilir. RLS helper'lar (is_admin, is_project_*,
--   is_staff vb.) RLS policy'lerinde kullanıldığından en kritik vektör.
--
-- Fix: search_path'i olmayan TÜM SECURITY DEFINER fonksiyona
--   `SET search_path = public, pg_temp` uygula. ALTER FUNCTION yalnız metadata
--   değiştirir — fonksiyon gövdesi DEĞİŞMEZ, davranış korunur.
--
-- Güvenlik analizi (2026-06-02): search_path'siz fonksiyonların HİÇBİRİ extension
--   şemasındaki fonksiyonları (uuid_generate_*, gen_random_uuid, pgcrypto: crypt/
--   gen_salt/digest/hmac/pgp_*) niteliksiz çağırmıyor (doğrulandı: 0 eşleşme).
--   Dolayısıyla public,pg_temp'e sabitlemek bu fonksiyonları kırmaz; tablo ve
--   diğer public fonksiyon referansları public şemasından çözülmeye devam eder.
--
-- Bu migration en son sırada (170200) çalışır; aynı PR'daki SEC-2/SEC-3 ile
--   yeniden oluşturulan fonksiyonları da kapsar (onlar zaten açıkça pinlediği için
--   sweep onları atlar — idempotent).

DO $$
DECLARE
  r RECORD;
  v_count INT := 0;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef                                   -- SECURITY DEFINER
      AND NOT EXISTS (                                  -- search_path henüz yok
        SELECT 1 FROM unnest(COALESCE(p.proconfig, '{}'::text[])) c
        WHERE c LIKE 'search_path=%'
      )
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public, pg_temp', r.sig);
    v_count := v_count + 1;
    RAISE NOTICE 'search_path pinned: %', r.sig;
  END LOOP;
  RAISE NOTICE 'SEC-1: % SECURITY DEFINER fonksiyona search_path eklendi.', v_count;
END $$;

-- Doğrulama: artık search_path'siz SECURITY DEFINER fonksiyon kalmamalı.
DO $$
DECLARE v_missing INT;
BEGIN
  SELECT count(*) INTO v_missing
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.prosecdef
    AND NOT EXISTS (
      SELECT 1 FROM unnest(COALESCE(p.proconfig, '{}'::text[])) c
      WHERE c LIKE 'search_path=%'
    );
  IF v_missing > 0 THEN
    RAISE EXCEPTION 'SEC-1 eksik: hâlâ % SECURITY DEFINER fonksiyonun search_path''i yok', v_missing;
  END IF;
END $$;
