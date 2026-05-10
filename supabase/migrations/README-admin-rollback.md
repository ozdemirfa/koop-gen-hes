# Admin Role Rollback — Kullanıcı Adımları

`20260510000011_seed_all_users_admin.sql` migration'ı tüm mevcut auth.users'ı admin yaptı.
Bu istenmeyen bir durum (RBAC test edilemez hale geliyor). Manuel rollback:

## 1. Önce mevcut admin sayısını gör:
```sql
SELECT COUNT(*) FROM public.user_roles WHERE role='admin';
SELECT email, ur.role
FROM auth.users u JOIN public.user_roles ur ON u.id = ur.user_id
ORDER BY ur.role, u.email;
```

## 2. Admin kalacak user'ları belirle (örnek: ozdemirfa@gmail.com)

## 3. Diğer admin'leri staff'a düşür:
```sql
UPDATE public.user_roles
SET role = 'staff'
WHERE role = 'admin'
  AND user_id NOT IN (
    SELECT id FROM auth.users WHERE email IN ('ozdemirfa@gmail.com')
  );
```

## 4. roleCache'i bypass etmek için server'ı yeniden başlat veya 60s bekle.
