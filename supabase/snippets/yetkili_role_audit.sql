-- =============================================================================
-- Yetkili Rol Sistemi — Ops Sağlık Kontrol Sorguları
-- =============================================================================
-- Tarih: 2026-05-23 (PR-C, sprint 20260522-yetkili-role-system)
-- Amaç: Üretimde periyodik çalıştırılabilir read-only sağlık kontrol script'i.
-- Schema değişikliği YOK. Sadece SELECT + RAISE NOTICE.
--
-- Kullanım:
--   psql -h <host> -U postgres -d postgres -f yetkili_role_audit.sql
-- veya Supabase Studio SQL editor'da yapıştır.
-- =============================================================================

DO $$
DECLARE
  v_admin_count INTEGER;
  v_yetkili_count INTEGER;
  v_staff_count INTEGER;
  v_total_users INTEGER;
  v_pending_yetkili_invites INTEGER;
  v_pending_proje_invites INTEGER;
  v_projeler_count INTEGER;
  v_projeler_without_owner INTEGER;
BEGIN
  -- ─── Global rol dağılımı ─────────────────────────────────────────────────
  SELECT COUNT(*) INTO v_total_users FROM auth.users;
  SELECT COUNT(DISTINCT user_id) INTO v_admin_count FROM user_roles WHERE role = 'admin';
  SELECT COUNT(DISTINCT user_id) INTO v_yetkili_count FROM user_roles WHERE role = 'yetkili';
  SELECT COUNT(DISTINCT user_id) INTO v_staff_count FROM user_roles WHERE role = 'staff';

  RAISE NOTICE '═══════════════════════════════════════════════════════════════';
  RAISE NOTICE '  YETKİLİ ROL SİSTEMİ — SAĞLIK RAPORU';
  RAISE NOTICE '═══════════════════════════════════════════════════════════════';
  RAISE NOTICE '';
  RAISE NOTICE 'Toplam auth.users:     %', v_total_users;
  RAISE NOTICE 'Admin sayısı:          %', v_admin_count;
  RAISE NOTICE 'Yetkili sayısı:        %', v_yetkili_count;
  RAISE NOTICE 'Staff sayısı (legacy): %', v_staff_count;
  RAISE NOTICE '';

  -- ─── Admin sayısı kontrolü ───────────────────────────────────────────────
  IF v_admin_count = 0 THEN
    RAISE WARNING '⚠️  KRİTİK: Sistemde hiç admin yok! En az bir admin tanımlanmalı.';
    RAISE WARNING '   Bootstrap için: INSERT INTO user_roles (user_id, role) VALUES (''<auth.users.id>'', ''admin'');';
  END IF;

  -- ─── Davet sayıları ──────────────────────────────────────────────────────
  SELECT COUNT(*) INTO v_pending_yetkili_invites FROM invitations
    WHERE status = 'pending' AND invited_role = 'yetkili';
  SELECT COUNT(*) INTO v_pending_proje_invites FROM invitations
    WHERE status = 'pending' AND invited_role IN ('manager', 'user');

  RAISE NOTICE 'Bekleyen yetkili davetleri: %', v_pending_yetkili_invites;
  RAISE NOTICE 'Bekleyen proje davetleri:   %', v_pending_proje_invites;
  RAISE NOTICE '';

  -- ─── Proje + owner kontrolü ──────────────────────────────────────────────
  SELECT COUNT(*) INTO v_projeler_count FROM projeler;
  SELECT COUNT(*) INTO v_projeler_without_owner FROM projeler p
    WHERE NOT EXISTS (
      SELECT 1 FROM proje_uyelikleri pu
      WHERE pu.proje_id = p.id AND pu.rol = 'owner'
    );

  RAISE NOTICE 'Toplam proje:                 %', v_projeler_count;
  RAISE NOTICE 'Owner''ı olmayan proje sayısı: %', v_projeler_without_owner;

  IF v_projeler_without_owner > 0 THEN
    RAISE WARNING '⚠️  Owner ataması yapılmamış % proje var. Trigger düzgün çalışıyor mu kontrol et.', v_projeler_without_owner;
  END IF;

  RAISE NOTICE '';
  RAISE NOTICE '═══════════════════════════════════════════════════════════════';
  RAISE NOTICE '  Rapor tamamlandı.';
  RAISE NOTICE '═══════════════════════════════════════════════════════════════';
END $$;

-- ─── Detay sorguları (yorumlanmış, ihtiyaca göre aç) ──────────────────────

-- Admin listesi:
-- SELECT u.id, u.email, ur.created_at
-- FROM user_roles ur JOIN auth.users u ON u.id = ur.user_id
-- WHERE ur.role = 'admin' ORDER BY ur.created_at;

-- Yetkili listesi (proje sayısıyla birlikte):
-- SELECT
--   u.id,
--   u.email,
--   ur.created_at AS yetkili_atanma_tarihi,
--   COUNT(DISTINCT pu.proje_id) FILTER (WHERE pu.rol = 'owner') AS sahip_oldugu_proje_sayisi
-- FROM user_roles ur
-- JOIN auth.users u ON u.id = ur.user_id
-- LEFT JOIN proje_uyelikleri pu ON pu.user_id = u.id
-- WHERE ur.role = 'yetkili'
-- GROUP BY u.id, u.email, ur.created_at
-- ORDER BY ur.created_at;

-- Owner'ı olmayan proje detayı (varsa):
-- SELECT p.id, p.proje_adi, p.created_at
-- FROM projeler p
-- WHERE NOT EXISTS (SELECT 1 FROM proje_uyelikleri pu WHERE pu.proje_id = p.id AND pu.rol = 'owner');

-- Süresi dolmuş pending davetler (cleanup adayı):
-- SELECT id, email, invited_role, expires_at, created_at
-- FROM invitations
-- WHERE status = 'pending' AND expires_at < now()
-- ORDER BY expires_at;
