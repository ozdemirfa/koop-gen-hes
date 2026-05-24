-- Migration: 20260524110000_fix_projeler_cascade_fks_phase2.sql
-- Sprint: proje-silme-akisi (2026-05-24) — bug fix phase 2
-- Description:
--   Phase 1 (20260524100000) sadece projeler(id)'e doğrudan referans veren FK'leri
--   CASCADE'e taşımıştı. Ancak hard delete'te Postgres CASCADE'i sibling tablolar
--   arasında non-deterministik sırayla işliyor:
--     - cari_hareketler.proje_id (CASCADE) → satır silinir
--     - banka_hesaplari.proje_id (CASCADE) → satır silinir
--     - ama cari_hareketler.banka_hesap_id → banka_hesaplari(id) FK'si NO ACTION ise:
--       Postgres banka_hesaplari'yı önce silmeye karar verirse, cari_hareketler hâlâ
--       o satıra işaret ediyor → 23503.
--
--   Çözüm: "proje-scoped" tablolara (proje_id kolonu olan) gelen TÜM FK'leri
--   CASCADE'e normalize et. Bu, herhangi bir sibling-silme sırasını güvenli yapar.
--   Mevcut SET NULL ('n') / SET DEFAULT ('d') / CASCADE ('c') ayarları korunur —
--   yalnızca NO ACTION ('a') ve RESTRICT ('r') olanlar CASCADE'e yükseltilir.
--
-- Bilinen adaylar (en az):
--   uyeler.blok_id → bloklar
--   cari_hareketler.banka_hesap_id → banka_hesaplari
--   cari_hareketler.fatura_id → faturalar
--   cari_hareketler.hakedis_id → hakedisler
--   cari_hareketler.cek_id → cekler
--   hakedis_kalemleri.sozlesme_id → sozlesmeler
--   serefiye_tablosu.blok_id → bloklar (zaten CASCADE)
--   proje_is_kalemleri.ust_kalem_id → proje_is_kalemleri (self)
--   yillik_plan_kalemleri.proje_is_kalemi_id → proje_is_kalemleri (zaten CASCADE)
--   gelir_giderler.uye_id → uyeler  (eğer tablo hâlâ varsa)

BEGIN;

DO $$
DECLARE
    r RECORD;
    v_fixed INT := 0;
BEGIN
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
          AND con.confdeltype IN ('a','r')   -- yalnızca NO ACTION / RESTRICT
          AND array_length(con.conkey, 1) = 1
          AND EXISTS (
              SELECT 1
              FROM information_schema.columns ic
              WHERE ic.table_schema = 'public'
                AND ic.table_name   = rcl.relname
                AND ic.column_name  = 'proje_id'
          )
    LOOP
        RAISE NOTICE 'Phase 2 CASCADE: %.% → %(id)  [constraint=%, eski=%]',
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

    RAISE NOTICE 'Phase 2: toplam % FK CASCADE''e yükseltildi.', v_fixed;
END $$;

COMMIT;
