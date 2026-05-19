-- Migration: 20260521000002_backfill_user_roles_and_proje_uyelikleri.sql
-- Description: Faz 1 (#55) + Faz 2 (#58) sonrası mevcut kullanıcılar
-- `user_roles` ve `proje_uyelikleri` tablolarına atanmadıkları için
-- `/api/admin/*` ve `/api/<modul>` endpoint'leri 403 dönüyor.
--
-- Bu migration tek seferlik backfill yapar:
--   1. `auth.users`'ta olan ama `user_roles`'ta olmayan herkes 'staff' rolüne sahip.
--   2. ozdemirfa@gmail.com global 'admin' rolüne yükseltilir (proje sahibi).
--   3. ozdemirfa@gmail.com tüm mevcut projelere 'admin' üyeliğiyle eklenir.
--   4. Diğer mevcut auth kullanıcıları için proje üyeliği atanmaz — yöneticinin
--      KullaniciYonetimi sayfasından manuel atama yapması beklenir (security default).
--
-- Idempotent: ON CONFLICT clause'ları ile tekrar çalıştırılabilir.

BEGIN;

-- 1. Her auth kullanıcı için en az 'staff' global rol garantile
INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'staff'
FROM auth.users u
WHERE NOT EXISTS (
  SELECT 1 FROM public.user_roles ur WHERE ur.user_id = u.id
)
ON CONFLICT (user_id, role) DO NOTHING;

-- 2. ozdemirfa@gmail.com'u global admin yap (varsa)
DO $$
DECLARE
  v_admin_id UUID;
BEGIN
  SELECT id INTO v_admin_id FROM auth.users WHERE email = 'ozdemirfa@gmail.com' LIMIT 1;

  IF v_admin_id IS NOT NULL THEN
    -- Varolan 'staff' kaydını sil, 'admin' rolü ekle
    DELETE FROM public.user_roles WHERE user_id = v_admin_id AND role = 'staff';
    INSERT INTO public.user_roles (user_id, role)
    VALUES (v_admin_id, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;

    -- 3. Tüm projelere admin üyeliği
    INSERT INTO public.proje_uyelikleri (user_id, proje_id, rol)
    SELECT v_admin_id, p.id, 'admin'
    FROM public.projeler p
    ON CONFLICT (user_id, proje_id) DO UPDATE SET rol = 'admin';

    RAISE NOTICE 'ozdemirfa@gmail.com global admin + tüm projelere admin üye olarak atandı';
  ELSE
    RAISE NOTICE 'ozdemirfa@gmail.com auth.users tablosunda bulunamadı — manuel atama gerek';
  END IF;
END $$;

COMMIT;
