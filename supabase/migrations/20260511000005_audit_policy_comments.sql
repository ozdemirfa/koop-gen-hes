-- Migration: 20260511000005_audit_policy_comments.sql
-- Description: SEC-010 (sprint 20260511-backlog-batch3) — audit_logs RLS policy'lerine
--   açıklayıcı COMMENT ekle. `audit_logs_no_direct_insert` policy `WITH CHECK (false)`
--   diye yazıldı ama trigger fn_audit_log SECURITY DEFINER ile bypass ediyor. Bu davranış
--   doğru ama policy ifadesi yanıltıcı — operations team yanlış anlayabilir. COMMENT ile netleştir.

BEGIN;

COMMENT ON POLICY audit_logs_no_direct_insert ON public.audit_logs IS
  'Kullanıcı doğrudan INSERT yapamaz (WITH CHECK false). '
  'Trigger fn_audit_log SECURITY DEFINER ile policy''yi bypass eder — bu beklenen davranış. '
  'Application-level kod public.audit_logs''a doğrudan insert ETMEMELİ; tüm satırlar trigger üzerinden gelir.';

COMMENT ON POLICY audit_logs_no_update ON public.audit_logs IS
  'Audit log immutable — hiçbir kullanıcı/role UPDATE yapamaz. '
  'Forensik bütünlük için audit kayıtları sadece create-once.';

COMMENT ON POLICY audit_logs_no_delete ON public.audit_logs IS
  'Audit log immutable — hiçbir kullanıcı/role DELETE yapamaz. '
  'Retention için ileride partition + drop-partition stratejisi uygulanacak (BACKLOG).';

COMMENT ON POLICY audit_logs_select_admin ON public.audit_logs IS
  'Sadece admin rolündeki user audit log okuyabilir (is_admin() helper). '
  'Forensik amaçlı; staff/viewer için aktif değil.';

COMMENT ON FUNCTION public.fn_audit_log() IS
  'Generic audit trigger — finansal mutate tablolarında AFTER INSERT/UPDATE/DELETE çalışır. '
  'SECURITY DEFINER ile audit_logs INSERT policy''sini bypass eder. '
  'actor_id ve proje_id''yi auth.uid() ve NEW/OLD jsonb içinden çıkarır.';

COMMIT;
