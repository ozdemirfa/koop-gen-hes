-- Migration: 20260519000001_audit_proje_uyelikleri.sql
-- Description: Sprint G'de oluşturulan proje_uyelikleri tablosuna audit trigger
-- ekler. Üyelik değişiklikleri (kim kimi hangi projeye, hangi rolle, ne zaman
-- ekledi/çıkardı) forensik iz olarak audit_logs'a yazılır. Sprint F'in
-- fn_audit_log() generic trigger fonksiyonu kullanılır.
--
-- Tablonun primary key'i (user_id, proje_id) composite olduğu için fn_audit_log
-- içindeki v_record_id = (jsonb ->> 'id')::UUID NULL döner — bu kabul edilebilir;
-- record_id audit_logs'ta zaten nullable. proje_id satırdan çıkarılır ve
-- (proje_id, changed_at) index'i ile sorgulanabilir.

BEGIN;

-- Idempotent: önce varolanı düşür
DROP TRIGGER IF EXISTS trg_audit_log ON public.proje_uyelikleri;

CREATE TRIGGER trg_audit_log
    AFTER INSERT OR UPDATE OR DELETE ON public.proje_uyelikleri
    FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log();

COMMIT;
