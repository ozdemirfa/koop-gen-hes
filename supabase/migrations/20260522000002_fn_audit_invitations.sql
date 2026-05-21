-- Audit trigger for invitations
-- Mevcut fn_audit_log() generic trigger fonksiyonu kullanılır
-- (supabase/migrations/20260519000001_audit_proje_uyelikleri.sql pattern'i).
--
-- Davet oluşturma, kabul, red ve attempt_count++ değişimleri audit_logs'a yazılır.

BEGIN;

DROP TRIGGER IF EXISTS trg_audit_log ON public.invitations;

CREATE TRIGGER trg_audit_log
  AFTER INSERT OR UPDATE OR DELETE ON public.invitations
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log();

COMMIT;
