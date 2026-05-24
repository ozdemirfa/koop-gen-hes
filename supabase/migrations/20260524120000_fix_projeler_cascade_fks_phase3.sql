-- Migration: 20260524120000_fix_projeler_cascade_fks_phase3.sql
-- Sprint: proje-silme-akisi (2026-05-24) — bug fix phase 3
-- Description:
--   Phase 1 (FK'ler → projeler) + Phase 2 (FK'ler → proje_id'li tablolar) hâlâ
--   bazı grandchild durumları kaçırıyor. Örnek:
--     hakedis_kalemleri.is_kalemi_id → sozlesme_is_kalemleri(id) [NO ACTION]
--   sozlesme_is_kalemleri'nin kendisinde proje_id yok (sozlesmeler üzerinden bağlı);
--   bu yüzden phase 2'nin filtresi onu kapsamıyordu. Ama projeler cascade'i sırasında
--   sozlesmeler silinince sozlesme_is_kalemleri CASCADE oluyor — hakedis_kalemleri
--   önce silinmemişse 23503.
--
-- Yaklaşım: "proje-bağlı" tabloları transitif olarak topla (proje_id varsa veya
-- proje_id'li bir tabloya CASCADE FK ile zincirleniyorsa), sonra bu küme içindeki
-- tablolara gelen NO ACTION/RESTRICT FK'leri CASCADE'e taşı.

BEGIN;

DO $$
DECLARE
    r RECORD;
    v_fixed INT := 0;
BEGIN
    -- 1) Proje kapsamına giren tabloları transitif olarak topla.
    --    Başlangıç: doğrudan proje_id kolonu olan tablolar.
    --    Adım: o tabloya CASCADE FK ile bağlı tabloları da setle ekle (kaleme tabloları).
    CREATE TEMP TABLE _proje_scope (table_name TEXT PRIMARY KEY) ON COMMIT DROP;

    INSERT INTO _proje_scope (table_name)
    SELECT DISTINCT ic.table_name
    FROM information_schema.columns ic
    WHERE ic.table_schema = 'public'
      AND ic.column_name  = 'proje_id'
      AND ic.table_name IN (
          SELECT cl.relname FROM pg_class cl
          JOIN pg_namespace ns ON ns.oid = cl.relnamespace
          WHERE ns.nspname = 'public' AND cl.relkind = 'r'  -- yalnızca base tablolar
      );

    -- Transitif kapanış: CASCADE veya SET NULL ile proje-bağlı tabloya bağlı her
    -- tabloyu da scope'a ekle (yeni satır yoksa sonlan).
    LOOP
        WITH new_rows AS (
            INSERT INTO _proje_scope (table_name)
            SELECT DISTINCT cl.relname
            FROM pg_constraint con
            JOIN pg_class      cl  ON cl.oid  = con.conrelid
            JOIN pg_namespace  ns  ON ns.oid  = cl.relnamespace
            JOIN pg_class      rcl ON rcl.oid = con.confrelid
            JOIN pg_namespace  rns ON rns.oid = rcl.relnamespace
            WHERE con.contype     = 'f'
              AND ns.nspname      = 'public'
              AND rns.nspname     = 'public'
              AND rcl.relname     IN (SELECT table_name FROM _proje_scope)
              AND cl.relname      NOT IN (SELECT table_name FROM _proje_scope)
              AND con.confdeltype IN ('c','n')  -- CASCADE veya SET NULL
            ON CONFLICT DO NOTHING
            RETURNING table_name
        )
        SELECT COUNT(*) FROM new_rows INTO v_fixed;
        EXIT WHEN v_fixed = 0;
    END LOOP;

    RAISE NOTICE 'Proje-scope tablo sayısı: %', (SELECT COUNT(*) FROM _proje_scope);

    -- 2) Scope içindeki tablolara gelen NO ACTION / RESTRICT FK'leri CASCADE'e taşı.
    v_fixed := 0;
    FOR r IN
        SELECT
            con.conname AS constraint_name,
            cl.relname  AS table_name,
            att.attname AS column_name,
            rcl.relname AS ref_table,
            con.confdeltype
        FROM pg_constraint con
        JOIN pg_class      cl  ON cl.oid  = con.conrelid
        JOIN pg_namespace  ns  ON ns.oid  = cl.relnamespace
        JOIN pg_class      rcl ON rcl.oid = con.confrelid
        JOIN pg_namespace  rns ON rns.oid = rcl.relnamespace
        JOIN pg_attribute  att ON att.attrelid = con.conrelid
                              AND att.attnum   = con.conkey[1]
        WHERE con.contype     = 'f'
          AND ns.nspname      = 'public'
          AND rns.nspname     = 'public'
          AND con.confdeltype IN ('a','r')
          AND array_length(con.conkey, 1) = 1
          AND rcl.relname IN (SELECT table_name FROM _proje_scope)
    LOOP
        RAISE NOTICE 'Phase 3 CASCADE: %.% → %(id)  [constraint=%, eski=%]',
            r.table_name, r.column_name, r.ref_table, r.constraint_name, r.confdeltype;

        EXECUTE format(
            'ALTER TABLE public.%I DROP CONSTRAINT %I',
            r.table_name, r.constraint_name
        );
        EXECUTE format(
            'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES public.%I(id) ON DELETE CASCADE',
            r.table_name, r.constraint_name, r.column_name, r.ref_table
        );
        v_fixed := v_fixed + 1;
    END LOOP;

    RAISE NOTICE 'Phase 3: toplam % FK CASCADE''e yükseltildi.', v_fixed;
END $$;

COMMIT;
