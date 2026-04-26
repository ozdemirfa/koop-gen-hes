-- Migration: 20260427000008_cleanup_all_data.sql
-- Description: Clear all transactional and master data while preserving configuration/parameter tables (birimler, pozlar, user_roles).

BEGIN;

DO $$
DECLARE
    row record;
    tables_to_keep text[] := ARRAY['birimler', 'pozlar', 'user_roles'];
BEGIN
    -- Disable triggers temporarily to avoid overhead/side effects during truncate
    -- Note: CASCADE will handle foreign key constraints automatically.
    
    FOR row IN 
        SELECT tablename 
        FROM pg_tables 
        WHERE schemaname = 'public' 
          AND tablename NOT IN (SELECT unnest(tables_to_keep))
    LOOP
        RAISE NOTICE 'Truncating table: %', row.tablename;
        EXECUTE format('TRUNCATE TABLE public.%I RESTART IDENTITY CASCADE', row.tablename);
    END LOOP;
END $$;

COMMIT;
