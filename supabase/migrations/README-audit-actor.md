# Audit actor_id — Backend Integration

Migration `20260510000017_audit_actor_session_var.sql` `fn_get_session_actor()` helper ekledi.
Bu helper hem `auth.uid()` hem session var (`app.actor_id`) destekliyor.

## Backend integration (TODO — ayrı task)

Backend her mutate işleminden önce şunu çalıştırmalı:
```sql
SELECT set_config('app.actor_id', '<user_uuid>', true);
```
Veya RPC parametresi yaklaşımı: tüm atomic RPC'lere `p_actor_id UUID` parametre ekle.

## Mevcut audit trigger'ı güncelle (gelecek migration)

Mevcut `fn_audit_log` fonksiyonunda `auth.uid()` çağrısı yerine `public.fn_get_session_actor()` çağrısı kullan:

```sql
-- fn_audit_log içinde şu satırı:
v_actor_id := auth.uid();

-- Şununla değiştir:
v_actor_id := public.fn_get_session_actor();
```

Bu sprint'te SADECE helper fonksiyonu eklendi; trigger güncellemesi sonraki sprint.
