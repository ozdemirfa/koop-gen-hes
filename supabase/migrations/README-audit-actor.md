# Audit actor_id — Backend Integration

## Sprint durumu

### Tamamlananlar

| Migration | Icerik |
|-----------|--------|
| `20260510000017_audit_actor_session_var.sql` | `fn_get_session_actor()` helper eklendi (auth.uid() → app.actor_id fallback) |
| `20260511000001_audit_actor_integration.sql` | Trigger guncellendi + 3 kritik RPC entegre edildi |

Migration `20260511000001` ile gerceklestirilen degisiklikler:

1. **`fn_audit_log` trigger fonksiyonu guncellendi** — `auth.uid()` satiri `public.fn_get_session_actor()` ile degistirildi.
   Service-role context'inde `auth.uid()` NULL doner; helper bu durumda `app.actor_id` session var'ini okur.

2. **3 kritik atomic RPC'ye `p_actor_id UUID DEFAULT NULL` parametresi eklendi:**
   - `fn_create_member_atomic(p_member_data JSONB, p_actor_id UUID DEFAULT NULL)`
   - `fn_update_member_atomic(p_member_id UUID, p_update_data JSONB, p_actor_id UUID DEFAULT NULL)`
   - `fn_create_payment_atomic(p_payment_data JSONB, p_actor_id UUID DEFAULT NULL)`

   Her RPC'nin basinda `set_config('app.actor_id', COALESCE(p_actor_id::TEXT, ''), true)` cagirisi yapilir.
   `DEFAULT NULL` sayesinde eski cagrilar (`p_actor_id` gec mezilmeden) bozulmaz.

### Backend entegrasyon ornegi

```typescript
// supabase-js ile RPC cagrisi
const { data, error } = await supabase.rpc('fn_create_member_atomic', {
  p_member_data: { ... },
  p_actor_id: currentUser.id   // veya null — eski kod bozulmaz
});
```

### Kalan RPC'ler (sonraki sprint)

Bu sprint'te EN KRITIK 3 finansal mutate RPC entegre edildi. Asagidaki RPC'ler ayni pattern ile sonraki sprint'lerde guncellenmeli:

| RPC | Migration | Oncelik |
|-----|-----------|---------|
| `fn_create_fatura_atomic` | 20260510000002 | Yuksek |
| `fn_update_fatura_atomic` | 20260510000002 | Yuksek |
| `fn_charge_aidat_tanimi` | 20260421000009 | Orta |
| `create_yillik_aidat_plani` | 20260414000002 | Orta |
| `fn_execute_aidat_charging` | 20260421000012 | Orta |
| `fn_bulk_charge_interest` | 20260426000003 | Orta |
| `fn_toggle_aidat_faiz` | 20260426000001 | Dusuk |
| `fn_calculate_single_aidat_late_fee` | 20260424000002 | Dusuk |
| `fn_create_irsaliye_atomic` | 20260428230004 | Orta |
| `fn_match_member_payments_fifo` | 20260426000004 | Orta |
| `fn_match_project_payments_fifo` | 20260426000004 | Orta |
| `fn_undo_payment_match` | 20260427000003 | Dusuk |
| `fn_undo_hakedis_closure` | 20260427000005 | Dusuk |

Toplam: 3 entegre edildi, 13 RPC bekliyor.

## Audit akisi (guncellenmis)

```
Backend RPC cagrisi (p_actor_id gec)
     |
     v
set_config('app.actor_id', p_actor_id::text, true)  -- session-local
     |
     v
INSERT/UPDATE/DELETE tetikler trg_audit_log
     |
     v
fn_audit_log() cagirir fn_get_session_actor()
     |
     +-- auth.uid() IS NOT NULL? → kullan (normal auth context)
     +-- NULL ise → current_setting('app.actor_id') oku (service-role)
     |
     v
audit_logs INSERT (actor_id, actor_email, ...)
```
