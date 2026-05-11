# Verification Report — 20260511-audit-actor-rpc-continued

**Sprint:** TASK-DB-03 devamı (13 RPC p_actor_id pattern)
**Tarih:** 2026-05-11
**Doğrulayan:** master-agent (in-session fallback — Task subagent yok)

## Build

```
cd server && npm run build
> server@1.0.0 build
> tsc
(no errors)
```

**Sonuç:** ✅ TypeScript build temiz; tüm service + controller imza değişiklikleri tip-uyumlu.

## Unit + Integration Tests

```
cd server && npx vitest run
✓ tests/unit/roleCache.test.ts (9 tests)  4ms
✓ tests/unit/requireRole.test.ts (7 tests)  4ms
✓ tests/unit/cariPaymentSchema.test.ts (5 tests)  5ms
✓ tests/integration/rbac.smoke.test.ts (12 tests)  114ms

Test Files  4 passed (4)
Tests       33 passed (33)
Duration    6.79s
```

**Sonuç:** ✅ Baseline 33 test korundu; regresyon yok.

## Migration Lint

`supabase/migrations/20260511000003_audit_actor_remaining_rpcs.sql`:
- BEGIN/COMMIT pair ✓
- Tüm 13 RPC için DROP + CREATE OR REPLACE pattern ✓
- Her RPC body başında `PERFORM set_config('app.actor_id', COALESCE(p_actor_id::TEXT, ''), true);` ✓
- Her RPC için `p_actor_id UUID DEFAULT NULL` (geriye uyumlu) ✓
- `LANGUAGE plpgsql SECURITY DEFINER` korundu ✓
- COMMENT ifadeleri eklendi ✓

## Service + Controller İmza Tutarlılığı

| Service Method | Controller Site | actor iletimi | ✓ |
|---|---|---|---|
| `faturaService.create(body, actorId)` | `createFatura` | `req.user?.id` | ✅ |
| `faturaService.update(id, body, actorId)` | `updateFatura` | `req.user?.id` | ✅ |
| `aidatTanimiService.chargeTanim(id, actorId)` | `chargeTanim` | `req.user?.id` | ✅ |
| `aidatTanimiService.createYillikPlan(body, actorId)` | `createYillikPlan` | `req.user?.id` | ✅ |
| `aidatTanimiService.executeCharging(date, actorId)` | `executeCharging` + `getAidatTanimlari` | `req.user?.id` | ✅ |
| `aidatTanimiService.bulkChargeInterest(ids, actorId)` | `bulkChargeInterest` | `req.user?.id` | ✅ |
| `aidatService.toggleInterest(id, active, actorId)` | `toggleInterest` | `req.user?.id` | ✅ |
| `aidatService.calculateSingleLateFee(id, actorId)` | `calculateSingleLateFee` | `req.user?.id` | ✅ |
| `aidatService.recordPayment(id, body, actorId)` | `recordPayment` | `req.user?.id` | ✅ |
| `aidatService.recordBulkPayment(id, body, actorId)` | `bulkPayment` | `req.user?.id` | ✅ |
| `malzemeTeslimService.create(body, actorId)` | `createMalzemeTeslim` | `req.user?.id` | ✅ |
| `uyeService.matchPaymentsFIFO(uyeId, projeId, actorId)` | `matchPaymentsFIFO` | `req.user?.id` | ✅ |
| `cariHesapService.performFifoClosure(projeId, actorId)` | `performFifoClosure` | `req.user?.id` | ✅ |
| `cariHesapService.undoClosure(id, actorId)` | `undoClosure` | `req.user?.id` | ✅ |
| `cariHesapService.undoHakedisClosure(id, actorId)` | `undoHakedisClosure` | `req.user?.id` | ✅ |

**Iç çağrılar:**
- `aidatService.recordPayment` → `cariHesapService.createPayment` actor iletimi ✓
- `aidatService.recordBulkPayment` → `cariHesapService.createPayment` actor iletimi ✓

## Manuel Doğrulama (kullanıcı çalıştıracak)

### 1. Migration push

```bash
cd projects/koopGenHes
supabase db push
```

### 2. RPC imza kontrolü

Supabase SQL Editor:

```sql
SELECT proname, pg_get_function_arguments(oid) AS args
FROM pg_proc
WHERE proname IN (
  'fn_create_fatura_atomic', 'fn_update_fatura_atomic', 'fn_charge_aidat_tanimi',
  'create_yillik_aidat_plani', 'fn_execute_aidat_charging', 'fn_bulk_charge_interest',
  'fn_toggle_aidat_faiz', 'fn_calculate_single_aidat_late_fee',
  'fn_create_irsaliye_atomic', 'fn_match_member_payments_fifo',
  'fn_match_project_payments_fifo', 'fn_undo_payment_match', 'fn_undo_hakedis_closure'
)
ORDER BY proname;
```

Beklenen: Her satırın `args` kolonunda `p_actor_id uuid DEFAULT NULL` ifadesi.

### 3. Audit log doğrulaması

Vercel preview üzerinde yeni fatura/irsaliye/aidat tahakkuku işlemi yap, sonra:

```sql
SELECT actor_id, actor_email, table_name, operation, changed_at
FROM public.audit_logs
WHERE changed_at > NOW() - INTERVAL '5 minutes'
ORDER BY changed_at DESC;
```

Beklenen: `actor_id` ve `actor_email` dolu (önceden NULL'du).

## Bilinen Kapsam Dışı

- **`fn_match_firm_payments_fifo`** (UUID, UUID) — `fn_match_project_payments_fifo` içinden çağrılıyor. Bu sprint'te dönüştürülmedi (taskboard'da yoktu). Firma tarafı FIFO işlemlerinde audit_logs.actor_id parent RPC'nin set_config'inden devralınır ama kendi başına çağrı yapıldığında NULL kalır. **Sonraki sprint için backlog'a eklendi.**

## Sonuç

**✅ HAZIR — commit + push edilebilir.**

Manuel adımlar (supabase db push + UI dumanlama) kullanıcı yapacak. Sandbox sınırı: production DB'ye doğrudan dokunmuyoruz; migration dosyası sadece yazıldı.
