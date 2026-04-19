-- Migration: 20260418000003_reset_transactional_data.sql
-- Step 3: Clear transactional data

DO $$
DECLARE
    row RECORD;
    -- Korunacak tablolar listesi
    korunan_tablolar TEXT[] := ARRAY[
        'uyeler', 
        'user_roles', 
        'projeler', 
        'bloklar', 
        'aidat_tanimlari', 
        'gelir_gider_kategorileri',
        'schema_migrations'
    ];
BEGIN
    FOR row IN 
        SELECT tablename 
        FROM pg_tables 
        WHERE schemaname = 'public' 
        AND tablename != ALL(korunan_tablolar)
    LOOP
        EXECUTE format('TRUNCATE TABLE public.%I CASCADE', row.tablename);
    END LOOP;
END $$;
