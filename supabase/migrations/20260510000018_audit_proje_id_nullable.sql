-- Migration: 20260510000018_audit_proje_id_nullable.sql
-- Description: AUDIT ONLY — proje_id kolonu olan ve nullable kalan tabloları listele.
-- Bu migration HİÇBİR ŞEY DEĞİŞTİRMEZ. Sadece NOTICE üretir.
-- Gerçek ALTER TABLE NOT NULL operasyonları ayrı sprint'te yapılacak
-- (mevcut NULL veri var mı kontrol gerekiyor).
--
-- NOTE: The original task requested filename 20260510000016, but that sequence number
-- is now taken by default_user_role_trigger.sql. Using 00018 instead.
--
-- Çalıştırma: Supabase SQL Editor veya psql ile çalıştırın, MESSAGES sekmesinde
-- NOTICE satırlarını görün. Hiçbir tablo/veri değişmez.

DO $$
DECLARE
    r RECORD;
    null_count INTEGER;
BEGIN
    RAISE NOTICE '=== proje_id NULL audit ===';
    FOR r IN
        SELECT table_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND column_name = 'proje_id'
          AND is_nullable = 'YES'
        ORDER BY table_name
    LOOP
        EXECUTE format('SELECT COUNT(*) FROM public.%I WHERE proje_id IS NULL', r.table_name) INTO null_count;
        RAISE NOTICE 'Table %: NULL count = %', r.table_name, null_count;
    END LOOP;
    RAISE NOTICE '=== END audit ===';
END $$;
