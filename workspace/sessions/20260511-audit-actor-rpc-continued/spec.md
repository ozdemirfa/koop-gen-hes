# Spec — TASK-DB-03 devamı: 13 RPC'ye p_actor_id pattern uygulama

**Session:** 20260511-audit-actor-rpc-continued
**Sprint sahibi:** master-agent (single-dispatch fallback — Task subagent yok)
**Tarih:** 2026-05-11
**Bağımlılık:** `20260511000001_audit_actor_integration.sql` (3 RPC zaten dönüştürüldü)

## Hedef

Audit trigger artık actor_id'yi `fn_get_session_actor()` helper üzerinden okuyor. Bu helper iki yoldan değer alır:

1. `auth.uid()` — RLS context'inde otomatik dolu (anon/staff JWT)
2. `current_setting('app.actor_id', true)` — service-role çağrılarında set edilen session var

Service-role mutate'ler için (2) yolu kullanılır. 3 RPC zaten dönüştürüldü, geriye 13 RPC kaldı. Bu spec onları kapsar.

## Tasarım Kararları

### Tek migration dosyası

Tüm 13 RPC tek migration'da: `20260511000003_audit_actor_remaining_rpcs.sql`. Sebep:
- Tüm değişiklikler atomik bir audit-actor faz 2 mantıksal birime ait
- Ayırmak migration tarihçesini gereksiz şişirir
- 13 RPC tek transaction (BEGIN/COMMIT) içinde — kısmi başarısızlık olmaz

### Pattern (her RPC için)

```sql
DROP FUNCTION IF EXISTS public.fn_xxx(eski_imza);
CREATE OR REPLACE FUNCTION public.fn_xxx(
  ...orijinal_params,
  p_actor_id UUID DEFAULT NULL
) RETURNS ...AS $$
DECLARE
  ...
BEGIN
  PERFORM set_config('app.actor_id', COALESCE(p_actor_id::TEXT, ''), true);
  -- Geri kalan canonical mantık değiştirilmedi
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

**Neden DROP + CREATE?** PostgreSQL `CREATE OR REPLACE FUNCTION` parametre listesini değiştiremez. Yeni parametre eklemek için fonksiyonu önce silmek gerek. `DROP FUNCTION IF EXISTS` güvenli (idempotent).

**Neden `DEFAULT NULL`?** Geriye uyumluluk. Eski test fixtures, manuel SQL debug çağrıları, henüz güncellenmemiş call site'lar (yoksa da garantili) bozulmaz. Çağıran taraftan `p_actor_id` geçilmezse fonksiyon NULL alır → `set_config(...,'',true)` no-op olur → audit trigger fallback'e (auth.uid()) iner.

### Nested RPC'ler

İki RPC başka RPC'leri çağırır:
- `fn_execute_aidat_charging` → `fn_charge_aidat_tanimi`
- `fn_match_project_payments_fifo` → `fn_match_member_payments_fifo` + `fn_match_firm_payments_fifo`

Bu durumda parent RPC'de set edilen `app.actor_id` session var alt RPC'lerde de görünür (Postgres session-level config); fakat alt RPC'ler kendi başlarında da set_config çağırdıklarından parametreyi de iletmek tutarlılık sağlar.

`fn_match_firm_payments_fifo` bu sprint kapsamında değil (sadece project FIFO'dan çağrılıyor ve henüz `p_actor_id` parametresi yok) — sonraki sprint'te ele alınmalı. Migration yorumda not edildi.

### Service katmanı

Her service metoduna `actorId?: string` parametresi eklendi. RPC çağrılarında `p_actor_id: actorId ?? null` geçilir. Iç çağrılar (örn. `aidat.service.recordPayment` → `cariHesap.service.createPayment`) için actor iletimi de yapıldı.

### Controller katmanı

`req.user?.id` → service metodlarına geçilir. Bu pattern zaten `uye.controller`, `cariHesap.controller` (createPayment) için kullanılıyordu — diğer controller'lara da yayıldı.

## Etkilenen Dosyalar

### DB (1 yeni migration)
- `supabase/migrations/20260511000003_audit_actor_remaining_rpcs.sql` (yeni, 13 RPC)

### Server (5 service + 5 controller)
- `server/src/services/fatura.service.ts` (create + update)
- `server/src/services/aidat.service.ts` (chargeTanim, createYillikPlan, executeCharging, bulkChargeInterest, toggleInterest, calculateSingleLateFee, recordPayment, recordBulkPayment)
- `server/src/services/malzemeTeslim.service.ts` (create)
- `server/src/services/uye.service.ts` (matchPaymentsFIFO)
- `server/src/services/cariHesap.service.ts` (undoClosure, undoHakedisClosure, performFifoClosure)
- `server/src/controllers/faturalar.controller.ts`
- `server/src/controllers/aidat.controller.ts`
- `server/src/controllers/malzemeTeslim.controller.ts`
- `server/src/controllers/uye.controller.ts`
- `server/src/controllers/cariHesap.controller.ts`

## Doğrulama

### Tamamlanan (sandbox)
- ✅ `cd server && npm run build` — clean
- ✅ `cd server && npx vitest run` — 33/33 passed

### Manuel (kullanıcı — production DB)
- [ ] `supabase db push` ile migration uygulanır
- [ ] Aşağıdaki SQL ile imza kontrolü yapılır:
  ```sql
  SELECT proname, pg_get_function_arguments(oid) FROM pg_proc
   WHERE proname IN (
     'fn_create_fatura_atomic','fn_update_fatura_atomic','fn_charge_aidat_tanimi',
     'create_yillik_aidat_plani','fn_execute_aidat_charging','fn_bulk_charge_interest',
     'fn_toggle_aidat_faiz','fn_calculate_single_aidat_late_fee',
     'fn_create_irsaliye_atomic','fn_match_member_payments_fifo',
     'fn_match_project_payments_fifo','fn_undo_payment_match','fn_undo_hakedis_closure'
   );
  ```
  Beklenen: her satırın `args` kolonunda `p_actor_id uuid DEFAULT NULL` ifadesi olmalı.
- [ ] Yeni fatura/irsaliye/aidat ödemesi sonrası `audit_logs.actor_id` dolu gelir
- [ ] Vercel preview UI dumanlama: fatura kaydet, malzeme teslim kaydet, aidat tanımı borçlandır — 200 OK

## Risk

- **Düşük:** Tüm RPC'lerde `DEFAULT NULL` → eski çağrılar bozulmaz
- **Düşük:** Body mantığı değişmedi → fonksiyonel regresyon riski minimal
- **Orta:** `fn_match_firm_payments_fifo` henüz dönüştürülmedi → firma tarafı FIFO yapıldığında audit_logs.actor_id NULL olabilir → bir sonraki sprint'in ilk maddesi

## Geri Alma

Migration tek dosyada `BEGIN/COMMIT` içinde. Geri almak için:
1. DB'de eski sürümleri restore et: önceki canonical migration dosyalarını re-run
2. Service kodlarındaki `actorId?: string` parametrelerini geri çıkar (commit revert)

Pratik öneri: revert et migration dosyasını sil + `git revert <commit>` çalıştır.
