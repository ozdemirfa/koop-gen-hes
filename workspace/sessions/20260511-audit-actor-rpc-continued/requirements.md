# Requirements — TASK-DB-03 devamı: 13 RPC'ye p_actor_id pattern uygulama

**Session ID:** 20260511-audit-actor-rpc-continued
**Tarih:** 2026-05-11
**Sprint:** koopGenHes audit_logs actor integration (faz 2)
**Bağlı task:** Backlog § TASK-DB-03 Devam

## Amaç

Audit trigger artık `fn_get_session_actor()` üzerinden session var `app.actor_id` veya `auth.uid()` okuyor (ref migration: `20260511000001_audit_actor_integration.sql`). Bu sprint'te 3 RPC'ye pattern uygulandı; geriye 13 mutate RPC kaldı. Bu task'lar tamamlanmadan service-role ile çağrılan tüm mutate işlemler için `audit_logs.actor_id` NULL kalmaya devam edecek.

## Kapsam

Bu RPC'lere `p_actor_id UUID DEFAULT NULL` parametresi + RPC body başına `PERFORM set_config('app.actor_id', COALESCE(p_actor_id::TEXT, ''), true);` ekle:

1. `fn_create_fatura_atomic(JSONB, JSONB)` — fatura.service.ts:47
2. `fn_update_fatura_atomic(UUID, JSONB, JSONB)` — fatura.service.ts:59
3. `fn_charge_aidat_tanimi(UUID)` — aidat.service.ts:148
4. `create_yillik_aidat_plani(UUID, INTEGER, JSONB)` — aidat.service.ts:170
5. `fn_execute_aidat_charging(DATE)` — aidat.service.ts:198
6. `fn_bulk_charge_interest(UUID[])` — aidat.service.ts:212
7. `fn_toggle_aidat_faiz(UUID, BOOLEAN)` — aidat.service.ts:457
8. `fn_calculate_single_aidat_late_fee(UUID)` — aidat.service.ts:448
9. `fn_create_irsaliye_atomic(JSONB, JSONB)` — malzemeTeslim.service.ts:45
10. `fn_match_member_payments_fifo(UUID, UUID)` — uye.service.ts:149
11. `fn_match_project_payments_fifo(UUID)` — cariHesap.service.ts:215
12. `fn_undo_payment_match(UUID)` — cariHesap.service.ts:188
13. `fn_undo_hakedis_closure(UUID)` — cariHesap.service.ts:201

Her RPC için service katmanı da güncellenecek: `actorId?: string` parametresi metoda eklenir, RPC çağrısında `p_actor_id: actorId ?? null` geçilir. Controller `req.user?.id`'yi service'e iletecek.

## Acceptance

- [ ] Tek migration dosyası: `supabase/migrations/20260511000003_audit_actor_remaining_rpcs.sql`
- [ ] Her RPC `DROP FUNCTION IF EXISTS` + `CREATE OR REPLACE` ile yeniden tanımlanır (PostgreSQL parametre listesi değişimi için)
- [ ] Her RPC için `p_actor_id UUID DEFAULT NULL` (geriye dönük uyumlu)
- [ ] 4 service dosyası güncellenir: `fatura.service.ts`, `aidat.service.ts`, `malzemeTeslim.service.ts`, `uye.service.ts`, `cariHesap.service.ts`
- [ ] Controller'lar `req.user?.id` aktarımı yapacak şekilde güncellenir
- [ ] Build green: `cd server && npm run build`
- [ ] Mevcut testler kırılmaz: `cd server && npx vitest run`
- [ ] User manuel `supabase db push` çalıştırır (sandbox prod DB'ye dokunmaz)

## Notlar

- Pattern referansı: `supabase/migrations/20260511000001_audit_actor_integration.sql`
- `chargeTanim` (RPC: `fn_charge_aidat_tanimi`) — son canonical migration: `20260425000001_fix_project_centric_accounting.sql` (project perspective fix sürümü)
- `fn_execute_aidat_charging` — son: `20260421000012_robust_aidat_charging.sql` (robust version calling fn_charge_aidat_tanimi internally)
- `fn_toggle_aidat_faiz`, `fn_calculate_single_aidat_late_fee` — son: `20260429000001_fix_accounting_and_fifo.sql` (security check sürümü)
- `fn_undo_payment_match` — son: `20260427000006_robust_undo_status_reversion.sql`
- `fn_undo_hakedis_closure` — son: `20260427000005_undo_hakedis_closure.sql`
- `fn_match_member_payments_fifo` — son: `20260429000001_fix_accounting_and_fifo.sql`
- `fn_match_project_payments_fifo` — son: `20260428000001_performance_optimizations.sql`
- `fn_create_irsaliye_atomic` — son: `20260510000013_fix_irsaliye_atomic_columns.sql`
- `fn_create_fatura_atomic`, `fn_update_fatura_atomic`, `fn_bulk_charge_interest` — son: `20260510000004_rpc_on_conflict_refactor.sql`

## Doğrulama (manuel — kullanıcı)

Migration push edildikten sonra:

```sql
-- Pattern doğrulama: her RPC için p_actor_id parametre var mı?
SELECT proname, pg_get_function_arguments(oid) as args
FROM pg_proc
WHERE proname IN (
  'fn_create_fatura_atomic', 'fn_update_fatura_atomic', 'fn_charge_aidat_tanimi',
  'create_yillik_aidat_plani', 'fn_execute_aidat_charging', 'fn_bulk_charge_interest',
  'fn_toggle_aidat_faiz', 'fn_calculate_single_aidat_late_fee',
  'fn_create_irsaliye_atomic', 'fn_match_member_payments_fifo',
  'fn_match_project_payments_fifo', 'fn_undo_payment_match', 'fn_undo_hakedis_closure'
)
ORDER BY proname;

-- audit_logs doğrulama: yeni fatura/irsaliye işleminden sonra
SELECT actor_id, actor_email, table_name, operation, changed_at
FROM public.audit_logs
WHERE changed_at > NOW() - INTERVAL '1 hour'
ORDER BY changed_at DESC LIMIT 20;
```
