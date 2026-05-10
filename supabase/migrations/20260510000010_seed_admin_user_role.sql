-- Migration: 20260510000010_seed_admin_user_role.sql
-- Description: admin@kooperatif.com kullanıcısını user_roles tablosuna 'admin' rolüyle ekler.
-- Sprint H sonrası backend her mutate endpoint'te user_roles kontrolü yapıyor;
-- bu kullanıcının kaydı yoksa 403 dönüyor. Bu seed mevcut kullanıcıyı admin yapar
-- (yoksa NOOP); ileride başka admin atamaları manuel INSERT ile yapılabilir.

INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'admin'
FROM auth.users u
WHERE u.email = 'admin@kooperatif.com'
ON CONFLICT (user_id, role) DO NOTHING;

-- Aynı kullanıcıyı tüm projelerin admin'i olarak proje_uyelikleri'ne de ekle
-- (Sprint G için defense in depth; service-role bypass dışında frontend direct sorgu olursa).
INSERT INTO public.proje_uyelikleri (user_id, proje_id, rol)
SELECT u.id, p.id, 'admin'
FROM auth.users u
CROSS JOIN public.projeler p
WHERE u.email = 'admin@kooperatif.com'
ON CONFLICT (user_id, proje_id) DO NOTHING;
