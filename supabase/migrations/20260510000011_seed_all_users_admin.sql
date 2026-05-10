-- Migration: 20260510000011_seed_all_users_admin.sql
-- Description: Mevcut tüm auth.users kullanıcılarına admin rolü atar (idempotent).
-- Bağlam: Önceki seed (20260510000010) sadece 'admin@kooperatif.com' email'iyle eşleştiriyordu;
-- gerçek kullanıcı email'i farklı olduğu için INSERT 0 satır eklemiş olabilir.
-- Bu kooperatif tek-tenant yapı kooperatifi (üyeler için Supabase auth user oluşturulmuyor —
-- üye kayıtları public.uyeler tablosunda; auth.users sadece sistem yöneticileri için).
-- Dolayısıyla auth.users'taki tüm kullanıcılar zaten yönetici/personel; hepsi admin yapılır.

INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin' FROM auth.users
ON CONFLICT (user_id, role) DO NOTHING;

INSERT INTO public.proje_uyelikleri (user_id, proje_id, rol)
SELECT u.id, p.id, 'admin'
FROM auth.users u
CROSS JOIN public.projeler p
ON CONFLICT (user_id, proje_id) DO NOTHING;
