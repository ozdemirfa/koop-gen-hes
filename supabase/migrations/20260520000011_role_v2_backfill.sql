-- Migration: 20260520000011_role_v2_backfill.sql
-- Sprint: role-system-modernization (PR-A faz 2/4 — Backfill)
-- Description: Mevcut admin/staff/viewer üyeliklerini yeni owner/manager/user
-- modeline migrate eder ve projeler.owner_user_id'yi doldurur.
--
-- KURALLAR:
--   1. Her proje için: rolü 'admin' olan en eski (created_at ASC) üye → owner.
--   2. Hiç admin yoksa: en eski 'staff' → owner. Yoksa en eski herhangi bir üye → owner.
--   3. Hiç üye yoksa: RAISE NOTICE (manuel müdahale gerek).
--   4. owner seçilmeyen 'admin' kayıtları → manager
--   5. 'staff' → manager
--   6. 'viewer' → user
--   7. projeler.owner_user_id NOT NULL'a çekilir (backfill sonrası boş kalan proje varsa fail).
--   8. UNIQUE INDEX: her projede en fazla 1 owner.
--
-- Idempotent: tekrar çalıştırılırsa tutarlı durum üretir.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Owner belirleme + projeler.owner_user_id doldurma
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_proje RECORD;
  v_owner_id UUID;
  v_orphan_count INT := 0;
BEGIN
  FOR v_proje IN SELECT id, proje_adi FROM public.projeler ORDER BY created_at LOOP
    v_owner_id := NULL;

    -- 1. Önce 'admin' veya 'owner' olan en eski üye
    SELECT user_id INTO v_owner_id
    FROM public.proje_uyelikleri
    WHERE proje_id = v_proje.id
      AND rol IN ('admin','owner')
    ORDER BY created_at ASC, user_id ASC
    LIMIT 1;

    -- 2. Yoksa 'staff' veya 'manager' en eski
    IF v_owner_id IS NULL THEN
      SELECT user_id INTO v_owner_id
      FROM public.proje_uyelikleri
      WHERE proje_id = v_proje.id
        AND rol IN ('staff','manager')
      ORDER BY created_at ASC, user_id ASC
      LIMIT 1;
    END IF;

    -- 3. Yoksa projenin herhangi bir üyesi
    IF v_owner_id IS NULL THEN
      SELECT user_id INTO v_owner_id
      FROM public.proje_uyelikleri
      WHERE proje_id = v_proje.id
      ORDER BY created_at ASC, user_id ASC
      LIMIT 1;
    END IF;

    IF v_owner_id IS NULL THEN
      RAISE NOTICE 'Proje "%" (%) üyesiz — owner_user_id NULL kalacak, manuel müdahale gerek',
        v_proje.proje_adi, v_proje.id;
      v_orphan_count := v_orphan_count + 1;
    ELSE
      UPDATE public.projeler SET owner_user_id = v_owner_id WHERE id = v_proje.id;
      -- proje_uyelikleri'nde de owner rolüne yükselt
      UPDATE public.proje_uyelikleri
      SET rol = 'owner'
      WHERE user_id = v_owner_id AND proje_id = v_proje.id;
    END IF;
  END LOOP;

  IF v_orphan_count > 0 THEN
    RAISE NOTICE 'Toplam % adet projede owner belirlenemedi. UNIQUE INDEX ve NOT NULL constraint manuel müdahaleden sonra eklenmeli.', v_orphan_count;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Kalan eski rolleri yeni modele migrate et
-- ---------------------------------------------------------------------------
-- 'admin' (owner olarak seçilmeyen) → manager
UPDATE public.proje_uyelikleri SET rol = 'manager' WHERE rol = 'admin';
-- 'staff' → manager
UPDATE public.proje_uyelikleri SET rol = 'manager' WHERE rol = 'staff';
-- 'viewer' → user
UPDATE public.proje_uyelikleri SET rol = 'user' WHERE rol = 'viewer';

-- ---------------------------------------------------------------------------
-- 3. UNIQUE INDEX: her projede en fazla 1 owner
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS proje_uyelikleri_one_owner_per_project
  ON public.proje_uyelikleri (proje_id)
  WHERE rol = 'owner';

-- ---------------------------------------------------------------------------
-- 4. projeler.owner_user_id NOT NULL (sadece tüm projelerde dolu ise)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_null_count INT;
BEGIN
  SELECT COUNT(*) INTO v_null_count
  FROM public.projeler
  WHERE owner_user_id IS NULL;

  IF v_null_count = 0 THEN
    ALTER TABLE public.projeler ALTER COLUMN owner_user_id SET NOT NULL;
    RAISE NOTICE 'projeler.owner_user_id NOT NULL constraint eklendi';
  ELSE
    RAISE WARNING 'projeler.owner_user_id NULL olan % proje var — NOT NULL constraint eklenmedi. Manuel müdahale sonrası ALTER TABLE çalıştırılmalı.', v_null_count;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 5. Doğrulama raporu
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_total_projeler INT;
  v_owner_count INT;
  v_manager_count INT;
  v_user_count INT;
  v_legacy_count INT;
BEGIN
  SELECT COUNT(*) INTO v_total_projeler FROM public.projeler;
  SELECT COUNT(*) INTO v_owner_count FROM public.proje_uyelikleri WHERE rol = 'owner';
  SELECT COUNT(*) INTO v_manager_count FROM public.proje_uyelikleri WHERE rol = 'manager';
  SELECT COUNT(*) INTO v_user_count FROM public.proje_uyelikleri WHERE rol = 'user';
  SELECT COUNT(*) INTO v_legacy_count FROM public.proje_uyelikleri WHERE rol IN ('admin','staff','viewer');

  RAISE NOTICE 'BACKFILL RAPORU:';
  RAISE NOTICE '  Toplam proje: %', v_total_projeler;
  RAISE NOTICE '  Owner üyelik: %', v_owner_count;
  RAISE NOTICE '  Manager üyelik: %', v_manager_count;
  RAISE NOTICE '  User üyelik: %', v_user_count;
  RAISE NOTICE '  Legacy (admin/staff/viewer) kalan: % (faz 3''te sıfırlanacak)', v_legacy_count;
END $$;

COMMIT;
